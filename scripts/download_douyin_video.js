#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

let puppeteer;
try {
  puppeteer = require('puppeteer-core');
} catch (err) {
  console.error('Missing dependency: puppeteer-core');
  console.error('Run: npm install puppeteer-core');
  process.exit(2);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === '--url') out.url = v;
    if (k === '--output') out.output = v;
    if (k === '--chrome-path') out.chromePath = v;
    if (k === '--timeout-ms') out.timeoutMs = Number(v);
  }
  return out;
}

function pickChromePath(explicitPath) {
  const candidates = [
    explicitPath,
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean);

  for (const p of candidates) {
    if (p.includes('/')) {
      if (fs.existsSync(p)) return p;
    } else {
      const which = spawnSync('which', [p], { encoding: 'utf8' });
      if (which.status === 0) return which.stdout.trim();
    }
  }
  return null;
}

function isLikelyMainVideo(url, contentType) {
  const ct = (contentType || '').toLowerCase();
  const u = url.toLowerCase();
  return (
    (u.includes('douyinvod.com') || u.includes('/video/tos/')) &&
    (ct.includes('video/mp4') || u.includes('mime_type=video_mp4') || u.includes('.mp4'))
  );
}

function downloadWithCurl(url, outputPath) {
  const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';
  const args = [
    '-L',
    url,
    '-H', `Referer: https://www.douyin.com/`,
    '-H', `User-Agent: ${ua}`,
    '-H', 'Accept: */*',
    '-H', 'Origin: https://www.douyin.com',
    '-H', 'Range: bytes=0-',
    '-o',
    outputPath,
  ];
  const res = spawnSync('curl', args, { stdio: 'inherit' });
  return res.status === 0;
}

async function main() {
  const args = parseArgs(process.argv);
  const url = args.url;
  const outputPath = args.output ? path.resolve(args.output) : path.resolve('douyin_video.mp4');
  const timeoutMs = Number.isFinite(args.timeoutMs) ? args.timeoutMs : 120000;

  if (!url) {
    console.error('Usage: node scripts/download_douyin_video.js --url <douyin-url> [--output <file.mp4>] [--chrome-path <path>] [--timeout-ms 120000]');
    process.exit(2);
  }

  const chromePath = pickChromePath(args.chromePath);
  if (!chromePath) {
    console.error('Chrome executable not found. Set --chrome-path or CHROME_PATH.');
    process.exit(2);
  }

  console.log(`Using Chrome: ${chromePath}`);
  console.log(`Target URL: ${url}`);

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: chromePath,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const page = await browser.newPage();
  const candidates = [];

  page.on('response', (res) => {
    const responseUrl = res.url();
    const headers = res.headers();
    const contentType = headers['content-type'] || '';
    if (isLikelyMainVideo(responseUrl, contentType)) {
      candidates.push(responseUrl);
      console.log(`[candidate] ${responseUrl}`);
    }
  });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  await new Promise((r) => setTimeout(r, 15000));
  await browser.close();

  const unique = [...new Set(candidates)];
  if (unique.length === 0) {
    console.error('No candidate video URL captured.');
    process.exit(1);
  }

  const best = unique[0];
  console.log(`Selected CDN URL:\n${best}`);

  const ok = downloadWithCurl(best, outputPath);
  if (!ok) {
    console.error('curl download failed.');
    process.exit(1);
  }

  const st = fs.statSync(outputPath);
  if (st.size < 1_000_000) {
    const sample = fs.readFileSync(outputPath, 'utf8').slice(0, 300);
    console.error(`Downloaded file too small (${st.size} bytes).`);
    console.error('Likely blocked/expired URL. Re-run immediately to refresh.');
    console.error(sample);
    process.exit(1);
  }

  console.log(`Saved: ${outputPath}`);
  console.log(`Size: ${st.size} bytes`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
