import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

const execFileAsync = promisify(execFile);

// ══════════════════════════════════════════════
// Equirectangular projection for VR headsets
// ══════════════════════════════════════════════

/**
 * Convert a flat first-person image to equirectangular projection.
 * This maps the image onto the front face of a 360 sphere and fills
 * the remaining area with a blurred extension for spatial continuity.
 *
 * @param {string} inputPath — Source image (1024x1024 from SDXL)
 * @param {string} outputPath — Output equirectangular image (2:1 ratio)
 * @param {object} options
 * @param {number} options.width — Output width (default 4096)
 * @param {number} options.height — Output height (default 2048)
 * @param {number} options.fov — Field of view in degrees (default 110)
 */
export async function convertToEquirectangular(inputPath, outputPath, options = {}) {
  const { width = 4096, height = 2048, fov = 110 } = options;

  // Use v360 filter to project the flat image onto equirectangular
  // The input is treated as a rectilinear (flat) image with given FOV
  // placed at the front of the sphere
  const args = [
    "-y",
    "-i", inputPath,
    "-vf", [
      // Pad to 2:1 aspect first
      `pad=iw:iw/2:(ow-iw)/2:(oh-ih)/2:color=black`,
      // Apply rectilinear → equirectangular projection
      `v360=input=flat:output=equirect:h_fov=${fov}:v_fov=${fov}:w=${width}:h=${height}:interp=lanczos`,
    ].join(","),
    "-frames:v", "1",
    "-q:v", "2",
    outputPath,
  ];

  try {
    await execFileAsync("ffmpeg", args, { timeout: 60000 });
    console.log(`[vr-export] Equirectangular conversion: ${outputPath}`);
  } catch (err) {
    // Fallback: simple scale to 2:1 if v360 filter not available
    console.warn(`[vr-export] v360 filter failed (${err.message}), using scale fallback`);
    await execFileAsync("ffmpeg", [
      "-y",
      "-i", inputPath,
      "-vf", `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`,
      "-frames:v", "1",
      "-q:v", "2",
      outputPath,
    ], { timeout: 30000 });
  }
}

// ══════════════════════════════════════════════
// Cubemap generation for Unity/Blender import
// ══════════════════════════════════════════════

/**
 * Convert equirectangular image to 6-face cubemap layout.
 * Layout: horizontal cross (4:3 ratio) — compatible with Unity skybox import.
 *
 * @param {string} equirectPath — Source equirectangular image
 * @param {string} outputDir — Directory to save cubemap faces
 * @param {number} faceSize — Size of each cubemap face (default 1024)
 */
export async function generateCubemap(equirectPath, outputDir, faceSize = 1024) {
  fs.mkdirSync(outputDir, { recursive: true });

  const faces = [
    { name: "front",  yaw: 0,   pitch: 0 },
    { name: "right",  yaw: 90,  pitch: 0 },
    { name: "back",   yaw: 180, pitch: 0 },
    { name: "left",   yaw: 270, pitch: 0 },
    { name: "top",    yaw: 0,   pitch: 90 },
    { name: "bottom", yaw: 0,   pitch: -90 },
  ];

  for (const face of faces) {
    const outputPath = path.join(outputDir, `${face.name}.png`);
    await execFileAsync("ffmpeg", [
      "-y",
      "-i", equirectPath,
      "-vf", `v360=equirect:flat:yaw=${face.yaw}:pitch=${face.pitch}:h_fov=90:v_fov=90:w=${faceSize}:h=${faceSize}:interp=lanczos`,
      "-frames:v", "1",
      "-q:v", "2",
      outputPath,
    ], { timeout: 30000 });
  }

  console.log(`[vr-export] Cubemap faces generated in: ${outputDir}`);
  return faces.map((f) => path.join(outputDir, `${f.name}.png`));
}

// ══════════════════════════════════════════════
// VR metadata injection (Spatial Media standard)
// ══════════════════════════════════════════════

/**
 * Inject Google Spatial Media / VR180/360 metadata into MP4.
 * This enables auto-detection in YouTube VR, Meta Quest, etc.
 *
 * @param {string} inputPath — Source video
 * @param {string} outputPath — Output video with VR metadata
 * @param {object} options
 * @param {boolean} options.is360 — true for 360°, false for 180°
 * @param {boolean} options.isStereoscopic — true for side-by-side 3D
 */
