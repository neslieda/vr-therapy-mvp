# SDXL Acrophobia Pipeline — Setup & Configuration

Complete guide for the SDXL + ControlNet Depth + Stable Video Diffusion pipeline
for acrophobia (fear of heights) VR exposure therapy content generation.

---

## Architecture

```
Scene Planner (SDXL-optimized prompts)
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│ ComfyUI (Cloud GPU — RTX 4090 / A100 recommended)      │
│                                                         │
│  Pass 1: SDXL Base Generation                           │
│    ├─ Checkpoint: Juggernaut XL v9 (or RealVisXL V4)   │
│    ├─ Resolution: 1024×1024                             │
│    ├─ Sampler: DPM++ 2M Karras                          │
│    ├─ Steps: 35, CFG: 6.0                               │
│    └─ Output: base image                                │
│                                                         │
│  Pass 2: ControlNet Depth Refinement                    │
│    ├─ Depth extraction: DepthAnything V1                │
│    ├─ ControlNet: diffusers_xl_depth_full               │
│    ├─ Strength: 0.65, denoise: 0.45                     │
│    └─ Output: depth-refined image                       │
│                                                         │
│  Pass 3: Stable Video Diffusion                         │
│    ├─ Model: SVD-XT 1.1                                 │
│    ├─ Frames: 25, motion_bucket: 40-55                  │
│    ├─ Pingpong: true (seamless loop)                    │
│    └─ Output: ~4s video with subtle camera sway         │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│ Post-Processing (FFmpeg on Media Service)               │
│  ├─ SVD video loop extension → 15s per scene            │
│  ├─ Frame interpolation → 30fps (minterpolate)          │
│  ├─ Scene merging with crossfade transitions            │
│  ├─ VR metadata injection                               │
│  └─ Optional: equirectangular + cubemap export          │
└─────────────────────────────────────────────────────────┘
```

---

## 1. GPU Requirements

| GPU | VRAM | SDXL + CN Depth | SVD | Notes |
|-----|------|-----------------|-----|-------|
| **RTX 4090** | 24GB | ✅ Fast | ✅ | Best option |
| **A100** | 40/80GB | ✅ Fast | ✅ | Best for batch |
| **RTX 3090** | 24GB | ✅ OK | ✅ | Good price/performance |
| **RTX 4070 Ti** | 12GB | ⚠️ Tight | ❌ | SDXL only, no SVD |
| **A4000** | 16GB | ✅ OK | ⚠️ | SVD may OOM at full res |

**Minimum**: 16GB VRAM for SDXL + ControlNet. 24GB for full pipeline with SVD.

---

## 2. ComfyUI Model Setup

### 2.1 SDXL Checkpoint (Required)

Download **one** of these realism checkpoints:

```bash
cd /workspace/ComfyUI/models/checkpoints

# Option A: Juggernaut XL v9 (RECOMMENDED)
wget https://civitai.com/api/download/models/456194 -O juggernautXL_v9Rundiffusion.safetensors

# Option B: RealVisXL V4.0
wget https://civitai.com/api/download/models/361593 -O RealVisXL_V4.0.safetensors
```

### 2.2 ControlNet Depth Model (Required)

```bash
cd /workspace/ComfyUI/models/controlnet

# SDXL Depth ControlNet
wget https://huggingface.co/diffusers/controlnet-depth-sdxl-1.0/resolve/main/diffusion_pytorch_model.fp16.safetensors \
  -O diffusers_xl_depth_full.safetensors
```

### 2.3 Depth Preprocessor (Required)

```bash
# Install ControlNet Aux nodes (includes DepthAnything)
cd /workspace/ComfyUI/custom_nodes
git clone https://github.com/Fannovel16/comfyui_controlnet_aux.git
cd comfyui_controlnet_aux
pip install -r requirements.txt

# DepthAnything model auto-downloads on first use
# Or pre-download:
mkdir -p /workspace/ComfyUI/custom_nodes/comfyui_controlnet_aux/ckpts/depth_anything
wget https://huggingface.co/spaces/LiheYoung/Depth-Anything/resolve/main/checkpoints/depth_anything_vitl14.pth \
  -O /workspace/ComfyUI/custom_nodes/comfyui_controlnet_aux/ckpts/depth_anything/depth_anything_vitl14.pth
```

### 2.4 Stable Video Diffusion (Required for video)

```bash
cd /workspace/ComfyUI/models/checkpoints

# SVD-XT 1.1 (25 frames, better temporal consistency)
wget https://huggingface.co/stabilityai/stable-video-diffusion-img2vid-xt-1-1/resolve/main/svd_xt_1_1.safetensors
```

### 2.5 Video Helper Suite (Required for SVD output)

```bash
cd /workspace/ComfyUI/custom_nodes
git clone https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite.git
cd ComfyUI-VideoHelperSuite
pip install -r requirements.txt
```

---

## 3. Environment Configuration

Add these to your `.env` file:

```env
# ── SDXL Pipeline ──
SDXL_CHECKPOINT=juggernautXL_v9Rundiffusion.safetensors
CONTROLNET_DEPTH_MODEL=diffusers_xl_depth_full.safetensors
DEPTH_PREPROCESSOR_MODEL=depth_anything_vitl14.pth
SVD_MODEL=svd_xt_1_1.safetensors

# ── ComfyUI Connection ──
COMFYUI_API_URL=http://<YOUR_GPU_IP>:8188
```

