#!/usr/bin/env node

/*
 * Douyin video downloader.
 *
 * Strategy (important): Douyin's web player streams VIDEO and AUDIO as separate
 * DASH tracks. Grabbing "the first douyinvod.com .mp4 the player loads" therefore
 * yields a file that is video-only (no sound) or audio-only (no picture).
 *
 * To get a complete file we instead read the MUXED progressive URL from Douyin's
 * own data (`video.play_addr` / `video.bit_rate[].play_addr`), found either in an
 * API JSON response or in the page's embedded SSR store. Every candidate is then
 * verified with ffprobe to confirm it actually contains BOTH a video and an audio
 * stream before we accept it. If only separate tracks exist, we mux them with
 * ffmpeg as a last resort.
 */

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
    if (k === '--keep-temp') out.keepTemp = true;
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
    if (p.includes('/') || p.includes('\\')) {
      if (fs.existsSync(p)) return p;
    } else {
      const which = spawnSync('which', [p], { encoding: 'utf8' });
      if (which.status === 0) return which.stdout.trim();
    }
  }
  return null;
}

function hasBinary(name) {
  const res = spawnSync(name, ['-version'], { encoding: 'utf8' });
  return res.status === 0 || res.status === 1; // some print version to stderr w/ status 1
}

// Recursively walk a JSON object and collect every muxed play address.
// Returns array of { urls: string[], tag, priority } (lower priority = try first).
function collectPlayAddrs(node, acc, seen, depthKey) {
  if (!node || typeof node !== 'object') return;
  const pushAddr = (pa, tag, priority) => {
    if (!pa || typeof pa !== 'object') return;
    const list = pa.url_list || pa.urlList || [];
    const urls = list.filter((u) => typeof u === 'string' && u.startsWith('http'));
    if (!urls.length) return;
    const key = urls[0];
    if (seen.has(key)) return;
    seen.add(key);
    acc.push({ urls, tag, priority });
  };

  // direct muxed addresses on a video object
  for (const k of ['play_addr', 'playAddr', 'play_addr_h264', 'playAddrH264', 'play_addr_265', 'play_addr_h265']) {
    if (node[k]) pushAddr(node[k], k, /265|h265/i.test(k) ? 2 : 0);
  }
  // bit_rate variants (each entry has its own play_addr)
  const brs = node.bit_rate || node.bitRate;
  if (Array.isArray(brs)) {
    brs.forEach((b, i) => {
      if (b && (b.play_addr || b.playAddr)) {
        pushAddr(b.play_addr || b.playAddr, `bit_rate_${i}_${b.gear_name || b.gearName || ''}`, 1);
      }
    });
  }

  for (const key of Object.keys(node)) {
    const v = node[key];
    if (v && typeof v === 'object') collectPlayAddrs(v, acc, seen, key);
  }
}

function isLikelyMediaResponse(url, contentType) {
  const ct = (contentType || '').toLowerCase();
  const u = url.toLowerCase();
  return (
    (u.includes('douyinvod.com') || u.includes('/video/tos/') || u.includes('.douyinstatic.com')) &&
    (ct.includes('video/') || ct.includes('audio/') || u.includes('mime_type=video_mp4') || u.includes('.mp4'))
  );
}

function curlDownload(url, outputPath, cookieStr) {
  const ua =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';
  const args = [
    '-sL', url,
    '-H', 'Referer: https://www.douyin.com/',
    '-H', `User-Agent: ${ua}`,
    '-H', 'Accept: */*',
    '-H', 'Origin: https://www.douyin.com',
  ];
  if (cookieStr) args.push('-H', `Cookie: ${cookieStr}`);
  args.push('-o', outputPath);
  const res = spawnSync('curl', args, { stdio: 'ignore' });
  return res.status === 0;
}

// Returns { v, a } stream counts, or null if ffprobe is unavailable.
function probeStreams(file, ffprobeOK) {
  if (!ffprobeOK) return null;
  const r = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', file],
    { encoding: 'utf8' }
  );
  const out = r.stdout || '';
  return { v: (out.match(/video/g) || []).length, a: (out.match(/audio/g) || []).length };
}

