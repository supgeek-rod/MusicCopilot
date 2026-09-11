---
title: 快速开始
description: MusicCopilot 的安装、开发、构建与文档站开发步骤
---

# 快速开始

MusicCopilot 当前是纯前端 SPA（[路线图](./roadmap.md) 第 1-2 期），需要一个已部署的 [Simple SQ Music Plus](https://github.com/59799517/simple_sq_music_plus) 后端作为数据源。后端地址与账号通过环境变量注入，见[配置说明](./configuration.md)。

## 环境要求

- Node.js ≥ 20.19（推荐 22 LTS）
- npm（仓库带 `package-lock.json`，建议直接使用 npm）
- 一个可访问的 SQ Music 后端实例

## 开发

```bash
git clone https://github.com/supgeek-rod/MusicCopilot.git
cd MusicCopilot
npm install

cp .env.example .env    # 填写后端地址与账号（.env 不入库）
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

推送 `v0.1.x` 分支后，GitHub Actions 自动构建并发布到 GitHub Pages：<https://supgeek-rod.github.io/MusicCopilot/>

## 下一步

- [配置说明](./configuration.md) —— MC_* 环境变量、config.json 与 CORS 方案
- [部署指南](./deployment.md) —— Docker 一键部署 / 静态部署
- [功能说明](./features.md) —— 已实现功能与实现要点
- [开发路线图](./roadmap.md) —— 项目演进计划
