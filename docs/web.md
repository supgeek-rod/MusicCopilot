---
title: Web 前端架构
description: 前端 SPA 的技术栈、分层与关键机制（运行时配置 / 状态 / API 封装 / PWA）
---

# Web 前端架构

> 项目整体架构（演进总览、模块边界、部署拓扑）见[架构设计](./architecture)，本文展开 web 端内部分层。功能与交互细节见[功能说明](./features)。

## 技术栈

Vue 3（组合式 API，`<script setup lang="ts">`）+ TypeScript + Vite + shadcn-vue（Tailwind CSS）。状态管理 Pinia，路由 vue-router（hash 模式），PWA 用 vite-plugin-pwa，工具链 vueuse。

## 目录结构

```
web/src/
├─ api/                  # 后端调用唯一出口（组件内禁止直接 fetch/axios）
│  ├─ http.ts            #   request()：直返响应体（V2 无信封）+ 网络错误提示
│  ├─ music.ts           #   搜索 / 详情 / 歌词 / 直链 / 下载创建（/api/v2）
│  ├─ task.ts            #   下载任务管理（/api/v2/downloads，REST）
│  ├─ config.ts          #   探活（/api/healthcheck 历史信封）与音源插件元信息（/api/v2/config）
│  ├─ fnos.ts            #   fnOS 音乐库（独立 code==0 信封 + Cookie 鉴权 + 会话失效重登）
│  └─ types.ts           #   接口类型（由 packages/api-contract 生成类型派生）
├─ stores/               # Pinia：app（运行配置与连接状态）/ player（播放队列）/ fnos（曲库会话）
├─ views/                # 路由页面：搜索 / 歌手 / 专辑 / 音乐库 / 合集 / 下载任务 / 设置
├─ components/           # 业务组件（SongList、PlayerBar、歌词弹窗、下载音质菜单…）
│  └─ ui/                # shadcn-vue 生成的本地 UI 组件（CLI 生成，勿手写复刻）
├─ lib/                  # 纯函数工具：adapter（fnOS 曲目适配）、format、sanitize、runtimeConfig…
├─ router/index.ts       # 路由表（静态 import，不用懒加载）
└─ style.css             # 主题色与深色模式变量
```

## 关键机制

- **运行时配置**：启动时 `fetch` `config.json`（`baseUrl` 恒空串走同源）。dev/preview 由 Vite 中间件从 `.env` 虚拟生成（`vite.config.ts` 的 `runtimeConfigPlugin`），构建时可生成 `dist/config.json`，Docker 由容器入口脚本生成——同一份结构三种来源，见[配置说明](./configuration)。
- **契约类型派生**：`api/types.ts` 从 `packages/api-contract` 生成类型派生（`components['schemas'][...]`），V2 起 SongRecord 统一覆盖搜索/专辑曲目（仅放宽 `id/artistIds/albumId` 为 `number|string` 容纳 fnOS guid）。
- **字段适配**：API V2 统一 Song 形态后，搜索与专辑详情不再需要适配；仅 fnOS 曲目经 `lib/adapter.ts` 的 `fnosTrackToRecord` 适配（id 为 guid 字符串、brTypes 留空）。
- **双同源通道**：`/api` 到自建后端、`/fnos` 到 fnOS 网关，dev 由 Vite 代理、生产由 nginx 反代，浏览器无跨域问题；fnOS 媒体流靠同源 Cookie 自动携带。
- **竞态防御**：页面组件的异步请求在卸载后丢弃响应（`disposed` 守卫写法），避免与路由切换竞态引发 `parentNode null` 渲染崩溃。
- **PWA**：`autoUpdate` 静默更新；构建产物全量预缓存；`/api/*` 与 `config.json` 永不缓存（后者运行时生成）；封面图 `StaleWhileRevalidate` 运行时缓存（限 200 条 / 14 天）。仅构建产物生效，dev 无 SW。

## 与后端的边界

组件 → store/页面 → `web/src/api/*` → 后端 `/api/*`；后端契约以 `server/openapi.json` 为准，契约类型包 `packages/api-contract` 由其生成。后端侧内部分层见 [server 架构](./server)。
