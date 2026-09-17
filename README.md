# MusicCopilot

基于 **Vue 3 + TypeScript + Vite + shadcn-vue** 的音乐搜索与下载应用：前端 SPA + 自建后端（`server/`，对接酷我音源）同仓一体，Docker Compose 一键部署，**无需再部署 Simple SQ Music Plus**（v0.2.0 起由自建后端完全替代；过渡期接口契约与其保持对齐）。

[![Build & Publish Docker Image](https://github.com/supgeek-rod/MusicCopilot/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/supgeek-rod/MusicCopilot/actions/workflows/docker-publish.yml)

📖 **在线文档站**：<https://supgeek-rod.github.io/MusicCopilot/>（源码在 [docs/](docs/)，VitePress 构建，推送 `main` 分支自动发布）

## 仓库结构

monorepo（2026-09-11 起）：根目录为 Web 前端（本 README 所述）；[`server/`](server/README.md) 为自建后端
（**PHP / Laravel 13**，对接酷我音源，按 SQMusic 契约实现，含 Scalar/Scramble 文档测试台）；
[`packages/api-contract`](packages/api-contract/README.md) 为前后端契约类型（由 `server/openapi.json` 自动生成）。

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
npm run dev        # 开发，默认 http://localhost:5173（先 cp .env.example .env 配置后端地址；
                   #  自建后端开发服务见 server/README.md，如 http://127.0.0.1:8097）
npm run build      # vue-tsc 类型检查 + Vite 构建，产物输出 dist/
npm run preview    # 本地预览构建产物
```

后端地址与账号通过 `MC_*` 环境变量配置，详见文档站[配置说明](docs/configuration.md)。

## Docker 部署

推荐**克隆仓库用自带 compose 一键拉起三容器**（web 前端 + server API + server-worker 下载队列，自建后端自包含，无需 SQ Music）：

```bash
git clone https://github.com/supgeek-rod/MusicCopilot.git && cd MusicCopilot
cp .env.example .env

# .env 中设置：
#   COMPOSE_PROFILES=server
#   MC_API_BASE_URL=http://server:8097                  # web 容器反代到自建后端（compose 服务名）
#   MC_MUSIC_HOST_DIR=/path/to/music                   # 音乐库目录（下载落盘处）
#   MC_AUTH_USERNAME / MC_AUTH_PASSWORD                # 自建后端登录凭证（默认 admin/admin）

docker compose up -d
```

- 前端镜像由 CI 自动构建发布到 **Docker Hub / GHCR**（`amd64` + `arm64` 双架构），容器内置 nginx（托管静态文件 + `/api` 反代，同源免 CORS）；自建后端镜像（`server/Dockerfile`，php:8.4-cli-alpine）首次由 compose 本地构建
- 下载完成后 worker 按目录模板（`MC_DIR_TEMPLATE`，默认 `歌手/专辑/`）重排，飞牛音乐 / Navidrome 等媒体库可直接扫描入库

仅需前端、对接外部既有后端（如尚在运行的 SQ Music）的单容器部署方式见文档站[部署指南](docs/deployment.md)。

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
| `docs/api-test-report.md` | 已退役 SQMusic 后端的接口实测报告（历史参考，防坑记录；不发布到文档站） |

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

见 [docs/roadmap.md](docs/roadmap.md)：第 1 期前端基础 ✅ → 第 3 期 fnOS 音乐库对接 🚧 → 第 4 期音乐库体检（已随架构调整移除）→ 第 5 期自建后端替换 SQ Music ✅ → 第 6 期 Docker 整体交付 ✅。

## 文档站开发

```bash
npm run docs:dev      # 文档站本地开发，http://localhost:5174
npm run docs:build    # 构建文档站（含死链检查）
npm run docs:preview  # 本地预览文档站构建产物
```

推送 `main` 分支后由 [.github/workflows/deploy-docs.yml](.github/workflows/deploy-docs.yml) 自动发布到 GitHub Pages。
