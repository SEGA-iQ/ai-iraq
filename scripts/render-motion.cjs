#!/usr/bin/env node
// Renders an animated HTML ad (design/motion/*.html) to MP4.
//
//   node scripts/render-motion.cjs design/motion/offer.html             # story + feed MP4s
//   node scripts/render-motion.cjs design/motion/offer.html --format story
//   node scripts/render-motion.cjs design/motion/offer.html --stills 0,3.1,14.9   # preview PNGs
//
// The page must expose window.motionReady (a promise), window.seek(t) and window.MOTION
// ({duration, fps, width, height}). Each video frame averages several sub-frames inside a
// half-frame shutter, which gives fast movement natural motion blur.
//
// Needs Chrome (or Chromium/Edge) and ffmpeg. Set CHROME_PATH / FFMPEG_PATH if they are
// installed somewhere unusual.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { chromium } = require("playwright-core");
const { buildSoundtrack } = require("./motion-audio.cjs");

function parseArgs(argv) {
  const opts = { format: "all", samples: 10, shutter: 0.5, workers: Math.max(1, Math.min(4, os.cpus().length)), crf: 18, audio: true };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--format") opts.format = next();
    else if (a === "--stills") opts.stills = next().split(",").map(Number);
    else if (a === "--out") opts.out = next();
    else if (a === "--samples") opts.samples = Math.max(1, parseInt(next(), 10));
    else if (a === "--shutter") opts.shutter = parseFloat(next());
    else if (a === "--workers") opts.workers = Math.max(1, parseInt(next(), 10));
    else if (a === "--crf") opts.crf = parseInt(next(), 10);
    else if (a === "--from") opts.from = parseFloat(next());
    else if (a === "--to") opts.to = parseFloat(next());
    else if (a === "--no-audio") opts.audio = false;
    else if (a === "--keep-frames") opts.keepFrames = true;
    else rest.push(a);
  }
  opts.input = rest[0];
  return opts;
}

async function launch() {
  const tries = [
    process.env.CHROME_PATH && { executablePath: process.env.CHROME_PATH },
    fs.existsSync("/opt/pw-browsers/chromium") && { executablePath: "/opt/pw-browsers/chromium" },
    { channel: "chrome" },
    { channel: "msedge" },
    { channel: "chromium" },
  ].filter(Boolean);
  let last;
  for (const o of tries) {
    try {
      return await chromium.launch({ ...o, args: ["--font-render-hinting=none", "--disable-lcd-text"] });
    } catch (err) {
      last = err;
    }
  }
  throw new Error("Chrome not found. Install Google Chrome or set CHROME_PATH.\n" + (last ? last.message : ""));
}

function ffmpegPath() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  const probe = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
  if (probe.status === 0) return "ffmpeg";
  throw new Error(
    "ffmpeg not found. Install it (Windows: winget install Gyan.FFmpeg · Mac: brew install ffmpeg · Linux: apt install ffmpeg) or set FFMPEG_PATH.",
  );
}

