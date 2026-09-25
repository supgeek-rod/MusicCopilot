# AGENTS.md

## 项目说明

**MusicCopilot**（本仓库）—— 基于 Vue 3 + TypeScript + shadcn-vue 的音乐搜索与下载 SPA + 自建后端一体的 monorepo。**自建后端已上线（第 5 期，2026-09-12 完成）：`server/` 子目录（PHP / Laravel 13，原独立仓库 MusicCopilotServer 于 2026-09-11 subtree 并入，保留历史），fnOS 线上已切换自建后端**——v0.2.0 起无需 SQMusic；**2026-09-26 完成契约清理**：server 认证（2026-09-25 移除）连同其 SqMusic 对齐残留（`sqmusic` 请求头、login/isLogin/logout 端点、token 存储）一并删除，连接即用（见架构 [docs/architecture.md](docs/architecture.md)）。

- 自建后端开发服务: `http://127.0.0.1:17017`（WSL 内 `php artisan serve`，见下方常用命令；无认证，无需账号密码；探活端点 `/api/healthcheck`）
- fnOS 线上（fnOS-Just4fun）: 前端 `http://192.168.31.31:12312`，两容器拓扑（web + server，server 内含下载队列 worker）
- 前端开发服务器: `npm run dev`（端口取 `.env` 的 `MC_WEB_PORT`，默认 5173；`/api` 由 Vite 代理转发到 `.env` 的 `MC_API_BASE_URL`）
- 文档站: https://supgeek-rod.github.io/MusicCopilot/ （VitePress，源码即 `docs/`；本地开发 `npm run docs:dev`，端口 17015）

## 常用命令

- `npm run dev` —— Vite 开发服务器（端口取 `.env` 的 `MC_WEB_PORT`，默认 5173）
- `npm run build` —— `vue-tsc -b && vite build`，**提交前必须通过**
- `npx shadcn-vue@latest add <组件>` —— 添加 UI 组件到 `src/components/ui/`
- `npm run docs:dev` / `docs:build` —— VitePress 文档站本地开发（端口 17015）/ 构建（含死链检查），改动 `docs/` 后提交前应构建通过
- `wsl -e bash -lc "cd '/mnt/c/Users/superod/ZCode/MusicCopilot/server' && php artisan serve --host=0.0.0.0 --port=17017"` —— 自建后端（server/）开发服务；PHP/Composer 仅存在于 WSL，Windows 侧无 PHP

## server/ 子目录（自建后端，Laravel 13）

- 定位：第 5 期替换 SQMusic 的自建后端（原 MusicCopilotServer 仓库 subtree 并入），音源插件化（`app/Plugins/Sources/`），已实现酷我搜索三端点与 config 端点（无认证；探活 `/api/healthcheck`）；进度与用法见 `server/README.md`
- 文档与测试台：`http://127.0.0.1:17017/api-docs.html`（Scalar）、`/docs/api`（Stoplight Elements）、`/docs/api.json` 与 `server/openapi.json`（规范固化，契约类型源）
- 契约策略：SqMusic 对齐期已结束（2026-09-26 清理完成）；现存契约仍有历史瑕疵（`{code,msg,data}` 信封、字符串数字），清理版契约规划见 `packages/api-contract/README.md`
- 酷我直链解析有**大陆 IP 区域限制**（海外 407），本机测酷我 curl 一律 `--noproxy '*'`；Windows mingw curl 的 argv 中文会转 GBK（先经 node `encodeURIComponent` 编码）——详见 `server/docs/kuwo-api-notes.md`
- ⚠️ `GET /api/task/delSuccessTask` 会清空全部成功任务记录（不删文件），**禁止随意调用**；`downloadSong`、`downloadAlbum` 等会产生真实下载任务/文件，测试后需用 `POST /api/task/del` 清理

## 代码约定

- Vue 3 组合式 API，`<script setup lang="ts">`；组件名多词
- **后端调用一律收敛在 `src/api/`**，组件内禁止直接 `fetch`/axios：
  - 统一走 `src/api/http.ts` 的 `request()`：解包 `{code, msg, data}`（`code=200` 才算成功）；后端无认证，无 token/重登逻辑，连通性探测用 `src/api/config.ts` 的 `configApi.healthcheck()`（`/api/healthcheck`）
  - 接口类型统一放 `src/api/types.ts`；搜索记录与详情记录字段不一致时用 `src/lib/adapter.ts` 适配（参考 `albumSongToRecord`）
- UI 组件只用 `src/components/ui/`（shadcn-vue 生成），缺什么用 CLI 加，不要手写复刻；主题色与深色模式变量在 `src/style.css`
- 路由组件使用**静态 import**（`src/router/index.ts`），曾排查过懒加载相关渲染异常，保持现状
- 组件内异步请求必须在卸载后丢弃响应（`disposed` 守卫写法，参考 `DownloadsView.vue` / `SearchView.vue`），否则会与路由切换竞态导致 `parentNode null` 渲染崩溃
- 提交信息遵循 conventional commits（feat / fix / docs / refactor…）
- 文档放 `docs/`（VitePress 文档站，`docs/` 即站点根，配置在 `docs/.vitepress/config.mts`）；`AGENTS.md` 放仓库根目录（子级 AGENTS.md 等 monorepo 迁移后再拆）

## 路线图约束

- ~~第 2 期：`config.json` 去掉明文密码，改「登录框 + 记住 token」模式~~（已随 2026-09-25 server 认证移除失效，2026-09-26 清理落地：前端无凭证与 token 概念，config.json 无账号密码字段）
- monorepo 已于 2026-09-11 提前落地（前端在根、后端在 `server/`）：本文件为根级（前端 + 通用约定），`server/` 特有约定见 `server/AGENTS.md`
- 新增后端能力时，先更新 `docs/architecture.md` 的模块边界，再动代码；接口契约类型收敛到 `packages/api-contract`（已落地：由 `server/openapi.json` 经 openapi-typescript 生成，在 `packages/api-contract` 内 `npm run gen` 重新生成；根 package.json 未声明 workspaces，`-w` 写法无效）
