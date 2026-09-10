---
title: 架构设计
description: MusicCopilot 整体架构：演进总览、模块边界、关键决策与部署拓扑
---

# MusicCopilot 架构设计

> 本文档按[开发路线图](./roadmap.md)梳理项目的整体架构：现状 → 目标形态 → 模块边界 → 关键决策 → 各期落地路径。

## 1. 架构演进总览

```
第1-2期（现在）                 第3-4期                        第5-6期
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

- **第 1-2 期**：SPA 直连 SQMusic 后端，专注把前端能力做完。
- **当前（第 2 期进行中）**：fnOS 音乐库以**同源反代直连**方式提前接入（`/fnos` 前缀，无 Node 服务）；第 3 期 Companion 的 `server/fnos` 模块接管同一前缀，前端零改动。
- **第 3-4 期**：引入 **Companion 伴生服务**（Node.js），补齐 SQMusic 不具备的 NAS 侧能力（fnOS 对接、文件扫描、标签写入）；其中第 4 期文件级写操作落地为**独立 `scraper/` 工具容器**（见决策 #2 修订与 `docs/META_SCRAPER_PLAN.md`）。
- **第 5-6 期**：自建 **MusicCopilot Server** 按相同接口契约替换 SQMusic 后端，Docker 一键交付。Companion 与自建后端**合并为同一个 Node 服务**（按模块启停），避免维护两套进程。

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
│  │  ├─ Http/Controllers/     # API 控制器（SQMusic 契约 {code,msg,data}）
│  │  └─ Plugins/Sources/      # 音源插件（SourcePlugin 接口 + KuwoPlugin，待增 netease/mg/tidal）
│  ├─ routes/api.php           # /api/music/* 等路由
│  ├─ public/api-docs.html     # Scalar 文档测试台（资产本地化 public/vendor/scalar/）
│  ├─ lang/zh_CN/              # 最小化中文验证消息
│  ├─ docs/kuwo-api-notes.md   # 酷我端点/加密/区域限制调研
│  ├─ research/ scripts/       # 酷我调研资料与 curl 验证脚本
│  └─ openapi.json             # OpenAPI 3.1 规范固化（scramble:export）
├─ scraper/                     # 音乐元数据刮削工具（第4期，独立镜像：Node 24 + Fastify，直读写 NAS 音乐文件卷）
├─ docker/
│  ├─ web.Dockerfile            # 基础版已提前落地（根级 Dockerfile，nginx 托管 + /api 反代）；第6期扩展 /mc 反代与多服务编排
│  └─ server.Dockerfile         # 第6期：PHP 服务镜像
└─ docs/                       # 文档（VitePress 文档站 + 接口实测报告）
```

## 3. 服务与模块边界

| 模块 | 期数 | 职责 | 依赖 |
| --- | --- | --- | --- |
| `web` | 1 | SPA 全部界面与交互 | api-contract |
| `web/api/fnos` | 2.5 | fnOS 音乐库前端接入：登录（SHA-256 + Cookie）、曲库/搜索/歌单/歌词封装、媒体直链；经同源 `/fnos` 反代直连 fnOS 网关 | — |
| `server/auth` | 2 | 登录框模式：签发/校验 JWT，替代明文密码配置 | infra |
| `server/fnos` | 3 | fnOS 登录代理、曲库/歌单接口转发（社区逆向接口收敛在此），接管 `/fnos` 前缀 | infra |
| `server/library` | 3 | 扫描音乐目录，产出歌曲清单（路径/标签/码率） | infra |
| `server/playlist` | 3 | 歌单与本地库对比，缺失曲目调下载模块补全 | fnos/library/download |
| `scraper/scan` | 4 | 扫描音乐目录（music-metadata 读取标签入库），产出体检分类（缺封面/歌词/专辑/歌手、文件名混乱、疑似重复） | infra |
| `scraper/match` | 4 | 文件名 + 现有标签调 server/ 搜索接口匹配，候选与置信度评分（**不自带音源解析**） | scan / server.music |
| `scraper/writer` | 4 | 标签/封面/歌词写入（taglib-wasm，ffmpeg 兜底）：dry-run、写前备份、「歌手 - 标题」重命名（默认关） | scan |
| `scraper/jobs` | 4 | Fastify `/mc/api` 路由 + 任务队列（扫描/匹配/写入）+ SQLite 持久化（node:sqlite） | infra |
| `server/music` | 5 | 聚合搜索/详情/直链解析，对接音源插件注册表 | plugins/sources |
| `server/plugins/sources` | 5 | 每平台一个插件，实现统一 SourcePlugin 接口，可独立启停与热更新 | — |
| `server/download` | 5 | 下载队列/并发/进度/重试；完成后自动写标签内嵌封面 | tasks/healthcheck |
| `server/tasks` | 5 | 任务持久化（SQLite）与查询接口 | infra |

## 4. 关键架构决策

