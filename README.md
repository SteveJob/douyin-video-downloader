# Douyin Video Downloader Skill

A LLM skill that downloads Douyin videos: open the page, read the **muxed** (video+audio) `play_addr` from Douyin's own data, download it with anti-hotlink headers, and verify with ffprobe that the result contains both streams.

> Douyin's web player serves video and audio as **separate DASH tracks**, so naively grabbing "the first `douyinvod.com` mp4" produces a silent video or an audio-only file. This skill reads the muxed `play_addr` instead and verifies every download.

## AI Quick Install

Copy this sentence to Claude Code or Codex:

```
Please install the Douyin Video Downloader skill from git@github.com:SteveJob/douyin-video-downloader.git into my skills directory, install required dependencies, and verify the script can run.
```

Download videos using skills

```
/douyin-video-downloader download the video <url>
```

## Feature Design

- URL input support:
  - `https://v.douyin.com/...` short links
  - `https://www.douyin.com/video/...` page links
- Muxed-address extraction:
  - Launches Chrome via `puppeteer-core`
  - Reads `video.play_addr` / `bit_rate[].play_addr` from API JSON and the page's embedded SSR store (`_ROUTER_DATA` / `RENDER_DATA`)
- Reliable download path:
  - Uses `curl` with browser-like headers (`Referer`, `User-Agent`, `Origin`, `Cookie`)
  - Avoids common `403 Forbidden` anti-hotlink failures
- Correctness check (key):
  - Verifies every download with `ffprobe` and keeps the first file with **both** video and audio streams
  - Falls back to muxing separate video/audio tracks with `ffmpeg` if needed
  - Fails if output is too small (HTML error) or no complete file can be produced

## Repository Layout

- `SKILL.md`: skill trigger + workflow instructions
- `agents/openai.yaml`: UI metadata
- `scripts/download_douyin_video.js`: executable downloader
