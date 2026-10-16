import { config } from "dotenv";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../../.env") });
import express from "express";
import cors from "cors";
import { randomUUID } from "crypto";
import { planScenes, SCENARIOS } from "./scene-planner.js";
import { generatePanorama } from "./panorama.js";
import { createSceneVideo, mergeVideos } from "./ffmpeg.js";
import { sendEmail } from "./email.js";
import { jobs, updateJob } from "./jobs.js";
import { generateAcrophobiaScene } from "./sdxl-pipeline.js";
import { postProcessSVDForVR, convertToEquirectangular, injectVRMetadata } from "./vr-export.js";

const app = express();
app.use(cors());
app.use(express.json());

const PROJECT_ROOT = path.resolve(__dirname, "../../");
const OUTPUT_DIR = process.env.OUTPUT_DIR || path.join(PROJECT_ROOT, "data/videos");
const TEMP_DIR = process.env.TEMP_DIR || path.join(PROJECT_ROOT, "data/temp");
const PANORAMA_DIR = process.env.PANORAMA_DIR || path.join(PROJECT_ROOT, "data/panoramas");

// Gerekli dizinleri oluştur
for (const dir of [OUTPUT_DIR, TEMP_DIR, PANORAMA_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

// ─── Sağlık kontrolü ───
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── Yeni terapi videosu üretim işi başlat ───
app.post("/api/jobs", async (req, res) => {
  const { scenarioId, scenarioTitle, userEmail } = req.body;

  if (!scenarioId || !scenarioTitle) {
    return res.status(400).json({ error: "scenarioId ve scenarioTitle gerekli" });
  }

  const jobId = randomUUID();
  const job = {
    id: jobId,
    scenarioId,
    scenarioTitle,
    userEmail: userEmail || null,
    status: "queued",
    progress: 0,
    scenes: [],
    videoUrl: null,
    error: null,
    createdAt: new Date().toISOString(),
  };
  jobs.set(jobId, job);

  // Arka planda pipeline'ı başlat
  runPipeline(job).catch((err) => {
    updateJob(jobId, { status: "failed", error: err.message });
  });

  res.status(201).json({ jobId, status: "queued" });
});

// ─── İş durumu sorgula ───
app.get("/api/jobs/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "İş bulunamadı" });
  res.json(job);
});

// ─── Video indirme ───
app.get("/api/jobs/:id/download", (req, res) => {
  const jobId = req.params.id;
  // UUID formatı doğrulaması (path traversal koruması)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) {
    return res.status(400).json({ error: "Geçersiz iş ID formatı" });
  }
  const job = jobs.get(jobId);
  if (!job) return res.status(404).json({ error: "İş bulunamadı" });
  if (job.status !== "completed" || !job.videoUrl) {
    return res.status(400).json({ error: "Video henüz hazır değil" });
  }
  const filePath = path.join(OUTPUT_DIR, `${jobId}.mp4`);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Video dosyası bulunamadı" });
  }
  res.download(filePath, `vr-therapy-${job.scenarioId}.mp4`);
});

// ─── Tüm işleri listele ───
app.get("/api/jobs", (_req, res) => {
  const allJobs = Array.from(jobs.values()).map(
    ({ id, scenarioId, scenarioTitle, status, progress, createdAt, videoUrl }) => ({
      id,
      scenarioId,
      scenarioTitle,
      status,
      progress,
      createdAt,
      videoUrl,
    })
  );
  res.json(allJobs);
});

// ─── Video dosyalarını statik servis et ───
app.use("/videos", express.static(OUTPUT_DIR));

// ─── Pipeline ───
async function runPipeline(job) {
  const { id: jobId, scenarioId, scenarioTitle } = job;

  // Adım 1: Sahne planlama
  updateJob(jobId, { status: "planning", progress: 10 });
  const scenes = await planScenes(scenarioId, scenarioTitle);
  updateJob(jobId, { scenes, progress: 20 });

  // Senaryo yapılandırmasını al
  const scenario = SCENARIOS[scenarioId];
  const useSDXL = scenario?.pipeline === "sdxl";

  if (useSDXL) {
    // ══════════════════════════════════════════════════
    // SDXL Pipeline (acrophobia): SDXL → ControlNet Depth → SVD
    // ══════════════════════════════════════════════════
    await runSDXLPipeline(job, scenes, scenario);
  } else {
    // ══════════════════════════════════════════════════
    // Standard Pipeline (SD 1.5): Panorama → FFmpeg Ken Burns
    // ══════════════════════════════════════════════════
    await runStandardPipeline(job, scenes);
  }

  // Tamamlandı
  const videoUrl = `/videos/${jobId}.mp4`;
  updateJob(jobId, { status: "completed", progress: 100, videoUrl });

  // Opsiyonel: e-posta gönder
  if (job.userEmail) {
    try {
      await sendEmail(job.userEmail, scenarioTitle, videoUrl);
    } catch (emailErr) {
      console.error("E-posta gönderilemedi:", emailErr.message);
    }
  }

  // Geçici dosyaları temizle
  for (const p of (job._tempFiles || [])) {
    fs.unlink(p, () => {});
  }
}

