---
name: douyin-cdn-video-downloader
description: Extract Douyin CDN video URLs from Douyin share links or video page links and save the video locally. Use when a user asks to download a Douyin video, save a Douyin clip, resolve v.douyin.com short links, or reproduce website-style direct CDN extraction (open page, capture media request, then download with browser headers).
---

# Douyin CDN Video Downloader

Use this skill to download a Douyin video by reproducing the browser flow used by online downloader websites.

## Workflow

1. Normalize the input URL.
If the user provides `v.douyin.com/...`, keep it as input. The script will follow redirects automatically.

2. Run the downloader script.

```bash
node scripts/download_douyin_video.js \
  --url 'https://v.douyin.com/XXXXXXX/' \
  --output '/absolute/path/output.mp4'
```

3. Validate output.
Check that the output file is an MP4 and size is reasonable.

```bash
file /absolute/path/output.mp4
ffprobe -v error -show_entries format=duration,size -of default=noprint_wrappers=1 /absolute/path/output.mp4
```

## Decision Rules

- Prefer this script over `yt-dlp` when Douyin returns cookie errors or anti-bot blocks.
- Treat tiny files (for example `< 1 MB`) as failures; they are usually HTML error pages.
- If download fails with `403`, rerun quickly to refresh a short-lived CDN URL.
- Keep browser-like headers (`Referer`, `User-Agent`, `Origin`, `Accept`, `Range`) on the final `curl` request.

## Prerequisites

- Node.js 18+
- Google Chrome installed
- `curl`
- `puppeteer-core` package

Install dependency in the working directory when missing:

```bash
npm install puppeteer-core
```

## Script

- `scripts/download_douyin_video.js`

What it does:
- Open the Douyin URL in headless Chrome
- Capture network responses
- Pick a candidate `douyinvod.com` MP4 URL
- Download with anti-hotlink headers
- Fail if the resulting file is suspiciously small
