import fs from "fs";
import fetch from "node-fetch";
import path from "path";

const COMFYUI_API_URL = process.env.COMFYUI_API_URL || "http://localhost:8188";

// ─── ComfyUI panorama workflow ───
// Bu fonksiyon ComfyUI API'ye prompt gönderir ve üretilen panoramayı indirir.
// ComfyUI erişilemezse placeholder panorama üretir (geliştirme modu).

function buildWorkflow(prompt, negativePrompt, useHiResFix = true) {
  // SD 1.5 uyumlu iki aşamalı panorama workflow:
  // Aşama 1: 768x384 base üretim (SD 1.5 eğitim aralığına uygun)
  // Aşama 2: LatentUpscale → 1920x960 hi-res fix (denoise 0.45)
  const seed = Math.floor(Math.random() * 2147483647);

  const enhancedNegative = [
    negativePrompt,
    "green screen, monochrome, oversaturated, cropped, out of frame",
    "duplicate, deformed, abstract, surreal, fantasy",
    "worst quality, jpeg artifacts, watermark, text, logo",
  ].join(", ");

  const workflow = {
    "1": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: "sd_v15.safetensors" },
    },
    "2": {
      class_type: "CLIPTextEncode",
      inputs: { text: prompt, clip: ["1", 1] },
    },
    "3": {
      class_type: "CLIPTextEncode",
      inputs: { text: enhancedNegative, clip: ["1", 1] },
    },
    "4": {
      class_type: "EmptyLatentImage",
      inputs: { width: 768, height: 384, batch_size: 1 },
    },
    "5": {
      class_type: "KSampler",
      inputs: {
        model: ["1", 0],
        positive: ["2", 0],
        negative: ["3", 0],
        latent_image: ["4", 0],
        seed: seed,
        steps: 30,
        cfg: 7.0,
        sampler_name: "euler_ancestral",
        scheduler: "normal",
        denoise: 1.0,
      },
    },
  };

  if (useHiResFix) {
    // Aşama 2: Upscale + refine
    workflow["8"] = {
      class_type: "LatentUpscale",
      inputs: {
        samples: ["5", 0],
        upscale_method: "bilinear",
        width: 1920,
        height: 960,
        crop: "disabled",
      },
    };
    workflow["9"] = {
      class_type: "KSampler",
      inputs: {
        model: ["1", 0],
        positive: ["2", 0],
        negative: ["3", 0],
        latent_image: ["8", 0],
        seed: seed + 1,
        steps: 15,
        cfg: 7.0,
        sampler_name: "euler_ancestral",
        scheduler: "normal",
        denoise: 0.45,
      },
    };
    workflow["6"] = {
      class_type: "VAEDecode",
      inputs: { samples: ["9", 0], vae: ["1", 2] },
    };
  } else {
    workflow["6"] = {
      class_type: "VAEDecode",
      inputs: { samples: ["5", 0], vae: ["1", 2] },
    };
  }

  workflow["7"] = {
    class_type: "SaveImage",
    inputs: { images: ["6", 0], filename_prefix: "panorama" },
  };

  return { prompt: workflow };
}

export async function generatePanorama(prompt, negativePrompt, outputPath) {
  try {
    // ComfyUI'ye bağlanmayı dene
    const healthCheck = await fetch(`${COMFYUI_API_URL}/system_stats`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!healthCheck.ok) {
      throw new Error("ComfyUI erişilemez");
    }

    // Workflow'u gönder
    const workflow = buildWorkflow(prompt, negativePrompt);
    const queueResponse = await fetch(`${COMFYUI_API_URL}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(workflow),
    });

    if (!queueResponse.ok) {
      throw new Error(`ComfyUI prompt queue hatası: ${queueResponse.status}`);
    }

    const { prompt_id } = await queueResponse.json();

    // Sonucu bekle (polling)
    const result = await pollForResult(prompt_id);
    if (!result) throw new Error("Panorama üretimi zaman aşımına uğradı");

    // Görseli indir
    const imageUrl = `${COMFYUI_API_URL}/view?filename=${result.filename}&subfolder=${result.subfolder || ""}&type=output`;
    const imageResponse = await fetch(imageUrl);
    const buffer = Buffer.from(await imageResponse.arrayBuffer());
    fs.writeFileSync(outputPath, buffer);

    console.log(`Panorama üretildi: ${outputPath}`);
  } catch (err) {
    console.warn(`ComfyUI kullanılamıyor (${err.message}), placeholder üretiliyor...`);
    await generatePlaceholder(outputPath, prompt);
  }
}

async function pollForResult(promptId, maxWaitMs = 300000) {
  const startTime = Date.now();
  const pollInterval = 3000;

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const res = await fetch(`${COMFYUI_API_URL}/history/${promptId}`);
      const data = await res.json();

      if (data[promptId]?.outputs) {
        const outputs = data[promptId].outputs;
        // İlk SaveImage node'unun çıktısını bul
        for (const nodeId of Object.keys(outputs)) {
          const images = outputs[nodeId]?.images;
          if (images && images.length > 0) {
            return images[0]; // { filename, subfolder, type }
          }
        }
      }
    } catch {
      // Henüz hazır değil, devam et
    }
    await new Promise((r) => setTimeout(r, pollInterval));
  }
  return null;
}

// ─── Geliştirme modu: basit placeholder panorama ───
// ComfyUI yokken pipeline'ı test etmek için kullanılır
async function generatePlaceholder(outputPath, prompt) {
  const { execFile } = await import("child_process");
  const { promisify } = await import("util");
  const execFileAsync = promisify(execFile);

  // Prompt'tan güvenli label çıkar (sadece alfanumerik ve boşluk)
  const label = prompt.substring(0, 50).replace(/[^a-zA-Z0-9 ]/g, "").trim();

  // Renkli gradient arka plan + metin overlay
  const colors = [
    { bg: "0x2E86AB", accent: "0xA23B72" },  // mavi-mor
    { bg: "0x1B4332", accent: "0x52B788" },  // koyu yeşil
    { bg: "0x3D405B", accent: "0xE07A5F" },  // gri-turuncu
    { bg: "0x582F0E", accent: "0xDDB892" },  // kahve-bej
  ];
  const color = colors[Math.floor(Math.random() * colors.length)];

  try {
    await execFileAsync("ffmpeg", [
      "-y",
      "-f", "lavfi",
      "-i", `gradients=s=4096x2048:c0=${color.bg}:c1=${color.accent}:duration=1:speed=1`,
      "-frames:v", "1",
      outputPath,
    ], { timeout: 15000 });
  } catch {
    // gradients filtresi yoksa basit color kullan
    try {
      await execFileAsync("ffmpeg", [
        "-y",
        "-f", "lavfi",
        "-i", `color=c=${color.bg}:s=4096x2048:d=1`,
        "-vf", `drawtext=text='[PLACEHOLDER] ${label}':fontcolor=white:fontsize=64:x=(w-text_w)/2:y=(h-text_h)/2,drawtext=text='ComfyUI baglantisi gerekli':fontcolor=0xCCCCCC:fontsize=36:x=(w-text_w)/2:y=(h+100)`,
        "-frames:v", "1",
        outputPath,
      ], { timeout: 15000 });
    } catch {
      // Son fallback — renkli düz kare
      await execFileAsync("ffmpeg", [
        "-y",
        "-f", "lavfi",
        "-i", `color=c=${color.bg}:s=4096x2048:d=1`,
        "-frames:v", "1",
        outputPath,
      ], { timeout: 10000 });
    }
  }

  console.log(`Placeholder panorama: ${outputPath}`);
}
