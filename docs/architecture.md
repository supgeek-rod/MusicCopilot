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
- **第 3-4 期**：引入 **Companion 伴生服务**（Node.js），补齐 SQMusic 不具备的 NAS 侧能力（fnOS 对接、文件扫描、标签写入）。
- **第 5-6 期**：自建 **MusicCopilot Server** 按相同接口契约替换 SQMusic 后端，Docker 一键交付。Companion 与自建后端**合并为同一个 Node 服务**（按模块启停），避免维护两套进程。

## 2. 目标仓库形态（monorepo）

> 第 1-2 期保持现有单包结构不动；第 3 期动工时一次性迁移到 workspaces（迁移成本低：移动目录 + 改 npm workspaces 字段）。

```
MusicCopilot/
├─ apps/
│  ├─ web/                      # 现有 SPA（package.json + public/ + src/ 原样迁入）
│  │  ├─ .env / config.json   # 运行配置（MC_* 变量；dev 由 Vite 生成 config.json）
│  │  └─ src/
│  │     ├─ api/                # http 客户端 + 各后端接口封装（见 §4 前端适配层）
│  │     ├─ stores/ views/ components/ lib/ router/
│  └─ server/                   # 第3期起：Companion + 自建后端（同一 Node 服务）
│     └─ src/
│        ├─ modules/
│        │  ├─ auth/            # 第2期：登录签发 token（JWT）、用户配置
│        │  ├─ fnos/            # 第3期：fnOS 接口代理（登录/曲库/歌单）
│        │  ├─ library/         # 第3期：本地音乐库扫描与浏览
│        │  ├─ playlist/        # 第3期：歌单查看、歌单补全下载编排
│        │  ├─ healthcheck/     # 第4期：文件体检、标签写入、重命名
│        │  ├─ music/           # 第5期：聚合搜索/详情/直链（调用音源插件）
│        │  ├─ download/        # 第5期：下载引擎（队列/并发/进度/重试/写标签）
│        │  └─ tasks/           # 第5期：任务持久化与查询
│        ├─ plugins/sources/    # 第5期：音源插件（kw/netease/mg/tidal…），可独立热更新
│        └─ infra/              # 配置加载、SQLite、日志、静态托管
│     └─ data/                  # SQLite 数据库 + 下载目录（Docker 卷挂载）
├─ packages/
│  └─ api-contract/             # 前后端共享 TS 类型与接口契约（单一来源）
├─ docker/
│  ├─ web.Dockerfile            # 基础版已提前落地（根级 Dockerfile，nginx 托管 + /api 反代）；第6期扩展 /mc 反代与多服务编排
│  ├─ server.Dockerfile         # 第6期：Node 服务
│  └─ docker-compose.yml
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
| `server/healthcheck` | 4 | 缺失数据体检、在线匹配、标签写入与重命名（music-metadata、ffmpeg） | library/music |
| `server/music` | 5 | 聚合搜索/详情/直链解析，对接音源插件注册表 | plugins/sources |
| `server/plugins/sources` | 5 | 每平台一个插件，实现统一 SourcePlugin 接口，可独立启停与热更新 | — |
| `server/download` | 5 | 下载队列/并发/进度/重试；完成后自动写标签内嵌封面 | tasks/healthcheck |
| `server/tasks` | 5 | 任务持久化（SQLite）与查询接口 | infra |

## 4. 关键架构决策

| # | 决策 | 理由 |
| --- | --- | --- |
| 1 | **接口契约先行**：前后端共享类型放 `packages/api-contract` | 第 5 期替换后端时前端零改动；统一 `{code,msg,data}` 包裹与错误语义 |
| 2 | **单服务渐进生长**：Companion 与自建后端是同一个 `apps/server`，按模块启用 | 避免维护两套进程/镜像；第 3 期骨架直接长成第 5 期形态 |
| 3 | **音源插件化**：解析逻辑按平台隔离在 `plugins/sources` | 平台接口变动频繁，解析层独立可热更新，坏一个源不影响整体 |
| 4 | **统一鉴权**：第 2 期登录框 + JWT；前端 axios 适配层同时兼容 SQMusic 的 `sqmusic` 头与自建服务的 `Authorization: Bearer` | 配置文件不再存明文密码；过渡期双后端并存无感切换 |
| 5 | **数据闭环**：下载目录 = fnOS 音乐目录（Docker 卷映射同一路径） | 新下载自动被 fnOS 扫描入库，歌单补全/音质升级无需搬运文件 |
| 6 | **同源部署**：生产由 nginx 反代 `/api`、`/mc`，开发用 Vite proxy | 彻底规避 CORS；`config.json` 只需留空 baseUrl |
| 7 | **技术栈**：server 用 Fastify + better-sqlite3；构建产物单进程 | 轻量、TS 友好、NAS 资源占用低 |
| 8 | **fnOS 同源反代直连**：`/fnos` 前缀固定为「fnOS 音乐 API 同源代理」（dev 走 Vite proxy，生产走 nginx），前端登录后以 `document.cookie` 写入 `music-token`，封面/音频流用相对路径自动携带 Cookie；第 3 期由 Companion `server/fnos` 模块接管同一前缀 | fnOS 媒体接口强制 Cookie 鉴权，跨域直连不可行；前缀语义固定后伴生服务接管零改动 |

## 5. 部署拓扑（第 6 期目标）

```
[浏览器]
   │ 同源
   ▼
┌────────────────────── nginx (web 容器) ────────────────────┐
│  /            → SPA 静态文件                                │
│  /api/*       → SQMusic 后端（过渡期） / MusicCopilot Server │
│  /fnos/*      → fnOS 网关 5666（第 3 期起改指 Companion）    │
│  /mc/*        → MusicCopilot Server（Companion 模块）        │
└──────────────────────────────┬─────────────────────────────┘
                               ▼
                  ┌──────── server 容器 ────────┐
                  │ auth / fnos / library /     │
                  │ playlist / healthcheck /    │
                  │ music / download / tasks    │
                  └──────┬─────────────┬────────┘
                         ▼             ▼
                   [SQLite data 卷]  [音乐目录卷] ⇄ fnOS 自动扫描入库
```

## 6. 前端适配层（过渡期双后端并存）

`src/api/http.ts` 已集中处理 baseURL 与 token 头，后续扩展为**按后端分组**：

```
src/api/
├─ http.ts        # 请求实例工厂：createClient({ baseURL, authMode })
├─ sqmusic.ts     # SQMusic 后端（现有 music/auth/task/download 封装）
├─ fnos.ts        # 2.5 期：fnOS 音乐 API（/fnos 反代直连，code==0 信封 + Cookie 鉴权）
├─ companion.ts   # 第3期：/mc 曲库、歌单、体检接口
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

## 7. 各期落地清单（与路线图对应）

| 期 | 架构动作 |
| --- | --- |
| 第 2 期 | 前端登录框 + token；config.json 去密码；搜索历史等纯前端功能 |
| 第 3 期 | 迁移 monorepo；新建 `apps/server` 骨架（Fastify + infra）；实现 fnos/library/playlist 模块；引入 docker/web.Dockerfile |
| 第 4 期 | server 增加 healthcheck 模块；前端「音乐库体检」页 |
| 第 5 期 | server 增加 music/download/tasks 与音源插件；前端切换到自建后端；SQMusic 下线 |
| 第 6 期 | compose 收口：web + server 两容器 + 卷挂载；fnOS 图形化部署模板 |
