---
title: 架构设计
description: MusicCopilot 整体架构：演进总览、模块边界、关键决策与部署拓扑
---

# MusicCopilot 架构设计

> 本文档按[开发路线图](./roadmap.md)梳理项目的整体架构：现状 → 目标形态 → 模块边界 → 关键决策 → 各期落地路径。前端与后端的内部分层另见 [web 架构](./web) / [server 架构](./server)。

## 1. 架构演进总览

```
第1-2期（历史）                 第3-4期                        第5-6期
┌─────────────┐               ┌─────────────┐                ┌─────────────┐
│  SPA 前端    │               │  SPA 前端    │                │  SPA 前端    │
└──────┬──────┘               └──────┬──────┘                └──────┬──────┘
       │ /api                        │ /api      │ /mc              │ /api（自建）
       ▼                             ▼           ▼                  ▼
┌─────────────┐               ┌───────────┐ ┌──────────┐      ┌──────────────┐
│ SQMusic 后端 │               │ SQMusic   │ │ Companion│      │ MusicCopilot │
│ (第三方)     │               │ 后端(过渡) │ │ 伴生服务  │      │ Server(自建) │
└─────────────┘               └───────────┘ └────┬─────┘      └──────┬───────┘
                                                 ▼                   ▼
                                            [fnOS / 音乐目录]    [音乐目录 + SQLite]
```

- **第 1-2 期**：SPA 直连第三方 SQMusic 后端，专注把前端能力做完。
- **当前（第 5 期已完成，SQMusic 退役）**：自建后端 `server/`（PHP / Laravel 13）接管全部 `/api` 流量，fnOS 音乐库仍以 `/fnos` 同源反代直连网关；scraper 与 `/mc` 通道已随第 4 期架构调整移除（源码存档在 `scraper/`，不构建不运行）。**2026-09-25 认证移除、2026-09-26 契约清理**：SqMusic 对齐残留（鉴权端点、`sqmusic` 头）删除，连接即用。
- **第 3 期（进行中）**：fnOS 侧能力（曲库扫描、歌单补全）规划收敛到 server/ 内模块，`/fnos` 前缀语义不变。
- **第 5-6 期（已完成）**：自建 **MusicCopilot Server** 替换第三方后端，Docker 一键交付。

## 2. 仓库形态（monorepo 已落地）

> 2026-09-11 monorepo 提前落地：前端保持在仓库根（工具链/部署零改动），自建后端并入 `server/`
> （原独立仓库 MusicCopilotServer，git subtree 保留历史）。与原规划的两处差异：
> server 技术栈为 **PHP / Laravel 13**（第 5 期研究后确定，替代 Node/Fastify 方案）；前端不再迁入 `apps/web`。

```
MusicCopilot/
├─ src/ index.html vite.config.ts ...   # 前端 SPA（原单包结构不变）
├─ packages/
│  └─ api-contract/             # 前后端共享契约类型（openapi-typescript 由 server/openapi.json 生成）
├─ server/                      # 自建后端（PHP / Laravel 13，应用根即本目录）
│  ├─ app/
│  │  ├─ Http/Controllers/     # API 控制器（统一信封 {code,msg,data}）
│  │  └─ Plugins/Sources/      # 音源插件（SourcePlugin 接口 + KuwoPlugin，待增 netease/mg/tidal）
│  ├─ routes/api.php           # /api/music/* 等路由
│  ├─ public/api-docs.html     # Scalar 文档测试台（资产本地化 public/vendor/scalar/）
│  ├─ lang/zh_CN/              # 最小化中文验证消息
│  ├─ docs/kuwo-api-notes.md   # 酷我端点/加密/区域限制调研
│  ├─ research/ scripts/       # 酷我调研资料与 curl 验证脚本
│  └─ openapi.json             # OpenAPI 3.1 规范固化（scramble:export）
├─ scraper/                     # （已移除）音乐元数据刮削工具源码存档，不构建不运行
├─ docker/                      # nginx 反代模板 + 容器入口配置生成脚本（前端镜像构建用根级 Dockerfile，server 镜像用 server/Dockerfile）
└─ docs/                       # 文档（VitePress 文档站）
```

## 3. 服务与模块边界

