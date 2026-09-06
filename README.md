# MusicCopilot

基于 **Vue 3 + TypeScript + Vite + shadcn-vue** 的音乐搜索与下载 Web 客户端，对接 [Simple SQ Music Plus](https://github.com/59799517/simple_sq_music_plus) 的 HTTP 接口。

[![Build & Publish Docker Image](https://github.com/supgeek-rod/MusicCopilot/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/supgeek-rod/MusicCopilot/actions/workflows/docker-publish.yml)

📖 **在线文档站**：<https://supgeek-rod.github.io/MusicCopilot/>（源码在 [docs/](docs/)，VitePress 构建，推送 `v0.1.x` 分支自动发布）

## 功能

- **歌曲搜索**：酷我音源、搜索联想词（防抖）、搜索历史、分页、音质标签（按码率从高到低排序）
- **在线试听**：底部迷你播放条，流式播放高音质直链，播放队列连播、刷新后恢复
- **歌词查看**：弹窗展示 LRC 歌词
- **歌手页 / 专辑页**：歌手头像与简介、专辑封面与详情、曲目列表，播放整张（入队连播）、一键下载整张 / 歌手全部专辑
- **歌曲下载**：歌曲行一键下载（默认最高音质，可设置偏好音质、自动就近降/升档）；「更多操作」菜单提供**服务器下载队列**（可选音质，任务页看进度）与**浏览器直链下载**两种方式
- **下载任务管理**：状态徽标、5 秒轮询自动刷新、单条重试/重新入队/删除、批量重试与批量删除（带确认框）、按状态筛选
- **下载完成通知**：全局 toast 提醒（批量完成自动聚合成摘要，任意页面可见）
- **设置**：下载音质偏好、按设备覆盖后端连接（仅存浏览器本地）
- **深色模式**、登录态自动维护（token 失效自动重登）、运行时配置文件
- **PWA**：可安装到桌面 / 手机主屏，静态资源预缓存 + 封面图缓存（`/api` 与 `config.json` 永不缓存）

完整功能与实现要点见 [docs/features.md](docs/features.md)。

## 快速开始

```bash
npm install
npm run dev        # 开发，默认 http://localhost:5173（先 cp .env.example .env 配置后端地址）
npm run build      # vue-tsc 类型检查 + Vite 构建，产物输出 dist/
npm run preview    # 本地预览构建产物
```

后端地址与账号通过 `MC_*` 环境变量配置，详见文档站[配置说明](docs/configuration.md)。

## Docker 部署

镜像由 CI 自动构建发布到 **Docker Hub / GHCR**（`amd64` + `arm64` 双架构），**推荐用 Compose 直接拉取预构建镜像**，无需克隆仓库、无需本地构建。容器内置 nginx（托管静态文件 + `/api` 反代，同源免 CORS），改配置重启容器即可、无需重建镜像：

```yaml
# docker-compose.yml
services:
  web:
    image: supgeekrod/music-copilot:latest   # 或 GHCR：ghcr.io/supgeek-rod/music-copilot:latest
    container_name: music-copilot
    ports:
      - "17016:80"                # 对外端口，按需修改
    environment:
      MC_API_BASE_URL: http://<后端地址>:8096   # 必填：SQ Music 后端地址
      MC_API_USERNAME: admin      # 自动登录账号
      MC_API_PASSWORD: admin
    extra_hosts:
      - "host.docker.internal:host-gateway"
    restart: unless-stopped
```

```bash
docker compose up -d
```

更多部署方式（克隆仓库用自带 compose / docker run / 本地构建）、升级与镜像 tag 规则见文档站[部署指南](docs/deployment.md)。

## 文档

| 文档 | 说明 |
| --- | --- |
| [在线文档站](https://supgeek-rod.github.io/MusicCopilot/) | 以下内容的发布版本 |
| [docs/getting-started.md](docs/getting-started.md) | 快速开始（环境要求 / 开发 / 构建 / 文档站开发） |
| [docs/configuration.md](docs/configuration.md) | 配置说明（MC_* 变量、config.json、CORS） |
| [docs/deployment.md](docs/deployment.md) | 部署指南（Docker / 静态） |
| [docs/features.md](docs/features.md) | 功能说明（页面/交互/实现要点） |
| [docs/architecture.md](docs/architecture.md) | 整体架构设计（按路线图演进） |
| [docs/roadmap.md](docs/roadmap.md) | 开发路线图（第 1-6 期） |
| `docs/api-test-report.md` | SQ Music 接口实测报告（内部资料，调用接口前必读；不发布到文档站） |

## 目录结构

```
.env / .env.example    # 运行配置（后端地址 / 账号；.env 不入库，模板见 .env.example）
Dockerfile             # 前端镜像（多阶段构建，nginx 托管 + /api 反代）
docker-compose.yml     # 一键编排（默认拉取 CI 预构建镜像，env_file 复用 .env）
docker/                # nginx 反代模板 + 容器入口配置生成脚本
.github/workflows/     # CI：Docker 镜像构建发布 + 文档站 Pages 部署
docs/                  # 项目文档（VitePress 文档站，docs as code）
src/api/               # 接口封装（axios + 统一响应解包 + 403 自动重登）
src/stores/            # Pinia：应用配置登录态 / 播放队列
src/views/             # 搜索页、歌手页、专辑页、下载任务页
src/components/        # 歌曲列表、下载音质菜单、播放条、歌词弹窗、歌手/专辑页组件
src/components/ui/     # shadcn-vue 生成的本地 UI 组件
src/lib/               # 工具：格式化、数据适配（adapter）、富文本净化（sanitize）
```

## 开发路线图

见 [docs/roadmap.md](docs/roadmap.md)：第 1 期（已完成）→ 第 2 期纯前端增强 → 第 3-4 期 Companion 伴生服务（fnOS 对接 / 音乐库体检）→ 第 5 期自建下载服务替换 SQ Music → 第 6 期 Docker 整体交付。

## 文档站开发

```bash
npm run docs:dev      # 文档站本地开发，http://localhost:5174
npm run docs:build    # 构建文档站（含死链检查）
npm run docs:preview  # 本地预览文档站构建产物
```

推送 `v0.1.x` 分支后由 [.github/workflows/deploy-docs.yml](.github/workflows/deploy-docs.yml) 自动发布到 GitHub Pages。
