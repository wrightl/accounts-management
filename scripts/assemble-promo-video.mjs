#!/usr/bin/env node
/**
 * Assemble promo master MP4 from raw beats, intro/outro, and captions.
 * Usage: npm run promo:assemble
 *
 * Requires ffmpeg on PATH.
 */
import { execSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  copyFileSync,
} from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, loadImage } from "@napi-rs/canvas";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const rawDir = join(root, "promo", "raw");
const outDir = join(root, "promo", "output");
const assetsDir = join(root, "promo", "assets");
const captionsSrc = join(root, "promo", "captions.srt");
const logoPath = join(root, "public", "brand", "alfa.png");

const playwrightFfmpegDir = join(root, ".playwright-browsers", "ffmpeg-1011");
const playwrightFfmpeg = join(playwrightFfmpegDir, "ffmpeg-mac");
function resolveFfmpeg() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try {
    const found = execSync("command -v ffmpeg", { encoding: "utf8" }).trim();
    if (found) return found;
  } catch {
    // fall through
  }
  if (existsSync(playwrightFfmpeg)) return playwrightFfmpeg;
  return "ffmpeg";
}

const FFMPEG = resolveFfmpeg();

const BEATS = [
  "01-hook.webm",
  "02-dashboard.webm",
  "03-money-in.webm",
  "04-money-out.webm",
  "05-trust.webm",
];

const BRAND = {
  navy: "#171d3a",
  pink: "#f598ff",
  white: "#ffffff",
};

function ffmpeg(args, opts = {}) {
  const r = spawnSync(FFMPEG, args, { encoding: "utf8", ...opts });
  if (r.status !== 0) {
    throw new Error(r.stderr || r.stdout || "ffmpeg failed");
  }
}

function ffprobeDuration(path) {
  const r = spawnSync(FFMPEG, ["-i", path, "-f", "null", "-"], {
    encoding: "utf8",
  });
  const text = `${r.stderr ?? ""}${r.stdout ?? ""}`;
  const match = text.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/);
  if (!match) throw new Error(`Could not read duration for ${path}`);
  const [, hh, mm, ss] = match;
  return parseInt(hh, 10) * 3600 + parseInt(mm, 10) * 60 + parseFloat(ss);
}

async function renderStill(filename, lines, subtitle) {
  mkdirSync(assetsDir, { recursive: true });
  const w = 1920;
  const h = 1080;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = BRAND.navy;
  ctx.fillRect(0, 0, w, h);

  try {
    const logo = await loadImage(logoPath);
    const logoSize = 120;
    ctx.drawImage(logo, w / 2 - logoSize / 2, h * 0.28 - logoSize / 2, logoSize, logoSize);
  } catch {
    // logo optional
  }

  ctx.fillStyle = BRAND.white;
  ctx.textAlign = "center";
  ctx.font = "600 56px Outfit, system-ui, sans-serif";
  lines.forEach((line, i) => {
    ctx.fillText(line, w / 2, h * 0.45 + i * 70);
  });

  if (subtitle) {
    ctx.fillStyle = BRAND.pink;
    ctx.font = "400 32px Outfit, system-ui, sans-serif";
    ctx.fillText(subtitle, w / 2, h * 0.72);
  }

  const out = join(assetsDir, filename);
  writeFileSync(out, canvas.toBuffer("image/png"));
  return out;
}

function videoFromImage(png, seconds, out) {
  ffmpeg([
    "-y",
    "-loop",
    "1",
    "-i",
    png,
    "-c:v",
    "libx264",
    "-t",
    String(seconds),
    "-pix_fmt",
    "yuv420p",
    "-r",
    "30",
    out,
  ]);
}

function concatVideos(segments, out) {
  const listPath = join(outDir, "concat-list.txt");
  const body = segments.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n");
  writeFileSync(listPath, body + "\n");
  ffmpeg([
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listPath,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-r",
    "30",
    "-an",
    out,
  ]);
}

function hasSubtitlesFilter() {
  const r = spawnSync(FFMPEG, ["-filters"], { encoding: "utf8" });
  return /\ssubtitles\s/.test(`${r.stdout ?? ""}${r.stderr ?? ""}`);
}

function burnCaptions(input, srt, output) {
  const srtName = "burncaptions.srt";
  copyFileSync(srt, join(outDir, srtName));

  if (hasSubtitlesFilter()) {
    ffmpeg(
      [
        "-y",
        "-i",
        basename(input),
        "-vf",
        `subtitles=${srtName}`,
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-r",
        "30",
        "-an",
        basename(output),
      ],
      { cwd: outDir },
    );
    return;
  }

  console.warn(
    "ffmpeg lacks libass/subtitles filter — embedding soft captions (mov_text). " +
      "Upload accounts-promo-captions.srt to YouTube for burned-style captions, " +
      "or install ffmpeg with libass (brew install libass && brew reinstall ffmpeg).",
  );
  ffmpeg([
    "-y",
    "-i",
    input,
    "-i",
    join(outDir, srtName),
    "-c:v",
    "copy",
    "-c:s",
    "mov_text",
    "-metadata:s:s:0",
    "language=eng",
    "-an",
    output,
  ]);
}

function makeThumbnail(fromVideo, out) {
  ffmpeg([
    "-y",
    "-ss",
    "00:00:08",
    "-i",
    fromVideo,
    "-frames:v",
    "1",
    "-vf",
    "scale=1280:720",
    out,
  ]);
}

async function main() {
  execSync(`"${FFMPEG}" -version`, { stdio: "pipe" });

  for (const beat of BEATS) {
    const p = join(rawDir, beat);
    if (!existsSync(p)) {
      throw new Error(`Missing ${p} — run npm run promo:record first`);
    }
  }
  if (!existsSync(captionsSrc)) {
    throw new Error(`Missing ${captionsSrc}`);
  }

  mkdirSync(outDir, { recursive: true });

  const introPng = await renderStill(
    "intro.png",
    ["Alfa by Dot+Dash", "Your books, in one place."],
    "First look · Not on sale yet",
  );
  const outroPng = await renderStill(
    "outro.png",
    ["Built for UK consultancies", "Join the waitlist — link in description"],
    "Coming soon",
  );

  const introMp4 = join(outDir, "intro.mp4");
  const outroMp4 = join(outDir, "outro.mp4");
  videoFromImage(introPng, 4, introMp4);
  videoFromImage(outroPng, 6, outroMp4);

  const beatMp4s = BEATS.map((beat) => {
    const webm = join(rawDir, beat);
    const mp4 = join(outDir, beat.replace(".webm", ".mp4"));
    ffmpeg([
      "-y",
      "-i",
      webm,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-r",
      "30",
      "-an",
      mp4,
    ]);
    return mp4;
  });

  const silentMaster = join(outDir, "accounts-promo-silent.mp4");
  concatVideos([introMp4, ...beatMp4s, outroMp4], silentMaster);

  const master = join(outDir, "accounts-promo-master.mp4");
  burnCaptions(silentMaster, captionsSrc, master);

  copyFileSync(captionsSrc, join(outDir, "accounts-promo-captions.srt"));

  const thumb = join(outDir, "thumbnail.png");
  makeThumbnail(master, thumb);

  const duration = ffprobeDuration(master);
  console.log(`Master: ${master} (${duration.toFixed(1)}s)`);
  console.log(`Captions: ${join(outDir, "accounts-promo-captions.srt")}`);
  console.log(`Thumbnail: ${thumb}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