function sizesFromHtml(file) {
  const src = fs.readFileSync(file, "utf8");
  const meta = src.match(/<meta\s+name=["']motion["']\s+content=["']([^"']+)["']/i);
  const formats = {};
  const m = meta && meta[1].match(/formats=([^;]+)/);
  for (const part of (m ? m[1] : "story:1080x1920").split(",")) {
    const [name, size] = part.trim().split(":");
    const [w, h] = size.split("x").map(Number);
    formats[name] = { w, h };
  }
  return formats;
}

async function openPage(browser, file, format, size) {
  const page = await browser.newPage({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`file://${file}?format=${format}`, { waitUntil: "load" });
  await page.evaluate(() => window.motionReady);
  if (errors.length) throw new Error(`page error in ${path.basename(file)} (${format}): ${errors.join(" | ")}`);
  page._errors = errors;
  return page;
}

async function shoot(page, t, size, out) {
  await page.evaluate((tt) => window.seek(tt), t);
  await page.screenshot({ path: out, type: "png", clip: { x: 0, y: 0, width: size.w, height: size.h } });
  if (page._errors.length) throw new Error(`page error at t=${t}: ${page._errors.join(" | ")}`);
}

async function renderStills(file, format, size, times, outDir, fixedName) {
  const browser = await launch();
  const page = await openPage(browser, file, format, size);
  const name = path.basename(file, path.extname(file));
  const outs = [];
  for (const t of times) {
    const out = path.join(outDir, fixedName || `${name}-${format}-t${t.toFixed(2).padStart(5, "0")}.png`);
    await shoot(page, t, size, out);
    outs.push(out);
  }
  await browser.close();
  return outs;
}

async function renderFrames(file, format, size, motion, opts, dir) {
  const fps = motion.fps;
  const first = Math.round((opts.from ?? 0) * fps);
  const last = Math.round((opts.to ?? motion.duration) * fps); // exclusive
  const S = opts.samples;
  const frames = [];
  for (let k = first; k < last; k++) frames.push(k);
  const chunk = Math.ceil(frames.length / opts.workers);
  const started = Date.now();
  let done = 0;
  const workers = Array.from({ length: opts.workers }, async (_, w) => {
    const mine = frames.slice(w * chunk, (w + 1) * chunk);
    if (!mine.length) return;
    const browser = await launch();
    const page = await openPage(browser, file, format, size);
    for (const k of mine) {
      for (let j = 0; j < S; j++) {
        const t = (k + (S > 1 ? (j * opts.shutter) / S : 0)) / fps;
        const n = (k - first) * S + j;
        await shoot(page, t, size, path.join(dir, `${String(n).padStart(6, "0")}.png`));
      }
      done++;
      if (done % 30 === 0 || done === frames.length) {
        const secs = (Date.now() - started) / 1000;
        process.stdout.write(`\r  ${format}: ${done}/${frames.length} frames · ${secs.toFixed(0)}s`);
      }
    }
    await browser.close();
  });
  await Promise.all(workers);
  process.stdout.write("\n");
  return { count: frames.length, first };
}

function encode(ff, dir, motion, opts, outFile, audioFile) {
  const S = opts.samples;
  const vf = [];
  if (S > 1) vf.push(`tmix=frames=${S}`, `select='eq(mod(n\\,${S})\\,${S - 1})'`, `setpts=N/(${motion.fps}*TB)`);
  vf.push("format=yuv420p");
  const args = ["-y", "-hide_banner", "-loglevel", "error", "-framerate", String(motion.fps * S), "-i", path.join(dir, "%06d.png")];
  if (audioFile) args.push("-i", audioFile);
  args.push("-vf", vf.join(","), "-r", String(motion.fps));
  args.push("-c:v", "libx264", "-preset", "slow", "-crf", String(opts.crf), "-profile:v", "high", "-pix_fmt", "yuv420p", "-movflags", "+faststart");
  if (audioFile) args.push("-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-shortest");
  args.push(outFile);
  const r = spawnSync(ff, args, { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`ffmpeg failed for ${outFile}`);
}

(async () => {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.input) {
    console.error("usage: node scripts/render-motion.cjs <file.html> [--format story|feed|all] [--stills t1,t2]");
    process.exit(2);
  }
  const file = path.resolve(opts.input);
  const name = path.basename(file, path.extname(file));
  const sizes = sizesFromHtml(file);
  const formats = opts.format === "all" ? Object.keys(sizes) : opts.format.split(",");
  const outDir = path.resolve(opts.out || path.join(path.dirname(file), opts.stills ? "preview" : "out"));
  fs.mkdirSync(outDir, { recursive: true });

  if (opts.stills) {
    for (const f of formats) {
      const outs = await renderStills(file, f, sizes[f], opts.stills, outDir);
      outs.forEach((o) => console.log("✓", path.relative(process.cwd(), o)));
    }
    return;
  }

  const ff = ffmpegPath();
  for (const f of formats) {
    const size = sizes[f];
    const browser = await launch();
    const probe = await openPage(browser, file, f, size);
    const motion = await probe.evaluate(() => ({ ...window.MOTION, cues: window.CUES || [] }));
    await browser.close();

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `motion-${name}-${f}-`));
    console.log(`▶ ${name} · ${f} ${size.w}x${size.h} · ${motion.duration}s @${motion.fps}fps · ${opts.samples} sub-frames · ${opts.workers} workers`);
    await renderFrames(file, f, size, motion, opts, tmp);

    const base = path.join(outDir, `${name}-${f}`);
    encode(ff, tmp, motion, opts, `${base}-silent.mp4`, null);
    console.log("✓", path.relative(process.cwd(), `${base}-silent.mp4`));
    if (opts.audio && motion.cues.length) {
      const wav = path.join(tmp, "soundtrack.wav");
      buildSoundtrack({ cues: motion.cues, duration: motion.duration, bpm: motion.bpm || 120, out: wav, ffmpeg: ff });
      encode(ff, tmp, motion, opts, `${base}.mp4`, wav);
      console.log("✓", path.relative(process.cwd(), `${base}.mp4`));
    }
    // cover image for Reels / the ad thumbnail: the finished end card
    await renderStills(file, f, size, [motion.duration - 0.05], outDir, `${name}-${f}-cover.png`);
    console.log("✓", path.relative(process.cwd(), `${base}-cover.png`));
    if (!opts.keepFrames) fs.rmSync(tmp, { recursive: true, force: true });
    else console.log("  frames kept in", tmp);
  }
})().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