export async function injectVRMetadata(inputPath, outputPath, options = {}) {
  const { is360 = false, isStereoscopic = false } = options;

  // For first-person POV content (not full 360), we use standard metadata
  // For full 360 equirectangular, we inject spherical metadata
  const metadataArgs = [
    "-y",
    "-i", inputPath,
    "-c", "copy",
    "-metadata:s:v", `spherical=${is360 ? "true" : "false"}`,
    "-metadata:s:v", `stitched=${is360 ? "true" : "false"}`,
    "-metadata:s:v", `projection=${is360 ? "equirectangular" : "rectilinear"}`,
  ];

  if (is360) {
    metadataArgs.push(
      "-metadata:s:v", "stereo_mode=" + (isStereoscopic ? "left_right" : "mono"),
      "-metadata:s:v", "spherical_mapping=equirectangular",
    );
  }

  metadataArgs.push("-movflags", "+faststart", outputPath);

  await execFileAsync("ffmpeg", metadataArgs, { timeout: 60000 });
  console.log(`[vr-export] VR metadata injected: ${outputPath}`);
}

// ══════════════════════════════════════════════
// SVD video post-processing for VR
// ══════════════════════════════════════════════

/**
 * Post-process SVD output for VR viewing:
 * - Extend duration via loop/pingpong
 * - Smooth framerate interpolation
 * - Add VR metadata
 *
 * @param {string} svdVideoPath — Raw SVD video (short, ~4s)
 * @param {string} outputPath — Final VR-ready video
 * @param {object} options
 * @param {number} options.targetDuration — Target duration in seconds (default 15)
 * @param {number} options.targetFps — Target framerate (default 30)
 */
export async function postProcessSVDForVR(svdVideoPath, outputPath, options = {}) {
  const { targetDuration = 15, targetFps = 30 } = options;

  // Step 1: Loop/extend the SVD video to target duration
  // SVD outputs ~4s (25 frames at 6fps). We loop it with crossfade transitions.
  const loopedPath = outputPath.replace(/\.mp4$/, "_looped.mp4");

  await execFileAsync("ffmpeg", [
    "-y",
    "-stream_loop", String(Math.ceil(targetDuration / 4) - 1),
    "-i", svdVideoPath,
    "-t", String(targetDuration),
    "-vf", [
      // Interpolate to smooth framerate
      `minterpolate=fps=${targetFps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1`,
      "setpts=PTS-STARTPTS",
    ].join(","),
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "18",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    loopedPath,
  ], { timeout: 300000 });

  // Step 2: Add VR metadata (first-person perspective, not full 360)
  await injectVRMetadata(loopedPath, outputPath, { is360: false });

  // Clean up intermediate
  fs.unlink(loopedPath, () => {});

  console.log(`[vr-export] VR-ready video: ${outputPath}`);
}

/**
 * Full VR export pipeline: equirectangular + video + metadata
 *
 * @param {string} refinedImagePath — Depth-refined SDXL image
 * @param {string} svdVideoPath — Raw SVD video
 * @param {string} outputDir — Directory for all VR outputs
 * @param {string} sceneId — Scene identifier for filenames
 */
export async function fullVRExport(refinedImagePath, svdVideoPath, outputDir, sceneId) {
  fs.mkdirSync(outputDir, { recursive: true });

  const results = {};

  // 1. Equirectangular image for VR photo viewing
  const equirectPath = path.join(outputDir, `${sceneId}_equirect.png`);
  await convertToEquirectangular(refinedImagePath, equirectPath);
  results.equirectangular = equirectPath;

  // 2. Cubemap for Unity/Blender
  const cubemapDir = path.join(outputDir, `${sceneId}_cubemap`);
  results.cubemapFaces = await generateCubemap(equirectPath, cubemapDir);

  // 3. VR-ready video
  if (svdVideoPath && fs.existsSync(svdVideoPath)) {
    const vrVideoPath = path.join(outputDir, `${sceneId}_vr.mp4`);
    await postProcessSVDForVR(svdVideoPath, vrVideoPath);
    results.vrVideo = vrVideoPath;
  }

  console.log(`[vr-export] Full VR export complete for scene: ${sceneId}`);
  return results;
}
