---
title: 快速开始
description: MusicCopilot 的安装、开发、构建与文档站开发步骤
---

# 快速开始

MusicCopilot 是前后端一体 monorepo：根目录为 Web 前端（Vue 3 SPA），[`server/`](https://github.com/supgeek-rod/MusicCopilot/tree/main/server) 为自建后端（PHP / Laravel 13，酷我音源）。v0.2.0 起由自建后端提供数据与下载服务，**无需再部署 Simple SQ Music Plus**。后端地址与账号通过环境变量注入，见[配置说明](./configuration.md)；完整部署见[部署指南](./deployment.md)。

## 环境要求

- Node.js ≥ 20.19（推荐 22 LTS）
- npm（仓库带 `package-lock.json`，建议直接使用 npm）
- 后端任选其一：自建后端（`server/`，开发运行方式见 `server/README.md`）或可访问的既有后端实例

## 开发

```bash
git clone https://github.com/supgeek-rod/MusicCopilot.git
cd MusicCopilot
npm install

cp .env.example .env    # 模板默认已指向本地后端 127.0.0.1:17017，可直接开发（.env 不入库）
npm run dev             # http://localhost:<MC_PORT>（默认 5173），/api 由 Vite 代理转发到后端
```

## 构建

```bash
npm run build      # vue-tsc 类型检查 + Vite 构建，产物输出 dist/
npm run preview    # 本地预览构建产物（含 /api 代理）
```

部署方式（Docker / 静态托管）见[部署指南](./deployment.md)。

## 文档站开发

项目文档基于 VitePress，源码即站点（docs as code），文档源文件在 `docs/`：

```bash
npm run docs:dev      # 文档站本地开发，http://localhost:5174
npm run docs:build    # 构建到 docs/.vitepress/dist（含死链检查）
npm run docs:preview  # 本地预览文档站构建产物
```

推送 `main` 分支后，GitHub Actions 自动构建并发布到 GitHub Pages：<https://supgeek-rod.github.io/MusicCopilot/>

## 下一步

- [配置说明](./configuration.md) —— MC_* 环境变量、config.json 与 CORS 方案
- [部署指南](./deployment.md) —— Docker 一键部署 / 静态部署
- [功能说明](./features.md) —— 已实现功能与实现要点
- [开发路线图](./roadmap.md) —— 项目演进计划