| 模块 | 期数 | 职责 | 依赖 |
| --- | --- | --- | --- |
| `web` | 1 | SPA 全部界面与交互 | api-contract |
| `web/api/fnos` | 2.5 | fnOS 音乐库前端接入：登录（SHA-256 + Cookie）、曲库/搜索/歌单/歌词封装、媒体直链；经同源 `/fnos` 反代直连 fnOS 网关 | — |
| ~~`server/auth`~~ | 2（已移除） | 曾为 token 鉴权（`sqmusic` 头中间件 + token 落库，第 5 期 M1 落地）；**2026-09-25 认证整体移除，2026-09-26 端点删除**（探活改由 `/api/healthcheck` 承担） | infra |
| `server/fnos` | 3（规划） | fnOS 登录代理、曲库/歌单接口转发（社区逆向接口收敛在此），接管 `/fnos` 前缀 | infra |
| `server/library` | 3（规划） | 扫描音乐目录，产出歌曲清单（路径/标签/码率） | infra |
| `server/playlist` | 3（规划） | 歌单与本地库对比，缺失曲目调下载模块补全 | fnos/library/download |
| `scraper/scan` | 4（已移除） | 扫描音乐目录（music-metadata 读取标签入库），产出体检分类（缺封面/歌词/专辑/歌手、文件名混乱、疑似重复） | infra |
| `scraper/match` | 4（已移除） | 文件名 + 现有标签调 server/ 搜索接口匹配，候选与置信度评分（**不自带音源解析**） | scan / server.music |
| `scraper/writer` | 4（已移除） | 标签/封面/歌词写入（taglib-wasm，ffmpeg 兜底）：dry-run、写前备份、「歌手 - 标题」重命名（默认关） | scan |
| `scraper/jobs` | 4（已移除） | Fastify `/mc/api` 路由 + 任务队列（扫描/匹配/写入）+ SQLite 持久化（node:sqlite） | infra |
| `server/music` | 5 | 聚合搜索/详情/直链解析，对接音源插件注册表 | plugins/sources |
| `server/plugins/sources` | 5 | 每平台一个插件，实现统一 SourcePlugin 接口，可独立启停与热更新 | — |
| `server/download` | 5 | 下载队列/并发/进度/重试；完成后按路径模板重排（`MC_MUSIC_DOWNLOAD_PATH_TEMPLATE`） | tasks/healthcheck |
| `server/tasks` | 5 | 任务持久化（SQLite）与查询接口 | infra |

## 4. 关键架构决策

| # | 决策 | 理由 |
| --- | --- | --- |
| 1 | **接口契约先行**：前后端共享类型放 `packages/api-contract` | 第 5 期替换后端时前端零改动；统一 `{code,msg,data}` 包裹与错误语义 |
| 2 | **单服务渐进生长**：Companion 与自建后端是同一个 `apps/server`，按模块启用。**2026-09-11 修订**：文件级写操作（元数据刮削）独立为 `scraper/` 工具容器——直接写 NAS 文件的风险隔离、可独立授权/重启，音源解析仍收敛在 server/。**2026-09 再修订**：第 4 期移除后 `scraper/` 下线（源码存档，不构建不运行），回到单服务形态 | 避免维护两套进程/镜像；第 3 期骨架直接长成第 5 期形态 |
| 3 | **音源插件化**：解析逻辑按平台隔离在 `plugins/sources` | 平台接口变动频繁，解析层独立可热更新，坏一个源不影响整体 |
| ~~4~~ | **统一鉴权**（**2026-09-25 随 server 认证移除而失效，2026-09-26 清理完毕**：内网可信环境直连，无凭证概念）：原第 2 期登录框 + JWT 规划不再执行 | 部署收敛为内网零配置，凭证体系成为纯摩擦 |
| 5 | **数据闭环**：下载目录 = fnOS 音乐目录（Docker 卷映射同一路径） | 新下载自动被 fnOS 扫描入库，歌单补全/音质升级无需搬运文件 |
| 6 | **同源部署**：生产由 nginx 反代 `/api` 与 `/fnos`，开发用 Vite proxy | 彻底规避 CORS；`config.json` 只需留空 baseUrl |
| 7 | **技术栈**（2026-09 修订）：server 用 PHP / Laravel 13 + SQLite（队列 database driver + `queue:work`） | Laravel 生态完备（HTTP 客户端/队列/测试开箱即用）、插件化天然契合；原 Fastify+Node 方案作废 |
| 8 | **fnOS 同源反代直连**：`/fnos` 前缀固定为「fnOS 音乐 API 同源代理」（dev 走 Vite proxy，生产走 nginx），前端登录后以 `document.cookie` 写入 `music-token`，封面/音频流用相对路径自动携带 Cookie；第 3 期由 Companion `server/fnos` 模块接管同一前缀 | fnOS 媒体接口强制 Cookie 鉴权，跨域直连不可行；前缀语义固定后伴生服务接管零改动 |
| ~~9~~ | **`/mc` 前缀 = 伴生工具通道**（**已移除**）：曾指向 `scraper/` 刮削工具，随第 4 期移除；`/fnos` 前缀的同源反代先例仍有效 | 前缀语义稳定、nginx 反代目标可切换的实践已被 `/fnos` 验证 |
| ~~10~~ | **刮削工具技术栈**（**随第 4 期移除失效**，源码存档见 `scraper/`）：Node.js 24 + Fastify + node:sqlite + taglib-wasm | 保留作恢复参考 |

