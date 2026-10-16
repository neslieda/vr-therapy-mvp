import fs from "fs";
import fetch from "node-fetch";

const COMFYUI_API_URL = process.env.COMFYUI_API_URL || "http://localhost:8188";

// ─── SDXL Checkpoint & model configuration ───
const SDXL_CHECKPOINT = process.env.SDXL_CHECKPOINT || "juggernautXL_v9Rundiffusion.safetensors";
const CONTROLNET_DEPTH_MODEL = process.env.CONTROLNET_DEPTH_MODEL || "diffusers_xl_depth_full.safetensors";
const DEPTH_PREPROCESSOR_MODEL = process.env.DEPTH_PREPROCESSOR_MODEL || "depth_anything_vitl14.pth";
const SVD_MODEL = process.env.SVD_MODEL || "svd_xt_1_1.safetensors";

// ─── Default render settings (SDXL optimized) ───
const DEFAULT_RENDER_SETTINGS = {
  width: 1024,
  height: 1024,
  steps: 35,
  cfg: 6.0,
  sampler: "dpmpp_2m",
  scheduler: "karras",
  // ControlNet depth refinement
  depthStrength: 0.65,
  depthStartPercent: 0.0,
  depthEndPercent: 0.85,
  refineDenoise: 0.45,
  refineCfg: 5.5,
  refineSteps: 25,
};

// ─── SVD settings ───
const DEFAULT_SVD_SETTINGS = {
  width: 1024,
  height: 576,
  videoFrames: 25,
  motionBucketId: 40,  // low = subtle motion (good for vertigo sway)
  fps: 6,
  augmentationLevel: 0.02,
  steps: 20,
  cfg: 2.5,
  pingpong: true,       // smooth loop for VR
};

// ══════════════════════════════════════════════
// PASS 1: SDXL Base Generation
// ══════════════════════════════════════════════
function buildSDXLBaseWorkflow(prompt, negativePrompt, settings = {}) {
  const s = { ...DEFAULT_RENDER_SETTINGS, ...settings };
  const seed = settings.seed ?? Math.floor(Math.random() * 2147483647);

  return {
    "1": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: SDXL_CHECKPOINT },
    },
    "2": {
      class_type: "CLIPTextEncode",
      inputs: { text: prompt, clip: ["1", 1] },
    },
    "3": {
      class_type: "CLIPTextEncode",
      inputs: { text: negativePrompt, clip: ["1", 1] },
    },
    "4": {
      class_type: "EmptyLatentImage",
      inputs: { width: s.width, height: s.height, batch_size: 1 },
    },
    "5": {
      class_type: "KSampler",
      inputs: {
        model: ["1", 0],
        positive: ["2", 0],
        negative: ["3", 0],
        latent_image: ["4", 0],
        seed,
        steps: s.steps,
        cfg: s.cfg,
        sampler_name: s.sampler,
        scheduler: s.scheduler,
        denoise: 1.0,
      },
    },
    "6": {
      class_type: "VAEDecode",
      inputs: { samples: ["5", 0], vae: ["1", 2] },
    },
    "7": {
      class_type: "SaveImage",
      inputs: { images: ["6", 0], filename_prefix: "sdxl_base" },
    },
  };
}

