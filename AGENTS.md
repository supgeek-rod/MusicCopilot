# AGENTS.md

## 项目说明

**MusicCopilot**（本仓库）—— 基于 Vue 3 + TypeScript + shadcn-vue 的音乐搜索与下载 SPA，对接 **SQ Music**（simple_sq_music_plus，自部署音乐下载与管理服务）。项目按 README「开发路线图」演进：第 3 期起新增 Node 伴生服务，第 5 期自建后端替换 SQMusic（架构见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)）。

- 后端服务地址: http://192.168.31.170:8096 （账号 admin / admin，同 `.env`，模板见 `.env.example`）
- 官方接口文档: https://59799517.github.io/simple_sq_music_plus/#/README
- 前端开发服务器: http://localhost:5173 （`npm run dev`，`/api` 走 Vite 代理，目标读 `.env` 的 `MC_DEV_PROXY_TARGET`，缺省取 `MC_API_BASE_URL`）

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

## 代码约定

- Vue 3 组合式 API，`<script setup lang="ts">`；组件名多词
- **后端调用一律收敛在 `src/api/`**，组件内禁止直接 `fetch`/axios：
  - 统一走 `src/api/http.ts` 的 `request()`：解包 `{code, msg, data}`（`code=200` 才算成功）、自动带 `sqmusic` token 头、403 自动重登一次并重试
  - 接口类型统一放 `src/api/types.ts`；搜索记录与详情记录字段不一致时用 `src/lib/adapter.ts` 适配（参考 `albumSongToRecord`）
- UI 组件只用 `src/components/ui/`（shadcn-vue 生成），缺什么用 CLI 加，不要手写复刻；主题色与深色模式变量在 `src/style.css`
- 路由组件使用**静态 import**（`src/router/index.ts`），曾排查过懒加载相关渲染异常，保持现状
- 组件内异步请求必须在卸载后丢弃响应（`disposed` 守卫写法，参考 `DownloadsView.vue` / `SearchView.vue`），否则会与路由切换竞态导致 `parentNode null` 渲染崩溃
- 提交信息遵循 conventional commits（feat / fix / docs / refactor…）
- 文档放 `docs/`；`AGENTS.md` 放仓库根目录（子级 AGENTS.md 等 monorepo 迁移后再拆）

## 路线图约束

- 第 2 期：`config.json` 去掉明文密码，改「登录框 + 记住 token」模式（鉴权细节见 README 前置建议）
- 第 3 期迁移 monorepo 后：本文件拆为根级（通用）+ `apps/web` / `apps/server` 子级（各自特有约定）
- 新增后端能力时，先更新 `docs/ARCHITECTURE.md` 的模块边界，再动代码；接口契约类型第 3 期起收敛到 `packages/api-contract`
