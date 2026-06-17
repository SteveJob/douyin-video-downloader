---
name: douyin-cdn-video-downloader
description: Extract Douyin CDN video URLs from Douyin share links or video page links and save the video locally. Use when a user asks to download a Douyin video, save a Douyin clip, resolve v.douyin.com short links, or reproduce website-style direct CDN extraction (open page, read muxed play_addr, then download with browser headers).
---

# Douyin CDN Video Downloader

Use this skill to download a Douyin video by reading the muxed (video+audio) play address from Douyin's own data and downloading it with browser-like headers.

> **Why not just grab the first `.mp4` the page loads?**
> Douyin's web player streams **video and audio as separate DASH tracks**. Capturing
> "the first `douyinvod.com` mp4" gives a file that is **video-only (silent)** or
> **audio-only (no picture)**. The script avoids this by reading the muxed
> `video.play_addr` from the API/SSR data and **verifying every download with
> ffprobe** (must contain both a video and an audio stream).

## Workflow

1. Normalize the input URL.
If the user provides `v.douyin.com/...`, keep it as input. The script will follow redirects automatically.

2. Run the downloader script.

```bash
node scripts/download_douyin_video.js \
  --url 'https://v.douyin.com/XXXXXXX/' \
  --output '/absolute/path/output.mp4'
```

The script self-verifies, but you should confirm both streams are present:

```bash
ffprobe -v error -show_entries stream=codec_type -of csv=p=0 /absolute/path/output.mp4
# expect BOTH lines: "video" and "audio"
ffprobe -v error -show_entries format=duration,size -of default=noprint_wrappers=1 /absolute/path/output.mp4
```

A correct result lists **both** a `video` and an `audio` stream. If you only see one,
the file is incomplete (re-run; CDN URLs are short-lived).

## Batch / profile downloads

This script downloads **one** video. To download every video on a creator's profile
(`douyin.com/user/...`), first collect each work's video-page URL + title, then call
this script per URL. The profile grid usually requires a logged-in browser session
to enumerate; the per-video download itself does not.

## Decision Rules

- Prefer this script over `yt-dlp` when Douyin returns cookie errors or anti-bot blocks.
- **Always verify both audio and video streams exist** (ffprobe). A non-tiny file is NOT
  proof of success — a silent video or audio-only file can be tens of MB.
- Prefer the muxed `play_addr` source (the script tries it first). Only fall back to raw
  player streams / ffmpeg muxing when no muxed source produces a complete file.
- Treat tiny files (for example `< 0.5 MB`) as failures; they are usually HTML error pages.
- If download fails with `403`, rerun quickly to refresh a short-lived CDN URL.
- Keep browser-like headers (`Referer`, `User-Agent`, `Origin`, `Cookie`) on the `curl` request.

## Prerequisites

- Node.js 18+
- Google Chrome installed
- `curl`
- `ffmpeg` (provides `ffprobe` for verification and `ffmpeg` for the DASH mux fallback)
- `puppeteer-core` package

Install dependency in the working directory when missing:

```bash
npm install puppeteer-core
```

If `ffprobe` is missing the script still runs but cannot verify streams and will accept
the first non-tiny file (risking a silent/audio-only result), so installing ffmpeg is
strongly recommended.

## Script

- `scripts/download_douyin_video.js`

Options: `--url` (required), `--output`, `--chrome-path`, `--timeout-ms` (default 120000),
`--keep-temp` (keep partial tracks for inspection).

What it does:
- Opens the Douyin URL in headless Chrome (follows `v.douyin.com` redirects)
- Reads muxed `play_addr` / `bit_rate[].play_addr` from API JSON responses **and** the
  page's embedded SSR store (`_ROUTER_DATA` / `RENDER_DATA`)
- Downloads candidates with anti-hotlink headers + session cookies, trying the muxed
  `play_addr` first
- Verifies each download with ffprobe and keeps the first file containing **both** video
  and audio streams
- Fallback: if only separate tracks exist, muxes video-only + audio-only with ffmpeg
- Fails if no complete file can be produced