// ══════════════════════════════════════════════
// PASS 2: Depth Extraction + ControlNet Refinement
// ══════════════════════════════════════════════
function buildDepthRefinementWorkflow(prompt, negativePrompt, settings = {}) {
  const s = { ...DEFAULT_RENDER_SETTINGS, ...settings };
  const seed = settings.seed ?? Math.floor(Math.random() * 2147483647);

  return {
    // Load same checkpoint
    "1": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: SDXL_CHECKPOINT },
    },
    "2": {
      class_type: "CLIPTextEncode",
      inputs: { text: prompt, clip: ["1", 1] },
    },
    "3": {
      class_type: "CLIPTextEncode",
      inputs: { text: negativePrompt, clip: ["1", 1] },
    },
    // Load base image for depth extraction
    "8": {
      class_type: "LoadImage",
      inputs: { image: "__BASE_IMAGE__" },
    },
    // Image to latent for img2img refinement
    "9": {
      class_type: "VAEEncode",
      inputs: { pixels: ["8", 0], vae: ["1", 2] },
    },
    // Depth extraction
    "10": {
      class_type: "DepthAnythingPreprocessor",
      inputs: {
        image: ["8", 0],
        ckpt_name: DEPTH_PREPROCESSOR_MODEL,
        resolution: s.width,
      },
    },
    "11": {
      class_type: "SaveImage",
      inputs: { images: ["10", 0], filename_prefix: "depth_map" },
    },
    // ControlNet
    "12": {
      class_type: "ControlNetLoader",
      inputs: { control_net_name: CONTROLNET_DEPTH_MODEL },
    },
    "13": {
      class_type: "ControlNetApplyAdvanced",
      inputs: {
        positive: ["2", 0],
        negative: ["3", 0],
        control_net: ["12", 0],
        image: ["10", 0],
        strength: s.depthStrength,
        start_percent: s.depthStartPercent,
        end_percent: s.depthEndPercent,
      },
    },
    // Refine with depth-guided conditioning
    "14": {
      class_type: "KSampler",
      inputs: {
        model: ["1", 0],
        positive: ["13", 0],
        negative: ["13", 1],
        latent_image: ["9", 0],
        seed: seed + 1,
        steps: s.refineSteps,
        cfg: s.refineCfg,
        sampler_name: s.sampler,
        scheduler: s.scheduler,
        denoise: s.refineDenoise,
      },
    },
    "15": {
      class_type: "VAEDecode",
      inputs: { samples: ["14", 0], vae: ["1", 2] },
    },
    "16": {
      class_type: "SaveImage",
      inputs: { images: ["15", 0], filename_prefix: "depth_refined" },
    },
  };
}

// ══════════════════════════════════════════════
// PASS 3: Stable Video Diffusion
// ══════════════════════════════════════════════
function buildSVDWorkflow(settings = {}) {
  const svd = { ...DEFAULT_SVD_SETTINGS, ...settings };
  const seed = settings.seed ?? Math.floor(Math.random() * 2147483647);

  return {
    // Load input image
    "18": {
      class_type: "LoadImage",
      inputs: { image: "__INPUT_IMAGE__" },
    },
    // SVD model
    "20": {
      class_type: "ImageOnlyCheckpointLoader",
      inputs: { ckpt_name: SVD_MODEL },
    },
    "21": {
      class_type: "SVD_img2vid_Conditioning",
      inputs: {
        clip_vision: ["20", 1],
        init_image: ["18", 0],
        vae: ["20", 2],
        width: svd.width,
        height: svd.height,
        video_frames: svd.videoFrames,
        motion_bucket_id: svd.motionBucketId,
        fps: svd.fps,
        augmentation_level: svd.augmentationLevel,
      },
    },
    "22": {
      class_type: "KSampler",
      inputs: {
        model: ["20", 0],
        positive: ["21", 0],
        negative: ["21", 1],
        latent_image: ["21", 2],
        seed,
        steps: svd.steps,
        cfg: svd.cfg,
        sampler_name: "euler",
        scheduler: "karras",
        denoise: 1.0,
      },
    },
    "23": {
      class_type: "VAEDecode",
      inputs: { samples: ["22", 0], vae: ["20", 2] },
    },
    "24": {
      class_type: "VHS_VideoCombine",
      inputs: {
        images: ["23", 0],
        frame_rate: svd.fps,
        loop_count: 0,
        filename_prefix: "svd_video",
        format: "video/h264-mp4",
        pingpong: svd.pingpong,
        save_output: true,
      },
    },
  };
}