async function main() {
  const args = parseArgs(process.argv);
  const url = args.url;
  const outputPath = args.output ? path.resolve(args.output) : path.resolve('douyin_video.mp4');
  const timeoutMs = Number.isFinite(args.timeoutMs) ? args.timeoutMs : 120000;
  const MIN_BYTES = 500_000;

  if (!url) {
    console.error('Usage: node scripts/download_douyin_video.js --url <douyin-url> [--output <file.mp4>] [--chrome-path <path>] [--timeout-ms 120000]');
    process.exit(2);
  }

  const chromePath = pickChromePath(args.chromePath);
  if (!chromePath) {
    console.error('Chrome executable not found. Set --chrome-path or CHROME_PATH.');
    process.exit(2);
  }

  const ffprobeOK = hasBinary('ffprobe');
  const ffmpegOK = hasBinary('ffmpeg');
  if (!ffprobeOK) {
    console.warn('WARNING: ffprobe not found. Cannot verify audio+video; accepting first non-tiny file (may be silent or audio-only). Install ffmpeg to enable verification.');
  }

  console.log(`Using Chrome: ${chromePath}`);
  console.log(`Target URL: ${url}`);

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: chromePath,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36'
  );

  const muxedCandidates = []; // from JSON / embedded data (preferred)
  const seenUrls = new Set();
  const networkMedia = []; // raw player streams (legacy fallback / mux source)

  page.on('response', async (res) => {
    const responseUrl = res.url();
    const headers = res.headers();
    const contentType = headers['content-type'] || '';

    if (isLikelyMediaResponse(responseUrl, contentType)) {
      networkMedia.push(responseUrl);
    }

    // Parse JSON API responses for muxed play addresses.
    if (contentType.includes('application/json') || /\/aweme\/|\/web\/|aweme_id=/.test(responseUrl)) {
      try {
        const json = await res.json();
        collectPlayAddrs(json, muxedCandidates, seenUrls);
      } catch {
        /* not json / already consumed */
      }
    }
  });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  await new Promise((r) => setTimeout(r, 8000));

  // Also read play addresses embedded in the page's SSR store (covers single
  // video pages that render data inline instead of via XHR).
  try {
    const dumps = await page.evaluate(() => {
      const out = [];
      try { if (window._ROUTER_DATA) out.push(JSON.stringify(window._ROUTER_DATA)); } catch (e) {}
      try {
        const el = document.getElementById('RENDER_DATA');
        if (el && el.textContent) out.push(decodeURIComponent(el.textContent));
      } catch (e) {}
      return out;
    });
    for (const d of dumps) {
      try { collectPlayAddrs(JSON.parse(d), muxedCandidates, seenUrls); } catch {}
    }
  } catch {
    /* ignore */
  }

  const cookies = await page.cookies('https://www.douyin.com');
  const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  await browser.close();

  // Build ordered try-list: muxed candidates first (by priority), then raw streams.
  muxedCandidates.sort((a, b) => a.priority - b.priority);
  const ordered = [
    ...muxedCandidates.map((c) => ({ urls: c.urls, tag: c.tag })),
    ...[...new Set(networkMedia)].map((u) => ({ urls: [u], tag: 'network-stream' })),
  ];

  if (ordered.length === 0) {
    console.error('No video URL found (no play_addr in JSON/SSR and no media response captured).');
    process.exit(1);
  }
  console.log(`Found ${ordered.length} candidate source(s). Trying for a complete (video+audio) file...`);

  const tmp = outputPath + '.part';
  const partials = []; // { file, v, a } kept for possible mux
  let success = false;

  for (const cand of ordered) {
    for (const u of cand.urls) {
      if (!curlDownload(u, tmp, cookieStr)) continue;
      const size = fs.existsSync(tmp) ? fs.statSync(tmp).size : 0;
      if (size < MIN_BYTES) { fs.rmSync(tmp, { force: true }); continue; }

      const s = probeStreams(tmp, ffprobeOK);
      if (s === null) {
        // can't verify -> accept best-effort
        fs.renameSync(tmp, outputPath);
        console.log(`Saved (unverified): ${outputPath} (${(size / 1e6).toFixed(1)} MB) [${cand.tag}]`);
        success = true;
        break;
      }
      if (s.v >= 1 && s.a >= 1) {
        fs.renameSync(tmp, outputPath);
        console.log(`Saved: ${outputPath} (${(size / 1e6).toFixed(1)} MB, video+audio) [${cand.tag}]`);
        success = true;
        break;
      }
      // incomplete track: stash a copy for potential muxing, then keep trying
      if ((s.v >= 1 && s.a === 0) || (s.a >= 1 && s.v === 0)) {
        const kind = s.v >= 1 ? 'video' : 'audio';
        const keep = `${outputPath}.${kind}.part`;
        if (!partials.some((p) => p.kind === kind)) {
          fs.copyFileSync(tmp, keep);
          partials.push({ file: keep, kind });
        }
      }
      fs.rmSync(tmp, { force: true });
    }
    if (success) break;
  }

  // Fallback: mux separate video-only + audio-only tracks.
  if (!success) {
    const v = partials.find((p) => p.kind === 'video');
    const a = partials.find((p) => p.kind === 'audio');
    if (v && a && ffmpegOK) {
      console.log('No muxed source worked; muxing separate video + audio tracks with ffmpeg...');
      const r = spawnSync('ffmpeg', ['-y', '-i', v.file, '-i', a.file, '-c', 'copy', '-movflags', '+faststart', outputPath], { stdio: 'ignore' });
      const s = r.status === 0 ? probeStreams(outputPath, ffprobeOK) : null;
      if (r.status === 0 && (!s || (s.v >= 1 && s.a >= 1))) {
        const size = fs.statSync(outputPath).size;
        console.log(`Saved: ${outputPath} (${(size / 1e6).toFixed(1)} MB, muxed video+audio)`);
        success = true;
      } else {
        console.error('ffmpeg mux failed to produce a complete file.');
      }
    } else if (v && a && !ffmpegOK) {
      console.error('Found separate video and audio tracks but ffmpeg is not installed to mux them. Install ffmpeg.');
    }
  }

  // cleanup temp/partials unless asked to keep
  if (!args.keepTemp) {
    fs.rmSync(tmp, { force: true });
    partials.forEach((p) => fs.rmSync(p.file, { force: true }));
  }

  if (!success) {
    console.error('Failed to produce a complete video+audio file. Re-run (CDN URLs are short-lived) or pass --keep-temp to inspect partial tracks.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
