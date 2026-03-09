# Douyin CDN Video Downloader Skill

A LLM skill that downloads Douyin videos by reproducing the browser flow used by online downloader websites: open page, capture playable CDN URL, then download with anti-hotlink headers.

## AI Quick Install

Copy this sentence to Claude Code or Codex:

```
Please install the Douyin Video Downloader skill from git@github.com:SteveJob/douyin-video-downloader.git into my skills directory, install required dependencies, and verify the script can run.
```

```
/douyin-video-downloader download the video <url>
```

## Feature Design

- URL input support:
  - `https://v.douyin.com/...` short links
  - `https://www.douyin.com/video/...` page links
- Browser-network extraction:
  - Launches Chrome via `puppeteer-core`
  - Captures candidate MP4 CDN requests from `douyinvod.com`
- Reliable download path:
  - Uses `curl` with browser-like headers (`Referer`, `User-Agent`, `Origin`, `Range`)
  - Avoids common `403 Forbidden` anti-hotlink failures
- Basic safety check:
  - Fails if output file is too small (usually HTML error response instead of video)

## Repository Layout

- `SKILL.md`: skill trigger + workflow instructions
- `agents/openai.yaml`: UI metadata
- `scripts/download_douyin_video.js`: executable downloader