// ══════════════════════════════════════════════
// COMBINED: Full single-pass workflow (base + depth + SVD)
// Used when running everything on one ComfyUI queue
// ══════════════════════════════════════════════
function buildFullAcrophobiaWorkflow(prompt, negativePrompt, settings = {}) {
  const s = { ...DEFAULT_RENDER_SETTINGS, ...settings };
  const svd = { ...DEFAULT_SVD_SETTINGS, ...settings.svd };
  const seed = settings.seed ?? Math.floor(Math.random() * 2147483647);

  return {
    // ── SDXL Base ──
    "1": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: SDXL_CHECKPOINT },
    },
    "2": {
      class_type: "CLIPTextEncode",
      inputs: { text: prompt, clip: ["1", 1] },
    },
    "3": {
      class_type: "CLIPTextEncode",
      inputs: { text: negativePrompt, clip: ["1", 1] },
    },
    "4": {
      class_type: "EmptyLatentImage",
      inputs: { width: s.width, height: s.height, batch_size: 1 },
    },
    "5": {
      class_type: "KSampler",
      inputs: {
        model: ["1", 0],
        positive: ["2", 0],
        negative: ["3", 0],
        latent_image: ["4", 0],
        seed,
        steps: s.steps,
        cfg: s.cfg,
        sampler_name: s.sampler,
        scheduler: s.scheduler,
        denoise: 1.0,
      },
    },
    "6": {
      class_type: "VAEDecode",
      inputs: { samples: ["5", 0], vae: ["1", 2] },
    },
    "7": {
      class_type: "SaveImage",
      inputs: { images: ["6", 0], filename_prefix: "acro_base" },
    },

    // ── Depth Extraction ──
    "10": {
      class_type: "DepthAnythingPreprocessor",
      inputs: {
        image: ["6", 0],
        ckpt_name: DEPTH_PREPROCESSOR_MODEL,
        resolution: s.width,
      },
    },
    "11": {
      class_type: "SaveImage",
      inputs: { images: ["10", 0], filename_prefix: "acro_depth" },
    },

    // ── ControlNet Depth Refinement ──
    "12": {
      class_type: "ControlNetLoader",
      inputs: { control_net_name: CONTROLNET_DEPTH_MODEL },
    },
    "13": {
      class_type: "ControlNetApplyAdvanced",
      inputs: {
        positive: ["2", 0],
        negative: ["3", 0],
        control_net: ["12", 0],
        image: ["10", 0],
        strength: s.depthStrength,
        start_percent: s.depthStartPercent,
        end_percent: s.depthEndPercent,
      },
    },
    "14": {
      class_type: "KSampler",
      inputs: {
        model: ["1", 0],
        positive: ["13", 0],
        negative: ["13", 1],
        latent_image: ["5", 0],
        seed: seed + 1,
        steps: s.refineSteps,
        cfg: s.refineCfg,
        sampler_name: s.sampler,
        scheduler: s.scheduler,
        denoise: s.refineDenoise,
      },
    },
    "15": {
      class_type: "VAEDecode",
      inputs: { samples: ["14", 0], vae: ["1", 2] },
    },
    "16": {
      class_type: "SaveImage",
      inputs: { images: ["15", 0], filename_prefix: "acro_refined" },
    },

    // ── Stable Video Diffusion ──
    "20": {
      class_type: "ImageOnlyCheckpointLoader",
      inputs: { ckpt_name: SVD_MODEL },
    },
    "21": {
      class_type: "SVD_img2vid_Conditioning",
      inputs: {
        clip_vision: ["20", 1],
        init_image: ["15", 0],
        vae: ["20", 2],
        width: svd.width,
        height: svd.height,
        video_frames: svd.videoFrames,
        motion_bucket_id: svd.motionBucketId,
        fps: svd.fps,
        augmentation_level: svd.augmentationLevel,
      },
    },
    "22": {
      class_type: "KSampler",
      inputs: {
        model: ["20", 0],
        positive: ["21", 0],
        negative: ["21", 1],
        latent_image: ["21", 2],
        seed: seed + 2,
        steps: svd.steps,
        cfg: svd.cfg,
        sampler_name: "euler",
        scheduler: "karras",
        denoise: 1.0,
      },
    },
    "23": {
      class_type: "VAEDecode",
      inputs: { samples: ["22", 0], vae: ["20", 2] },
    },
    "24": {
      class_type: "VHS_VideoCombine",
      inputs: {
        images: ["23", 0],
        frame_rate: svd.fps,
        loop_count: 0,
        filename_prefix: "acro_svd",
        format: "video/h264-mp4",
        pingpong: svd.pingpong,
        save_output: true,
      },
    },
  };
}

