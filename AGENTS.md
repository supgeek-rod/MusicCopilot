# AGENTS.md

## 项目说明

**MusicCopilot** —— 基于 Vue 3 + TypeScript + shadcn-vue 的音乐搜索与下载 SPA + 自建后端，monorepo 布局：

| 子包 | 内容 |
| --- | --- |
| `web/` | 前端 SPA（自带 package.json / Dockerfile / .env.example） |
| `server/` | 自建后端（PHP / Laravel 13），酷我音源插件化，无认证、连接即用（探活 `/api/healthcheck`） |
| `docs/` | VitePress 文档站（自带 package.json） |
| `packages/api-contract/` | API 契约类型（由 `server/openapi.json` 经 openapi-typescript 生成） |

根目录无 package.json，各子包各自 npm；server 历史遗留的认证与 SqMusic 对齐残留已清理（见架构 [docs/architecture.md](docs/architecture.md)）。

- 自建后端开发服务: `http://127.0.0.1:17017`（WSL 内 `php artisan serve`，命令见下）
- 线上部署：两容器拓扑（web + server，server 内含下载队列 worker）；对外地址与端口由部署机 `.env` 的 `MC_WEB_PORT` 决定
- 前端开发服务器: `web/` 内 `npm run dev`（端口取 `web/.env` 的 `MC_WEB_PORT`，默认 5173；`/api` 由 Vite 代理转发到 `MC_API_BASE_URL`；变量模板 `web/.env.example`）
- 文档站: https://supgeek-rod.github.io/MusicCopilot/ （本地开发在 `docs/` 内 `npm run dev`，端口 17015）

## 常用命令

- `cd web && npm run dev` —— Vite 开发服务器（端口取 `web/.env` 的 `MC_WEB_PORT`，默认 5173）
- `cd web && npm run build` —— `vue-tsc -b && vite build`，**提交前必须通过**
- `cd web && npx shadcn-vue@latest add <组件>` —— 添加 UI 组件到 `web/src/components/ui/`
- `cd docs && npm run dev` / `npm run build` —— VitePress 文档站本地开发（端口 17015）/ 构建（含死链检查），改动 `docs/` 后提交前应构建通过
- `wsl -e bash -lc "cd '<仓库路径>/MusicCopilot/server' && php artisan serve --host=0.0.0.0 --port=17017"`（`<仓库路径>` 按实际位置替换；本机 PHP/Composer 仅在 WSL，Windows 侧无 PHP）

## server/ 子目录（自建后端，Laravel 13）

- 定位：自建音源后端，音源插件化（`app/Plugins/Sources/`），已实现酷我搜索三端点与 config 端点（无认证；探活 `/api/healthcheck`）；进度与用法见 `server/README.md`
- 文档与测试台：`http://127.0.0.1:17017/api-docs.html`（Scalar）、`/docs/api`（Stoplight Elements）、`/docs/api.json` 与 `server/openapi.json`（规范固化，契约类型源）
- 契约策略：SqMusic 对齐残留已清理；现存契约仍有历史瑕疵（`{code,msg,data}` 信封、字符串数字），清理版契约规划见 `packages/api-contract/README.md`
- 酷我直链解析有**大陆 IP 区域限制**（海外 407），本地测酷我 curl 一律 `--noproxy '*'`；Windows mingw curl 的 argv 中文会转 GBK（先经 node `encodeURIComponent` 编码）——详见 `server/docs/kuwo-api-notes.md`
- ⚠️ `GET /api/task/delSuccessTask` 会清空全部成功任务记录（不删文件），**禁止随意调用**；`downloadSong`、`downloadAlbum` 等会产生真实下载任务/文件，测试后需用 `POST /api/task/del` 清理

## 代码约定

- Vue 3 组合式 API，`<script setup lang="ts">`；组件名多词
- **后端调用一律收敛在 `web/src/api/`**，组件内禁止直接 `fetch`/axios：
  - 统一走 `web/src/api/http.ts` 的 `request()`：解包 `{code, msg, data}`（`code=200` 才算成功）；后端无认证，无 token/重登逻辑，连通性探测用 `web/src/api/config.ts` 的 `configApi.healthcheck()`（`/api/healthcheck`）
  - 接口类型统一放 `web/src/api/types.ts`；搜索记录与详情记录字段不一致时用 `web/src/lib/adapter.ts` 适配（参考 `albumSongToRecord`）
- UI 组件只用 `web/src/components/ui/`（shadcn-vue 生成），缺什么用 CLI 加，不要手写复刻；主题色与深色模式变量在 `web/src/style.css`
- 路由组件使用**静态 import**（`web/src/router/index.ts`），曾排查过懒加载相关渲染异常，保持现状
- 组件内异步请求必须在卸载后丢弃响应（`disposed` 守卫写法，参考 `DownloadsView.vue` / `SearchView.vue`），否则会与路由切换竞态导致 `parentNode null` 渲染崩溃
- 提交信息遵循 conventional commits（feat / fix / docs / refactor…）
- 文档放 `docs/`（VitePress 文档站，`docs/` 即站点根，配置在 `docs/.vitepress/config.mts`）
- 新增后端能力时，先更新 `docs/architecture.md` 的模块边界，再动代码；接口契约类型改动后在 `packages/api-contract` 内 `npm run gen` 重新生成

## 布局约定

- 本文件为根级通用约定；子包特有约定放各自目录的 `AGENTS.md`（如 `server/AGENTS.md`）
- 个人配置（端口、路径等）只进各子包 `.env`（已 gitignore），不写入仓库内任何文档