## 5. 部署拓扑（现状，第 5-6 期已落地）

```
[浏览器]
   │ 同源
   ▼
┌────────────────────── nginx (web 容器) ─────────────────────┐
│  /            → SPA 静态文件                                 │
│  /api/*       → MusicCopilot Server（server 容器 :17017）     │
│  /fnos/*      → fnOS 网关 5666（直连，Cookie 鉴权）          │
└───────┬─────────────────────────────────────┬───────────────┘
        ▼                                     ▼
┌──────── server 容器 ────────┐        [fnOS 网关]
│       music / download /   │
│ tasks（SQLite data 卷）     │
└──────┬──────────────────────┘
       ▼ queue:work（server 容器内 worker 子进程）
[音乐目录卷 rw] ⇅（fnOS / Navidrome 自动扫描入库）
```

> 历史形态（SQMusic 过渡期、第 4 期 scraper 容器与 `/mc` 通道）已随架构调整移除，`scraper/` 目录为源码存档。

## 6. 前端适配层（现状：自建后端单后端）

`src/api/http.ts` 集中处理 baseURL（服务端认证已于 2026-09-25 移除，无 token 头与重登逻辑；连通性探测用 `/api/healthcheck`），实际文件：

```
src/api/
├─ http.ts        # 请求实例：{code,msg,data} 解包 + 网络错误友好提示
├─ config.ts      # 探活（/api/healthcheck）与音源插件元信息（/api/config/*）
├─ music.ts       # 搜索/详情/歌词/直链（自建后端）
├─ task.ts        # 下载任务管理
├─ fnos.ts        # fnOS 音乐库（/fnos 反代直连，code==0 信封 + Cookie 鉴权）
└─ types.ts       # 接口类型（契约类型源在 packages/api-contract）
```

`config.json`（`baseUrl` 留空即同源，`proxyTarget` 为信息性字段；Docker 由容器入口脚本生成）：

```json
{
  "baseUrl": "",
  "proxyTarget": "http://server:17017"
}
```

fnOS 接入配置（`MC_FNOS_*` 变量生成，`enabled` 控制音乐库入口显隐）：

```json
{
  "fnos": {
    "enabled": true,
    "username": "",
    "password": "",
    "autoLogin": true,
    "proxyTarget": "http://192.168.31.31:5666"  // 信息性字段，供设置面板展示
  }
}
```

> 历史上的 `scraper` 配置块（`MC_SCRAPER_*` 变量、token 与 `/mc` 通道，端口 8098）已随第 4 期音乐库体检功能移除，`config.json` 不再包含该块。

## 7. 各期落地清单（与路线图对应）

| 期 | 架构动作 |
| --- | --- |
| 第 2 期 | ~~前端登录框 + token~~（已随 2026-09-25 认证移除废止）；搜索历史等纯前端功能 |
| 第 3 期 | 迁移 monorepo；新建 `apps/server` 骨架（Fastify + infra）；实现 fnos/library/playlist 模块；引入 docker/web.Dockerfile |
| 第 4 期 | 独立 `scraper/` 刮削工具容器（Fastify + taglib-wasm，`/mc/api`）；前端「音乐库体检」页（见 `docs/META_SCRAPER_PLAN.md`） |
| 第 5 期 | server 增加 music/download/tasks 与音源插件；前端切换到自建后端；SQMusic 下线（2026-09-26 契约残留清理） |
| 第 6 期 | compose 收口：web + server 两容器 + 卷挂载；fnOS 图形化部署模板 |