// ══════════════════════════════════════════════
// API: Run full SDXL acrophobia pipeline
// ══════════════════════════════════════════════
export async function generateAcrophobiaScene(prompt, negativePrompt, outputImagePath, outputVideoPath, options = {}) {
  const { renderSettings, svdSettings, skipSVD = false } = options;

  try {
    await checkComfyUIHealth();

    // ── Step 1: Generate base image with SDXL ──
    console.log("[sdxl-pipeline] Pass 1: SDXL base generation...");
    const baseResult = await queueAndWait(
      { prompt: buildSDXLBaseWorkflow(prompt, negativePrompt, renderSettings) },
      "image"
    );
    console.log("[sdxl-pipeline] Base image generated:", baseResult.filename);

    // Upload base image to ComfyUI input for depth pass
    const baseImageBuffer = await downloadFromComfyUI(baseResult);
    const uploadedName = await uploadToComfyUI(baseImageBuffer, "acro_base_input.png");

    // ── Step 2: Depth extraction + ControlNet refinement ──
    console.log("[sdxl-pipeline] Pass 2: Depth extraction + ControlNet refinement...");
    const depthWorkflow = buildDepthRefinementWorkflow(prompt, negativePrompt, renderSettings);
    depthWorkflow["8"].inputs.image = uploadedName;

    const refinedResult = await queueAndWait(
      { prompt: depthWorkflow },
      "image",
      // Look for the refined output (node 16), not the depth map (node 11)
      (outputs) => {
        for (const nodeId of Object.keys(outputs)) {
          const images = outputs[nodeId]?.images;
          if (images) {
            const refined = images.find(img => img.filename.startsWith("depth_refined"));
            if (refined) return refined;
          }
        }
        return null;
      }
    );
    console.log("[sdxl-pipeline] Depth-refined image:", refinedResult.filename);

    // Save refined image
    const refinedBuffer = await downloadFromComfyUI(refinedResult);
    fs.writeFileSync(outputImagePath, refinedBuffer);
    console.log("[sdxl-pipeline] Refined image saved:", outputImagePath);

    if (skipSVD || !outputVideoPath) {
      return { imagePath: outputImagePath, videoPath: null };
    }

    // ── Step 3: Stable Video Diffusion ──
    console.log("[sdxl-pipeline] Pass 3: Stable Video Diffusion...");
    const refinedUploadName = await uploadToComfyUI(refinedBuffer, "acro_refined_input.png");
    const svdWorkflow = buildSVDWorkflow(svdSettings);
    svdWorkflow["18"].inputs.image = refinedUploadName;

    const svdResult = await queueAndWait(
      { prompt: svdWorkflow },
      "video",
      (outputs) => {
        for (const nodeId of Object.keys(outputs)) {
          const gifs = outputs[nodeId]?.gifs;
          if (gifs && gifs.length > 0) return gifs[0];
          const videos = outputs[nodeId]?.videos;
          if (videos && videos.length > 0) return videos[0];
        }
        return null;
      }
    );
    console.log("[sdxl-pipeline] SVD video generated:", svdResult.filename);

    // Download SVD video
    const videoBuffer = await downloadFromComfyUI(svdResult);
    fs.writeFileSync(outputVideoPath, videoBuffer);
    console.log("[sdxl-pipeline] SVD video saved:", outputVideoPath);

    return { imagePath: outputImagePath, videoPath: outputVideoPath };
  } catch (err) {
    console.error(`[sdxl-pipeline] Pipeline failed: ${err.message}`);
    throw err;
  }
}

// ══════════════════════════════════════════════
// API: Single-pass full workflow (more VRAM efficient)
// ══════════════════════════════════════════════
export async function generateAcrophobiaSceneFull(prompt, negativePrompt, outputImagePath, outputVideoPath, options = {}) {
  try {
    await checkComfyUIHealth();

    console.log("[sdxl-pipeline] Running full acrophobia pipeline (single queue)...");
    const workflow = buildFullAcrophobiaWorkflow(prompt, negativePrompt, {
      ...options.renderSettings,
      svd: options.svdSettings,
    });

    const promptId = await queueWorkflow({ prompt: workflow });

    // Wait for completion and collect all outputs
    const allOutputs = await pollForAllOutputs(promptId);

    // Extract refined image (node 16)
    const refinedImage = findOutput(allOutputs, "acro_refined", "images");
    if (refinedImage) {
      const imgBuffer = await downloadFromComfyUI(refinedImage);
      fs.writeFileSync(outputImagePath, imgBuffer);
      console.log("[sdxl-pipeline] Refined image saved:", outputImagePath);
    }

    // Extract SVD video (node 24)
    const svdVideo = findOutput(allOutputs, "acro_svd", "gifs") ||
                     findOutput(allOutputs, "acro_svd", "videos");
    if (svdVideo && outputVideoPath) {
      const vidBuffer = await downloadFromComfyUI(svdVideo);
      fs.writeFileSync(outputVideoPath, vidBuffer);
      console.log("[sdxl-pipeline] SVD video saved:", outputVideoPath);
    }

    return { imagePath: outputImagePath, videoPath: outputVideoPath };
  } catch (err) {
    console.error(`[sdxl-pipeline] Full pipeline failed: ${err.message}`);
    throw err;
  }
}

