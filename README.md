# MusicCopilot

基于 **Vue 3 + TypeScript + Vite + shadcn-vue** 的音乐搜索与下载应用：前端 SPA + 自建后端（`server/`，对接酷我音源）同仓一体，Docker Compose 一键部署。v0.2.0 起由自建后端完全替代第三方后端，无需额外部署。

[![Build & Publish Docker Image](https://github.com/supgeek-rod/MusicCopilot/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/supgeek-rod/MusicCopilot/actions/workflows/docker-publish.yml)

📖 **在线文档站**：<https://supgeek-rod.github.io/MusicCopilot/>（源码在 [docs/](docs/)，VitePress 构建，推送 `development` 分支自动发布）

## 仓库结构

monorepo（2026-09-11 起）：根目录为 Web 前端（本 README 所述）；[`server/`](server/README.md) 为自建后端
（**PHP / Laravel 13**，对接酷我音源，含 Scalar/Scramble 文档测试台）；
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
- **深色模式**、运行时配置文件（自建后端无认证，连接即用）
- **PWA**：可安装到桌面 / 手机主屏，静态资源预缓存 + 封面图缓存（`/api` 与 `config.json` 永不缓存）

完整功能与实现要点见 [docs/features.md](docs/features.md)。

## 本地开发

前后端一体 monorepo，本地完整启动 = **后端 API（17017）+ 下载队列 worker + 前端 dev（17016）** 三个进程：

```bash
# 后端（需 PHP ≥ 8.3 + Composer；SQLite，无需其它数据库）
cd server
composer install && cp .env.example .env
php artisan key:generate && php artisan migrate    # 首次；migrate 按提示创建 SQLite 文件
php artisan serve --port=17017                     # 终端 1：HTTP API
php artisan queue:work --tries=1 --timeout=3600    # 终端 2：下载队列 worker（serve 不带队列，缺它下载停在「等待中」）

# 前端（新终端）
cp .env.example .env    # 并取消注释 MC_API_BASE_URL=http://127.0.0.1:17017（dev/preview 必填）
npm install
npm run dev             # http://localhost:17016，/api 由 Vite 代理转发到后端
```

后端地址等通过 `MC_*` 环境变量配置，详见文档站[配置说明](docs/configuration.md)；完整步骤（构建、预览、文档站开发）见[本地开发](docs/getting-started.md)。

## Docker 部署

推荐**克隆仓库用自带 compose 一键拉起两容器**（web 前端 + server 后端，server 内含下载队列 worker，自包含零外部依赖）：

```bash
git clone https://github.com/supgeek-rod/MusicCopilot.git && cd MusicCopilot
cp .env.example .env

# .env 默认值即可部署（自建后端无认证，无需账号密码），按需调整：
#   MC_MUSIC_DOWNLOAD_DIR=/path/to/music               # 音乐库目录（下载落盘处）

docker compose up -d
```

- 前端镜像（`ghcr.io/supgeek-rod/music-copilot`）与自建后端镜像（`ghcr.io/supgeek-rod/music-copilot-server`，`amd64` + `arm64` 双架构）均由 CI 自动构建发布，Docker Hub 同步分发；容器内置 nginx（托管静态文件 + `/api` 反代，同源免 CORS）
- 下载完成后 worker 按路径模板（`MC_MUSIC_DOWNLOAD_PATH_TEMPLATE`，默认 `歌手/专辑/`）重排，飞牛音乐 / Navidrome 等媒体库可直接扫描入库

仅前端单容器部署等更多方式见文档站[部署指南](docs/deployment.md)。

## 文档

| 文档 | 说明 |
| --- | --- |
| [在线文档站](https://supgeek-rod.github.io/MusicCopilot/) | 以下内容的发布版本 |
| [docs/getting-started.md](docs/getting-started.md) | 本地开发（环境要求 / 后端与队列 / 前端 / 构建 / 文档站） |
| [docs/configuration.md](docs/configuration.md) | 配置说明（MC_* 变量、config.json、CORS） |
| [docs/deployment.md](docs/deployment.md) | 部署指南（Docker / 静态） |
| [docs/features.md](docs/features.md) | 功能说明（页面/交互/实现要点） |
| [docs/architecture.md](docs/architecture.md) | 整体架构设计（按路线图演进） |
| [docs/roadmap.md](docs/roadmap.md) | 开发路线图（第 1-6 期） |

## 目录结构

```
.env / .env.example    # 运行配置（后端地址等；.env 不入库，模板见 .env.example）
Dockerfile             # 前端镜像（多阶段构建，nginx 托管 + /api 反代）
docker-compose.yml     # 一键编排（默认拉取 CI 预构建镜像，容器变量显式声明）
docker/                # nginx 反代模板 + 容器入口配置生成脚本
.github/workflows/     # CI：Docker 镜像构建发布 + 文档站 Pages 部署
docs/                  # 项目文档（VitePress 文档站，docs as code）
src/api/               # 接口封装（axios + 统一响应解包）
src/stores/            # Pinia：应用配置与连接状态 / 播放队列
src/views/             # 搜索页、歌手页、专辑页、下载任务页
src/components/        # 歌曲列表、下载音质菜单、播放条、歌词弹窗、歌手/专辑页组件
src/components/ui/     # shadcn-vue 生成的本地 UI 组件
src/lib/               # 工具：格式化、数据适配（adapter）、富文本净化（sanitize）
```

## 开发路线图

见 [docs/roadmap.md](docs/roadmap.md)：第 1 期前端基础 ✅ → 第 3 期 fnOS 音乐库对接 🚧 → 第 4 期音乐库体检（已随架构调整移除）→ 第 5 期自建后端 ✅ → 第 6 期 Docker 整体交付 ✅。

## 文档站开发

```bash
npm run docs:dev      # 文档站本地开发，http://localhost:5174
npm run docs:build    # 构建文档站（含死链检查）
npm run docs:preview  # 本地预览文档站构建产物
```

推送 `development` 分支后由 [.github/workflows/deploy-docs.yml](.github/workflows/deploy-docs.yml) 自动发布到 GitHub Pages。
