import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMP_DIR = process.env.TEMP_DIR || path.resolve(__dirname, "../../data/temp");

// ─── Tek panoramadan sahne videosu üret ───
// Yavaş, akıcı Ken Burns efekti + daha uzun süre = gerçekçi VR deneyimi
export async function createSceneVideo(panoramaPath, outputPath, durationSec = 15) {
  const fps = 30;
  const totalFrames = durationSec * fps;

  // Yavaş zoom-in + minimal yatay kayma (daha doğal, baş döndürmeyen)
  const args = [
    "-y",
    "-loop", "1",
    "-i", panoramaPath,
    "-vf", [
      // Panoramayı önce 1920x960'a ölçekle (workflow çıktısıyla uyumlu)
      "scale=1920:960",
      // Yavaş zoom + çok hafif yatay pan
      `zoompan=z='min(zoom+0.0003,1.08)':x='iw/2-(iw/zoom/2)+sin(on/${totalFrames}*PI*2)*20':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=1920x960:fps=${fps}`,
      "setsar=1:1",
    ].join(","),
    "-t", String(durationSec),
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "20",
    "-pix_fmt", "yuv420p",
    "-metadata:s:v", "spherical=true",
    "-metadata:s:v", "stitched=true",
    "-movflags", "+faststart",
    outputPath,
  ];

  await execFileAsync("ffmpeg", args, { timeout: 180000 });
  console.log(`Sahne videosu oluşturuldu: ${outputPath}`);
}

// ─── Sahneleri crossfade geçişle birleştir ───
// Her sahne arasında 1.5sn yumuşak geçiş (fade) uygular
export async function mergeVideos(videoPaths, outputPath) {
  if (videoPaths.length === 0) throw new Error("Birleştirilecek video yok");

  if (videoPaths.length === 1) {
    fs.copyFileSync(videoPaths[0], outputPath);
    return;
  }

  const crossfadeDuration = 1.5; // saniye

  // FFmpeg xfade filtresi ile crossfade birleştirme
  // Her video çifti arasında yumuşak geçiş uygula
  const inputs = videoPaths.flatMap((p) => ["-i", p]);

  // xfade filter chain oluştur
  // [0:v][1:v]xfade=transition=fade:duration=1.5:offset=10.5[v01]
  // [v01][2:v]xfade=transition=fade:duration=1.5:offset=21[v012]
  // ...
  let filterParts = [];
  let prevLabel = "[0:v]";

  for (let i = 1; i < videoPaths.length; i++) {
    const nextInput = `[${i}:v]`;
    const outLabel = i === videoPaths.length - 1 ? "[vout]" : `[v${i}]`;

    // Offset = ilk videonun bitiş noktası - crossfade süresi
    // Her video 15sn, crossfade 1.5sn
    // offset(1) = 15 - 1.5 = 13.5
    // offset(2) = 13.5 + 15 - 1.5 = 27
    // offset(i) = i * 15 - i * 1.5 = i * (15 - 1.5) = i * 13.5
    const offset = i * (15 - crossfadeDuration);

    filterParts.push(
      `${prevLabel}${nextInput}xfade=transition=fade:duration=${crossfadeDuration}:offset=${offset}${outLabel}`
    );
    prevLabel = outLabel;
  }

  // Eğer sadece 2 video varsa outLabel [vout], 3+ ise son çıktı [vout]
  const filterComplex = filterParts.join(";");

  const args = [
    "-y",
    ...inputs,
    "-filter_complex", filterComplex,
    "-map", "[vout]",
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "20",
    "-pix_fmt", "yuv420p",
    "-metadata:s:v", "spherical=true",
    "-metadata:s:v", "stitched=true",
    "-movflags", "+faststart",
    outputPath,
  ];

  await execFileAsync("ffmpeg", args, { timeout: 300000 });
  console.log(`Final video birleştirildi (crossfade): ${outputPath}`);
}

// ─── Ambiyans sesi ekle (opsiyonel) ───
export async function addAmbientAudio(videoPath, audioPath, outputPath) {
  if (!fs.existsSync(audioPath)) {
    console.warn("Ambiyans ses dosyası bulunamadı, ses eklenmedi");
    fs.copyFileSync(videoPath, outputPath);
    return;
  }

  const args = [
    "-y",
    "-i", videoPath,
    "-i", audioPath,
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "128k",
    // Ses döngüsü: video süresi kadar tekrarla
    "-filter_complex", "[1:a]aloop=loop=-1:size=2e+09,volume=0.3[a]",
    "-map", "0:v",
    "-map", "[a]",
    "-shortest",
    "-movflags", "+faststart",
    outputPath,
  ];

  await execFileAsync("ffmpeg", args, { timeout: 120000 });
  console.log(`Ambiyans sesi eklendi: ${outputPath}`);
}
