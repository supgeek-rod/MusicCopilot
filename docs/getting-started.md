---
title: 本地开发
description: 本地启动后端 API、下载队列 worker 与前端开发服务器，以及构建与文档站开发
---

# 本地开发

MusicCopilot 是前后端一体 monorepo：根目录为 Web 前端（Vue 3 SPA），[`server/`](https://github.com/supgeek-rod/MusicCopilot/tree/development/server) 为自建后端（PHP / Laravel 13，酷我音源），自包含、无认证、连接即用。本地完整跑起来需要**三个进程**：后端 API、下载队列 worker、前端开发服务器；端口约定 **API `17017` / 前端 `17016`**。

## 环境要求

- Node.js ≥ 20.19（推荐 22 LTS）与 npm（仓库带 `package-lock.json`，建议直接使用 npm）
- PHP ≥ 8.3 与 Composer（仅 `server/` 需要；Windows 建议在 WSL2 内安装）

## 后端（端口 17017）

后端是两个独立进程：`php artisan serve` 只提供 HTTP API，**不带队列**；下载任务由队列 worker 执行，不启动它下载会一直停在「等待中」。

```bash
cd server
composer install
cp .env.example .env       # 默认 SQLite，无需其它数据库
php artisan key:generate
php artisan migrate        # 首次运行按提示创建 SQLite 数据库文件

php artisan serve --port=17017                    # 终端 1：HTTP API
php artisan queue:work --tries=1 --timeout=3600   # 终端 2：下载队列 worker
```

- 探活：`curl http://127.0.0.1:17017/api/healthcheck`（恒 200）；交互式 API 文档台：`http://127.0.0.1:17017/api-docs.html`（Scalar）
- 本地下载落盘 `server/storage/app/downloads`（`MC_MUSIC_DOWNLOAD_DIR` 未配置时的默认值）
- 改动 `server/` 代码后需重启 worker 生效；API 并发排队可设 `PHP_CLI_SERVER_WORKERS=4`（`server/.env.example` 有注释行）
- ⚠️ 酷我直链解析有大陆 IP 区域限制（海外返回 407），搜索/详情/歌词不受影响，见 `server/docs/kuwo-api-notes.md`

## 前端（端口 17016）

```bash
cp .env.example .env
npm install

# ⚠️ 必做：编辑 .env，取消注释这行并指向本地后端（缺它 npm run dev 启动即失败）
#   MC_API_BASE_URL=http://127.0.0.1:17017
npm run dev                # http://localhost:17016，/api 由 Vite 代理转发到后端
```

- dev / preview 下 `MC_API_BASE_URL` **必填**，`npm run dev` 启动报「缺少 MC_API_BASE_URL」即为未配置
- `MC_WEB_PORT`（`.env.example` 默认 `17016`）同时是 dev / preview 的服务器端口；端口被占用自动 +1
- 飞牛音乐库联调另配 `MC_FNOS_*`（见[配置说明](./configuration.md)），`/fnos` 同样由 Vite 代理

## 构建与预览

```bash
npm run build      # vue-tsc 类型检查 + Vite 构建，产物输出 dist/
npm run preview    # 本地预览构建产物（同样走 /api 代理，MC_API_BASE_URL 必填）
```

部署方式（Docker / 静态托管）见[部署指南](./deployment.md)。

## 文档站

项目文档基于 VitePress，源码即站点（docs as code），文档源文件在 `docs/`：

```bash
npm run docs:dev      # 文档站本地开发，http://localhost:17015
npm run docs:build    # 构建到 docs/.vitepress/dist（含死链检查），改动 docs/ 后提交前应构建通过
npm run docs:preview  # 本地预览文档站构建产物
```

推送 `development` 分支后，GitHub Actions 自动构建并发布到 GitHub Pages：<https://supgeek-rod.github.io/MusicCopilot/>

## 下一步

- [配置说明](./configuration.md) —— MC_* 环境变量、config.json 与 CORS 方案
- [部署指南](./deployment.md) —— Docker 一键部署 / 静态部署
- [功能说明](./features.md) —— 已实现功能与实现要点
- [开发路线图](./roadmap.md) —— 项目演进计划
