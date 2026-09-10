# AGENTS.md

## 项目说明

**MusicCopilot**（本仓库）—— 基于 Vue 3 + TypeScript + shadcn-vue 的音乐搜索与下载 SPA，对接 **SQ Music**（simple_sq_music_plus，自部署音乐下载与管理服务）。项目按 [docs/roadmap.md](docs/roadmap.md)「开发路线图」演进：第 3 期起新增 Node 伴生服务，第 5 期自建后端替换 SQMusic（架构见 [docs/architecture.md](docs/architecture.md)）。自建后端已提前落地：`server/` 子目录（PHP / Laravel 13，原独立仓库 MusicCopilotServer 于 2026-09-11 subtree 并入，保留历史）。

- 后端服务地址: http://192.168.31.31:8096 （账号 admin / admin，同 `.env`，模板见 `.env.example`）
- 官方接口文档: https://59799517.github.io/simple_sq_music_plus/#/README
- 前端开发服务器: http://localhost:5173 （`npm run dev`，`/api` 由 Vite 代理转发到 `.env` 的 `MC_API_BASE_URL`）
- 文档站: https://supgeek-rod.github.io/MusicCopilot/ （VitePress，源码即 `docs/`；本地开发 `npm run docs:dev`，端口 5174）

## 必读记忆

**调用该服务接口前，必须先阅读 [`docs/api-test-report.md`](docs/api-test-report.md)**。

其中记录了 2026-09-05 的全量接口实测结果，关键结论：

1. **官方文档的参数名普遍过时**（如 `platform`→实际 `plugName`、`keywords`→`keyword`、
   `currentPage`→`pageIndex`、`/api/version`→`/api/config/version`），按文档调用会得到 500。
2. 登录必须带 `device:"web"` 字段；鉴权请求头名为 `sqmusic`。
3. `GET /api/task/delSuccessTask` 会清空服务器全部历史下载记录，**禁止随意调用**；
   `downloadSong`、`downloadAlbum` 等会产生真实下载任务/文件，测试后需用 `POST /api/task/del` 清理。
4. 酷狗插件(kg)未开启、qqvip 未开启且 cookie 失效——相关接口当前不可用属预期状态。

## 常用命令

- `npm run dev` —— Vite 开发服务器（端口 5173）
- `npm run build` —— `vue-tsc -b && vite build`，**提交前必须通过**
- `npx shadcn-vue@latest add <组件>` —— 添加 UI 组件到 `src/components/ui/`
- `npm run docs:dev` / `docs:build` —— VitePress 文档站本地开发（端口 5174）/ 构建（含死链检查），改动 `docs/` 后提交前应构建通过
- `wsl -e bash -lc "cd '/mnt/c/Users/superod/OneDrive/文档/ZCode/MusicCopilot/server' && php artisan serve --host=0.0.0.0 --port=8097"` —— 自建后端（server/）开发服务；PHP/Composer 仅存在于 WSL，Windows 侧无 PHP

## server/ 子目录（自建后端，Laravel 13）

- 定位：第 5 期替换 SQMusic 的自建后端（原 MusicCopilotServer 仓库 subtree 并入），音源插件化（`app/Plugins/Sources/`），已实现酷我搜索三端点；进度与用法见 `server/README.md`
- 文档与测试台：`http://127.0.0.1:8097/api-docs.html`（Scalar）、`/docs/api`（Stoplight Elements）、`/docs/api.json` 与 `server/openapi.json`（规范固化，契约类型源）
- 契约策略：过渡期保持 SQMusic 对齐契约；**新端点不复制历史瑕疵**；SQMusic 退役后以 /v2 出清理版（详见 `packages/api-contract/README.md`）
- 酷我直链解析有**大陆 IP 区域限制**（海外 407），本机测酷我 curl 一律 `--noproxy '*'`；Windows mingw curl 的 argv 中文会转 GBK（先经 node `encodeURIComponent` 编码）——详见 `server/docs/kuwo-api-notes.md`

## 代码约定

- Vue 3 组合式 API，`<script setup lang="ts">`；组件名多词
- **后端调用一律收敛在 `src/api/`**，组件内禁止直接 `fetch`/axios：
  - 统一走 `src/api/http.ts` 的 `request()`：解包 `{code, msg, data}`（`code=200` 才算成功）、自动带 `sqmusic` token 头、403 自动重登一次并重试
  - 接口类型统一放 `src/api/types.ts`；搜索记录与详情记录字段不一致时用 `src/lib/adapter.ts` 适配（参考 `albumSongToRecord`）
- UI 组件只用 `src/components/ui/`（shadcn-vue 生成），缺什么用 CLI 加，不要手写复刻；主题色与深色模式变量在 `src/style.css`
- 路由组件使用**静态 import**（`src/router/index.ts`），曾排查过懒加载相关渲染异常，保持现状
- 组件内异步请求必须在卸载后丢弃响应（`disposed` 守卫写法，参考 `DownloadsView.vue` / `SearchView.vue`），否则会与路由切换竞态导致 `parentNode null` 渲染崩溃
- 提交信息遵循 conventional commits（feat / fix / docs / refactor…）
- 文档放 `docs/`（VitePress 文档站，`docs/` 即站点根，配置在 `docs/.vitepress/config.mts`）；`docs/api-test-report.md` 含内网部署细节，已通过 `srcExclude` 排除出站点构建，站内文档只以文字提及、不要链接它；`AGENTS.md` 放仓库根目录（子级 AGENTS.md 等 monorepo 迁移后再拆）

## 路线图约束

- 第 2 期：`config.json` 去掉明文密码，改「登录框 + 记住 token」模式（鉴权细节见 docs/roadmap.md 前置建议）
- monorepo 已于 2026-09-11 提前落地（前端在根、后端在 `server/`）：本文件为根级（前端 + 通用约定），`server/` 特有约定见 `server/AGENTS.md`
- 新增后端能力时，先更新 `docs/architecture.md` 的模块边界，再动代码；接口契约类型收敛到 `packages/api-contract`（已落地：由 `server/openapi.json` 经 openapi-typescript 生成，`npm run gen -w packages/api-contract` 重新生成）