If using RealVisXL instead:
```env
SDXL_CHECKPOINT=RealVisXL_V4.0.safetensors
```

---

## 4. Render Settings Reference

### SDXL Base Generation
| Parameter | Value | Notes |
|-----------|-------|-------|
| Resolution | 1024×1024 | SDXL native, best quality |
| Steps | 35 | Balance of quality/speed |
| CFG Scale | 6.0 | Optimal for realism checkpoints |
| Sampler | DPM++ 2M | Best for photorealism |
| Scheduler | Karras | Smoother noise schedule |

### ControlNet Depth Refinement
| Parameter | Value | Notes |
|-----------|-------|-------|
| Strength | 0.65 | Enforces depth without killing detail |
| Start % | 0.0 | Apply from beginning |
| End % | 0.85 | Allow final detail steps free |
| Denoise | 0.45 | Moderate refinement, preserves composition |
| Steps | 25 | Sufficient for refinement pass |
| CFG | 5.5 | Slightly lower for natural look |

### SVD Video Generation
| Parameter | Value | Notes |
|-----------|-------|-------|
| Frames | 25 | SVD-XT native frame count |
| Motion Bucket | 30-55 | Scene-dependent (higher = more motion) |
| FPS | 6 | SVD native, upsampled later to 30fps |
| Augmentation | 0.01-0.03 | Subtle per-scene variation |
| CFG | 2.5 | SVD works best with low CFG |
| Pingpong | true | Seamless loop for VR |

### Per-Scene Motion Settings
| Scene | Motion Bucket | Augmentation | Effect |
|-------|--------------|--------------|--------|
| Horizon View | 30 | 0.01 | Very subtle sway (calm observation) |
| Looking Down | 45 | 0.02 | Moderate sway (leaning forward) |
| Edge View | 55 | 0.03 | Stronger wind sway (vertigo enhancement) |

---

## 5. Prompt Engineering for SDXL Acrophobia

### Key SDXL Differences from SD 1.5
- **Longer prompts** work better — be very descriptive
- **No equirectangular prefix** — generate first-person POV directly
- **Quality tokens** that work well: `ultra realistic`, `shot on Canon EOS R5`, `architectural photography`, `hyperdetailed textures`
- **Specific depth cues**: explicitly describe what is close (feet, railing) vs far (cars, people as dots)

### Core Prompt Template
```
first person POV standing at [LOCATION],
feet visible in dark shoes near [EDGE/SURFACE],
[LOOKING DIRECTION],
[DEPTH CUES — what is far below, what is at eye level],
[PHYSICAL ENVIRONMENT — textures, materials, weather],
strong depth perspective, realistic scale,
ultra realistic, cinematic lighting, wide angle lens, highly detailed, 8k uhd,
shot on Canon EOS R5, photorealistic, hyperdetailed textures, architectural photography
```

### Critical Negative Prompt Elements
```
third person view, external camera, aerial view, drone shot,
abstract, surreal, fantasy, cartoon, anime, painting,
fisheye distortion, floating objects, broken geometry
```

---

## 6. Testing the Pipeline

### Quick test (single scene):
```bash
curl -X POST http://localhost:3001/api/jobs \
  -H "Content-Type: application/json" \
  -d '{"scenarioId": "acrophobia", "scenarioTitle": "Yükseklik Korkusu"}'
```

### Verify ComfyUI has all models:
```bash
# Check system stats
curl http://<GPU_IP>:8188/system_stats

# List available checkpoints
curl http://<GPU_IP>:8188/object_info/CheckpointLoaderSimple | python3 -m json.tool
```

### Load workflow in ComfyUI UI:
1. Open `http://<GPU_IP>:8188`
2. Click "Load" → select `orchestration/comfyui-sdxl-acrophobia-workflow.json`
3. Click "Queue Prompt" to test manually

---

## 7. Optional: Unity/Blender VR Export

The pipeline includes utilities for VR headset integration:

### Equirectangular Conversion
The `vr-export.js` module converts SDXL images to equirectangular projection
(2:1 ratio) for VR photo viewers.

### Cubemap for Unity
Generates 6-face cubemap from equirectangular images:
- `front.png`, `back.png`, `left.png`, `right.png`, `top.png`, `bottom.png`
- Import directly into Unity as Skybox material

### Unity Integration Steps
1. Generate cubemap faces using the pipeline
2. Import cube faces as Unity Skybox material
3. Create a Unity scene with:
   - Skybox assigned to the scene
   - Camera at center with VR head tracking
   - Optional: rooftop 3D model for feet/railing geometry
4. Build for Meta Quest / SteamVR

---

## 8. Troubleshooting

| Issue | Solution |
|-------|----------|
| SDXL CUDA OOM | Reduce resolution to 768×768, or use `--lowvram` flag in ComfyUI |
| SVD CUDA OOM | Reduce video_frames to 14, or width to 768 |
| ControlNet not found | Ensure model is in `ComfyUI/models/controlnet/` with exact filename |
| DepthAnything error | Install comfyui_controlnet_aux and its requirements |
| VHS_VideoCombine error | Install ComfyUI-VideoHelperSuite custom node |
| SVD video too short | Post-processing extends via loop + interpolation |
| Motion too aggressive | Lower motion_bucket_id (try 20-30) |
| Depth looks flat | Increase depthStrength to 0.8, decrease depthEndPercent to 0.7 |