// ══════════════════════════════════════════════
// ComfyUI API helpers
// ══════════════════════════════════════════════

async function checkComfyUIHealth() {
  const res = await fetch(`${COMFYUI_API_URL}/system_stats`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error("ComfyUI unreachable");
}

async function queueWorkflow(workflow) {
  const res = await fetch(`${COMFYUI_API_URL}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(workflow),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ComfyUI queue error ${res.status}: ${text}`);
  }
  const { prompt_id } = await res.json();
  return prompt_id;
}

async function queueAndWait(workflow, outputType = "image", extractFn = null, maxWaitMs = 600000) {
  const promptId = await queueWorkflow(workflow);
  return pollForResult(promptId, outputType, extractFn, maxWaitMs);
}

async function pollForResult(promptId, outputType = "image", extractFn = null, maxWaitMs = 600000) {
  const startTime = Date.now();
  const pollInterval = 3000;

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const res = await fetch(`${COMFYUI_API_URL}/history/${promptId}`);
      const data = await res.json();

      if (data[promptId]?.outputs) {
        const outputs = data[promptId].outputs;

        if (extractFn) {
          const result = extractFn(outputs);
          if (result) return result;
        } else {
          // Default: find first image or video output
          for (const nodeId of Object.keys(outputs)) {
            if (outputType === "video") {
              const gifs = outputs[nodeId]?.gifs;
              if (gifs?.length > 0) return gifs[0];
              const videos = outputs[nodeId]?.videos;
              if (videos?.length > 0) return videos[0];
            }
            const images = outputs[nodeId]?.images;
            if (images?.length > 0) return images[0];
          }
        }
      }
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, pollInterval));
  }
  throw new Error(`ComfyUI prompt ${promptId} timed out after ${maxWaitMs / 1000}s`);
}

async function pollForAllOutputs(promptId, maxWaitMs = 900000) {
  const startTime = Date.now();
  const pollInterval = 4000;

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const res = await fetch(`${COMFYUI_API_URL}/history/${promptId}`);
      const data = await res.json();

      if (data[promptId]?.status?.completed) {
        return data[promptId].outputs;
      }
      if (data[promptId]?.outputs) {
        // Check if the last node (SVD) has output
        const outputs = data[promptId].outputs;
        const hasVideo = Object.values(outputs).some(
          (o) => o.gifs?.length > 0 || o.videos?.length > 0
        );
        if (hasVideo) return outputs;
      }
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, pollInterval));
  }
  throw new Error(`Full pipeline timed out after ${maxWaitMs / 1000}s`);
}

function findOutput(outputs, prefix, key) {
  for (const nodeId of Object.keys(outputs)) {
    const items = outputs[nodeId]?.[key];
    if (items) {
      const match = items.find((item) => item.filename?.startsWith(prefix));
      if (match) return match;
    }
  }
  return null;
}

async function downloadFromComfyUI(fileInfo) {
  const params = new URLSearchParams({
    filename: fileInfo.filename,
    subfolder: fileInfo.subfolder || "",
    type: fileInfo.type || "output",
  });
  const res = await fetch(`${COMFYUI_API_URL}/view?${params}`);
  if (!res.ok) throw new Error(`Failed to download ${fileInfo.filename}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function uploadToComfyUI(buffer, filename) {
  const FormData = (await import("form-data")).default;
  const form = new FormData();
  form.append("image", buffer, { filename, contentType: "image/png" });
  form.append("overwrite", "true");

  const res = await fetch(`${COMFYUI_API_URL}/upload/image`, {
    method: "POST",
    body: form,
    headers: form.getHeaders(),
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  const data = await res.json();
  return data.name;
}

// ── Exports ──
export {
  buildSDXLBaseWorkflow,
  buildDepthRefinementWorkflow,
  buildSVDWorkflow,
  buildFullAcrophobiaWorkflow,
  DEFAULT_RENDER_SETTINGS,
  DEFAULT_SVD_SETTINGS,
};
