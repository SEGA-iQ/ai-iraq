#!/usr/bin/env node
// Renders the HTML ad templates in design/ads to PNG using the Chrome already on
// your machine (no browser download). Usage:
//   node scripts/render-ads.cjs                 # every .html under design/ads
//   node scripts/render-ads.cjs design/ads/offer-square.html
// Size comes from <meta name="ad-size" content="1080x1080"> in each file.
// Set CHROME_PATH if Chrome/Chromium is installed somewhere unusual.
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_DIR = path.join(ROOT, "design", "ads");

function listTargets(args) {
  if (args.length === 0) args = [DEFAULT_DIR];
  const files = [];
  for (const a of args) {
    const p = path.resolve(a);
    if (fs.statSync(p).isDirectory()) {
      for (const f of fs.readdirSync(p)) if (/\.html?$/i.test(f) && !f.startsWith("_")) files.push(path.join(p, f));
    } else files.push(p);
  }
  return files;
}

async function launch() {
  const candidates = [
    process.env.CHROME_PATH && { executablePath: process.env.CHROME_PATH },
    fs.existsSync("/opt/pw-browsers/chromium") && { executablePath: "/opt/pw-browsers/chromium" },
    { channel: "chrome" },
    { channel: "msedge" },
    { channel: "chromium" },
  ].filter(Boolean);
  let lastErr;
  for (const opts of candidates) {
    try {
      return await chromium.launch(opts);
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(
    "ما لگيت Chrome على الجهاز. نصّب Google Chrome أو ضع مسار المتصفح بالمتغير CHROME_PATH.\n" + (lastErr ? lastErr.message : ""),
  );
}

(async () => {
  const files = listTargets(process.argv.slice(2));
  if (files.length === 0) {
    console.log("ماكو ملفات HTML للتصيير.");
    return;
  }
  const browser = await launch();
  let failed = 0;
  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    const m = src.match(/<meta\s+name=["']ad-size["']\s+content=["'](\d+)x(\d+)["']/i);
    const width = m ? Number(m[1]) : 1080;
    const height = m ? Number(m[2]) : 1080;
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.goto("file://" + file, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(150);
    const overflow = await page.evaluate(({ width, height }) => {
      const bad = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        if (!n.textContent.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        const r = range.getBoundingClientRect();
        if (r.width && r.height && (r.left < -0.5 || r.top < -0.5 || r.right > width + 0.5 || r.bottom > height + 0.5)) {
          bad.push(n.textContent.trim().slice(0, 30));
        }
      }
      return bad;
    }, { width, height });
    const out = file.replace(/\.html?$/i, ".png");
    await page.screenshot({ path: out, clip: { x: 0, y: 0, width, height } });
    await page.close();
    const rel = path.relative(process.cwd(), out);
    if (overflow.length) {
      failed++;
      console.log(`⚠ ${rel}: نص طالع برّا الصورة: ${overflow.join(" | ")}`);
    } else {
      console.log(`✓ ${rel} (${width}x${height})`);
    }
  }
  await browser.close();
  if (failed) process.exitCode = 1;
})().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
