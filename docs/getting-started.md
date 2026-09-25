---
title: 快速开始
description: MusicCopilot 项目简介与最快上手路径：Docker 一键部署或本地开发
---

# 快速开始

MusicCopilot 是**音乐搜索、试听与下载客户端**：[`web/`](https://github.com/supgeek-rod/MusicCopilot/tree/development/web) 为 Web 前端（Vue 3 + TypeScript + shadcn-vue），[`server/`](https://github.com/supgeek-rod/MusicCopilot/tree/development/server) 为自建后端（PHP / Laravel 13，酷我音源），前后端同仓一体。自建后端无认证、连接即用，v0.2.0 起无需任何第三方服务；下载完成后按「歌手/专辑/」自动重排目录，可被飞牛音乐 / Navidrome 等媒体库直接扫描入库；支持安装为 PWA。

两条上手路径任选，端口约定 **API `17017` / 前端 `17016`**。

## 路径一：Docker 部署（推荐，一条命令）

```bash
git clone https://github.com/supgeek-rod/MusicCopilot.git && cd MusicCopilot
cp .env.example .env    # 默认值即可部署；下载目录按需改 MC_MUSIC_DOWNLOAD_DIR
docker compose up -d    # 拉起 web + server 两容器
```

访问 `http://localhost:17016` 即可使用（CI 预构建镜像，GHCR / Docker Hub 双发布）。变量说明、镜像 tag 选择、升级与迁移见 **[Docker 部署](./deployment.md)**。

## 路径二：本地开发（三个进程）

本地完整跑起来 = **后端 API（17017）+ 下载队列 worker + 前端 dev（17016）**：

```bash
# 后端（需 PHP ≥ 8.3 + Composer；SQLite，无需其它数据库）
cd server
composer install && cp .env.example .env
php artisan key:generate && php artisan migrate    # 首次；migrate 按提示创建 SQLite 文件
php artisan serve --port=17017                     # 终端 1：HTTP API
php artisan queue:work --tries=1 --timeout=3600    # 终端 2：下载队列 worker

# 前端（新终端；需 Node.js ≥ 20.19）
cd web
cp .env.example .env
# ⚠️ 必做：编辑 .env 取消注释这行（dev/preview 必填，缺它 npm run dev 启动即失败）
#   MC_API_BASE_URL=http://127.0.0.1:17017
npm install && npm run dev    # http://localhost:17016
```

环境要求、实操注记（探活、Scalar 文档台、下载落盘位置等）、构建与文档站开发见 **[本地开发](./local-dev.md)**。

## 下一步

- [本地开发](./local-dev.md) —— 完整本地开发步骤
- [Docker 部署](./deployment.md) —— Compose / docker run / 静态部署
- [配置说明](./configuration.md) —— MC_* 环境变量、config.json 与 CORS 方案
- [功能说明](./features.md) —— 已实现功能与实现要点
- [开发路线图](./roadmap.md) —— 项目演进计划