| # | 决策 | 理由 |
| --- | --- | --- |
| 1 | **接口契约先行**：前后端共享类型放 `packages/api-contract` | 第 5 期替换后端时前端零改动；统一 `{code,msg,data}` 包裹与错误语义 |
| 2 | **单服务渐进生长**：Companion 与自建后端是同一个 `apps/server`，按模块启用。**2026-09-11 修订**：文件级写操作（元数据刮削）独立为 `scraper/` 工具容器——直接写 NAS 文件的风险隔离、可独立授权/重启，音源解析仍收敛在 server/ | 避免维护两套进程/镜像；第 3 期骨架直接长成第 5 期形态 |
| 3 | **音源插件化**：解析逻辑按平台隔离在 `plugins/sources` | 平台接口变动频繁，解析层独立可热更新，坏一个源不影响整体 |
| 4 | **统一鉴权**：第 2 期登录框 + JWT；前端 axios 适配层同时兼容 SQMusic 的 `sqmusic` 头与自建服务的 `Authorization: Bearer` | 配置文件不再存明文密码；过渡期双后端并存无感切换 |
| 5 | **数据闭环**：下载目录 = fnOS 音乐目录（Docker 卷映射同一路径） | 新下载自动被 fnOS 扫描入库，歌单补全/音质升级无需搬运文件 |
| 6 | **同源部署**：生产由 nginx 反代 `/api`、`/mc`，开发用 Vite proxy | 彻底规避 CORS；`config.json` 只需留空 baseUrl |
| 7 | **技术栈**（2026-09 修订）：server 用 PHP / Laravel 13 + SQLite（队列 database driver + `queue:work`） | Laravel 生态完备（HTTP 客户端/队列/测试开箱即用）、插件化天然契合；原 Fastify+Node 方案作废 |
| 8 | **fnOS 同源反代直连**：`/fnos` 前缀固定为「fnOS 音乐 API 同源代理」（dev 走 Vite proxy，生产走 nginx），前端登录后以 `document.cookie` 写入 `music-token`，封面/音频流用相对路径自动携带 Cookie；第 3 期由 Companion `server/fnos` 模块接管同一前缀 | fnOS 媒体接口强制 Cookie 鉴权，跨域直连不可行；前缀语义固定后伴生服务接管零改动 |
| 9 | **`/mc` 前缀 = 伴生工具通道**：现阶段指向 `scraper/` 刮削工具（第 4 期），沿用 `/fnos` 先例——前缀语义稳定、nginx 反代目标可切换，未来 server/ 伴生模块上线时前端与反代前缀零改动 | 前端适配层（`src/api/companion.ts`）与同源部署不因后端形态调整而返工 |
| 10 | **刮削工具技术栈**：Node.js 24 + Fastify + node:sqlite + taglib-wasm（WASM 版 TagLib，免交叉编译、多架构镜像友好），ffmpeg 兜底；与前端同语言、共享类型 | 路线图第 4 期原定 music-metadata/taglib 即 Node 生态；PHP 侧标签写入库弱，不适合文件级写操作 |

## 5. 部署拓扑（第 6 期目标）

```
[浏览器]
   │ 同源
   ▼
┌────────────────────── nginx (web 容器) ─────────────────────┐
│  /            → SPA 静态文件                                 │
│  /api/*       → SQMusic 后端（过渡期） / MusicCopilot Server  │
│  /fnos/*      → fnOS 网关 5666（第 3 期起改指 Companion）     │
│  /mc/*        → scraper 刮削工具（第 4 期；未来 server 接管   │
│                 时仅切换反代目标，前缀不变）                   │
└───────┬─────────────────────────────────────┬───────────────┘
        ▼                                     ▼
┌── scraper 容器（第4期）──────┐    ┌──────── server 容器 ────────┐
│ scan / match / writer / jobs │    │ auth / fnos / library /     │
│ （/mc/api，可选 x-mc-token） │    │ playlist / music / download │
└───┬──────────────┬───────────┘    │ / tasks                     │
    ▼              ▼                └──────┬──────────────────────┘
[音乐目录卷 rw]   [scraper SQLite 卷]       ▼
    ⇅（fnOS 自动扫描入库）              [SQLite data 卷]
```

## 6. 前端适配层（过渡期双后端并存）

`src/api/http.ts` 已集中处理 baseURL 与 token 头，后续扩展为**按后端分组**：

```
src/api/
├─ http.ts        # 请求实例工厂：createClient({ baseURL, authMode })
├─ sqmusic.ts     # SQMusic 后端（现有 music/auth/task/download 封装）
├─ fnos.ts        # 2.5 期：fnOS 音乐 API（/fnos 反代直连，code==0 信封 + Cookie 鉴权）
├─ companion.ts   # 第4期：/mc 刮削工具（音乐库体检）接口；第3期曲库/歌单沿用同一前缀规划
└─ selfhosted.ts  # 第5期：自建后端（与 sqmusic.ts 同契约，直接替换指向）
```

`config.json` 相应扩展（向后兼容）：

```json
{
  "baseUrl": "",              // 留空 = 同源（nginx 反代）
  "auth": { "mode": "login" } // 第2期：login 弹窗模式，token 存 localStorage
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

刮削工具接入配置（`MC_SCRAPER_*` 变量生成，`enabled` 控制「音乐库体检」入口显隐）：

```json
{
  "scraper": {
    "enabled": true,
    "token": "",                                 // 非空时前端带 x-mc-token 头
    "proxyTarget": "http://192.168.31.31:8098"   // 信息性字段，供设置面板展示
  }
}
```

## 7. 各期落地清单（与路线图对应）

| 期 | 架构动作 |
| --- | --- |
| 第 2 期 | 前端登录框 + token；config.json 去密码；搜索历史等纯前端功能 |
| 第 3 期 | 迁移 monorepo；新建 `apps/server` 骨架（Fastify + infra）；实现 fnos/library/playlist 模块；引入 docker/web.Dockerfile |
| 第 4 期 | 独立 `scraper/` 刮削工具容器（Fastify + taglib-wasm，`/mc/api`）；前端「音乐库体检」页（见 `docs/META_SCRAPER_PLAN.md`） |
| 第 5 期 | server 增加 music/download/tasks 与音源插件；前端切换到自建后端；SQMusic 下线 |
| 第 6 期 | compose 收口：web + server 两容器 + 卷挂载；fnOS 图形化部署模板 |