// ═══════════════════════════════════════════
// SDXL Pipeline — Acrophobia (SDXL + ControlNet Depth + SVD)
// ═══════════════════════════════════════════
async function runSDXLPipeline(job, scenes, scenario) {
  const { id: jobId } = job;
  const tempFiles = [];
  job._tempFiles = tempFiles;

  const renderSettings = scenario.renderSettings || {};
  const svdSettings = scenario.svdSettings || {};

  // Adım 2: Her sahne için SDXL + ControlNet Depth + SVD
  updateJob(jobId, { status: "generating_sdxl", progress: 25 });
  const sceneVideoPaths = [];

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const imagePath = path.join(PANORAMA_DIR, `${jobId}_scene_${i}_refined.png`);
    const svdVideoPath = path.join(TEMP_DIR, `${jobId}_scene_${i}_svd.mp4`);
    const vrVideoPath = path.join(TEMP_DIR, `${jobId}_scene_${i}_vr.mp4`);

    try {
      // SDXL → ControlNet Depth → SVD (all via ComfyUI)
      updateJob(jobId, {
        status: `sdxl_scene_${i + 1}`,
        progress: 25 + Math.round(((i) / scenes.length) * 50),
      });

      const mergedSvdSettings = { ...svdSettings, ...scene.svdOverrides };
      const sceneRenderSettings = scene.seed
        ? { ...renderSettings, seed: scene.seed }
        : renderSettings;

      await generateAcrophobiaScene(
        scene.prompt,
        scene.negativePrompt,
        imagePath,
        svdVideoPath,
        { renderSettings: sceneRenderSettings, svdSettings: mergedSvdSettings }
      );

      tempFiles.push(imagePath, svdVideoPath);

      // Post-process SVD video for VR (extend duration, smooth FPS)
      updateJob(jobId, {
        status: `vr_processing_${i + 1}`,
        progress: 25 + Math.round(((i + 0.7) / scenes.length) * 50),
      });
      await postProcessSVDForVR(svdVideoPath, vrVideoPath, {
        targetDuration: 15,
        targetFps: 30,
      });

      sceneVideoPaths.push(vrVideoPath);
      tempFiles.push(vrVideoPath);

    } catch (err) {
      // Fallback: if SDXL/SVD pipeline fails, use standard panorama + Ken Burns
      console.warn(`[pipeline] SDXL failed for scene ${i} (${err.message}), falling back to standard`);
      const panoPath = path.join(PANORAMA_DIR, `${jobId}_scene_${i}.png`);
      await generatePanorama(scene.prompt, scene.negativePrompt, panoPath);
      const fallbackVideoPath = path.join(TEMP_DIR, `${jobId}_scene_${i}.mp4`);
      await createSceneVideo(panoPath, fallbackVideoPath);
      sceneVideoPaths.push(fallbackVideoPath);
      tempFiles.push(panoPath, fallbackVideoPath);
    }

    updateJob(jobId, {
      progress: 25 + Math.round(((i + 1) / scenes.length) * 50),
    });
  }

  // Adım 3: Videoları birleştir
  updateJob(jobId, { status: "merging", progress: 80 });
  const finalPath = path.join(OUTPUT_DIR, `${jobId}.mp4`);
  await mergeVideos(sceneVideoPaths, finalPath);

  // Adım 4: VR metadata ekle
  updateJob(jobId, { status: "vr_metadata", progress: 90 });
  const vrFinalPath = path.join(OUTPUT_DIR, `${jobId}_vr.mp4`);
  await injectVRMetadata(finalPath, vrFinalPath, { is360: false });
  // Replace original with VR version
  fs.renameSync(vrFinalPath, finalPath);
}

// ═══════════════════════════════════════════
// Standard Pipeline — SD 1.5 (Panorama → FFmpeg Ken Burns)
// ═══════════════════════════════════════════
async function runStandardPipeline(job, scenes) {
  const { id: jobId } = job;
  const tempFiles = [];
  job._tempFiles = tempFiles;

  // Adım 2: Her sahne için panorama üret
  updateJob(jobId, { status: "generating_panoramas", progress: 25 });
  const panoramaPaths = [];
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const panoPath = path.join(PANORAMA_DIR, `${jobId}_scene_${i}.png`);
    await generatePanorama(scene.prompt, scene.negativePrompt, panoPath);
    panoramaPaths.push(panoPath);
    tempFiles.push(panoPath);
    const panoProgress = 25 + Math.round(((i + 1) / scenes.length) * 35);
    updateJob(jobId, { progress: panoProgress });
  }

  // Adım 3: Her panoramadan video üret
  updateJob(jobId, { status: "creating_videos", progress: 65 });
  const sceneVideoPaths = [];
  for (let i = 0; i < panoramaPaths.length; i++) {
    const videoPath = path.join(TEMP_DIR, `${jobId}_scene_${i}.mp4`);
    await createSceneVideo(panoramaPaths[i], videoPath);
    sceneVideoPaths.push(videoPath);
    tempFiles.push(videoPath);
    const vidProgress = 65 + Math.round(((i + 1) / scenes.length) * 15);
    updateJob(jobId, { progress: vidProgress });
  }

  // Adım 4: Videoları birleştir
  updateJob(jobId, { status: "merging", progress: 85 });
  const finalPath = path.join(OUTPUT_DIR, `${jobId}.mp4`);
  await mergeVideos(sceneVideoPaths, finalPath);
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Media Service çalışıyor: http://localhost:${PORT}`);
});
