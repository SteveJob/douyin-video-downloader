# Douyin CDN Video Downloader Skill

[中文说明](#中文说明)

A Codex skill that downloads Douyin videos by reproducing the browser flow used by online downloader websites: open page, capture playable CDN URL, then download with anti-hotlink headers.

## AI Quick Install

Copy this sentence to Codex or Claude Code:

`Please install the Douyin CDN Video Downloader skill from git@github.com:SteveJob/douyin-video-downloader.git into my $CODEX_HOME/skills directory, install required dependencies, and verify the script can run.`

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

## Installation

### 1. Clone this repository

```bash
git clone git@github.com:SteveJob/douyin-video-downloader.git
cd douyin-video-downloader
```

### 2. Install dependencies

```bash
npm install puppeteer-core
```

### 3. Ensure runtime tools are available

- Node.js 18+
- Google Chrome
- `curl`

## How to Use

Run from repository root:

```bash
node scripts/download_douyin_video.js \
  --url 'https://v.douyin.com/HQEY0a5lrrY/' \
  --output '/absolute/path/video.mp4'
```

Optional parameters:

- `--chrome-path <path>`: explicit Chrome executable path
- `--timeout-ms <ms>`: page load timeout (default: `120000`)

## Verify Output

```bash
file /absolute/path/video.mp4
ffprobe -v error -show_entries format=duration,size -of default=noprint_wrappers=1 /absolute/path/video.mp4
```

## Install as a Codex Skill

Copy this folder into your `$CODEX_HOME/skills` directory (folder name can stay `douyin-cdn-video-downloader`), then restart/reload Codex so it can discover the skill metadata.

---

## 中文说明

[Back to English](#douyin-cdn-video-downloader-skill)

这是一个 Codex Skill，用于按“网页解析站”的方式下载抖音视频：打开页面、抓取可播放 CDN 链接、再带防盗链请求头下载。

### 功能设计

- 支持链接类型：
  - `https://v.douyin.com/...` 短链
  - `https://www.douyin.com/video/...` 视频页链接
- 抓链方式：
  - 通过 `puppeteer-core` 启动 Chrome
  - 监听网络请求，提取 `douyinvod.com` 的 MP4 候选地址
- 稳定下载：
  - 使用 `curl` + 浏览器风格请求头（`Referer`、`User-Agent`、`Origin`、`Range`）
  - 降低 `403 Forbidden` 防盗链拦截概率
- 失败保护：
  - 输出文件过小自动判定失败（避免把错误 HTML 当作视频）

### 安装

1. 克隆仓库

```bash
git clone git@github.com:SteveJob/douyin-video-downloader.git
cd douyin-video-downloader
```

2. 安装依赖

```bash
npm install puppeteer-core
```

3. 准备运行环境

- Node.js 18+
- Google Chrome
- `curl`

### 使用方法

```bash
node scripts/download_douyin_video.js \
  --url 'https://v.douyin.com/HQEY0a5lrrY/' \
  --output '/绝对路径/视频.mp4'
```

可选参数：

- `--chrome-path <path>`：手动指定 Chrome 可执行文件路径
- `--timeout-ms <ms>`：页面加载超时（默认 `120000`）

### 结果校验

```bash
file /绝对路径/视频.mp4
ffprobe -v error -show_entries format=duration,size -of default=noprint_wrappers=1 /绝对路径/视频.mp4
```

### 作为 Codex Skill 安装

把本仓库目录复制到 `$CODEX_HOME/skills` 下，然后重启/刷新 Codex，让其重新发现 Skill。
