---
title: Server 后端架构
description: 自建后端（PHP / Laravel 13）的分层、音源插件架构与下载队列机制
---

# Server 后端架构

> Laravel 应用根即 `server/` 目录。项目整体架构见[架构设计](./architecture)，下载链路机制细节见[下载与目录布局](./download)。

## 技术栈与运行形态

PHP（≥ 8.3，Docker 镜像 8.4）/ Laravel 13 + SQLite（数据库队列驱动）。**无认证、连接即用**，探活端点 `/api/healthcheck`。运行形态是两个进程：

- `php artisan serve` —— HTTP API（`PHP_CLI_SERVER_WORKERS` 可扩并发）
- `php artisan queue:work` —— 下载队列 worker（serve 不带队列）

开发态手动各开一个终端（见[本地开发](./local-dev)）；Docker 部署时两进程同容器、由 entrypoint 一并拉起并监督（见[Docker 部署](./deployment)）。

## 目录结构

```
server/
├─ app/Http/Controllers/   # Healthcheck（历史信封探活端点）
│  └─ V2/                  # API V2 控制器（REST）：Config / Search / Song / Download / FnosSession
├─ app/Http/Resources/V2/  # V2 响应资源（插件数据 → 契约形态：类型转换与字段收敛，Scramble 精确推断源）
├─ app/Plugins/Sources/    # 音源插件：SourcePlugin 接口 + SourceManager 注册表
│  └─ Kuwo/                #   酷我实现：搜索/详情/歌词/直链解析（KW_* ↔ br 双向映射）
├─ app/Jobs/               # DownloadSongJob（下载状态机与目录重排）、ExpandArtistAlbumJob（歌手专辑异步展开）
├─ app/Services/           # DownloadTaskService（任务创建、专辑同步展开/歌手异步展开）
├─ app/Models/             # DownloadTask 等（SQLite）
├─ config/mc.php           # MC_* 配置：下载目录 MC_MUSIC_DOWNLOAD_DIR 与路径模板
├─ routes/api.php          # /api/* 路由
└─ openapi.json            # OpenAPI 3.1 规范固化产物（Scramble 从控制器自动生成）
```

## 音源插件架构

搜索与直链解析按平台隔离在 `app/Plugins/Sources/`：每平台一个插件实现统一 `SourcePlugin` 接口，经 `SourceManager` 注册表供控制器调用，单个音源失效不影响整体；插件可配置启停。已接入酷我（kw），规划 netease / mg / tidal。

⚠️ 酷我直链解析接口有大陆 IP 区域限制（海外返回 407），搜索/详情/歌词不受影响；实测口径见 `server/docs/kuwo-api-notes.md`。

## 下载子系统

任务落 `download_tasks` 表（可用音质清单、上游原始条目、状态机字段），`queue:work` 单进程串行消费；状态机 `waiting → loading（解析直链）→ downloading（流式落盘）→ success / error`；成功后按 `MC_MUSIC_DOWNLOAD_PATH_TEMPLATE` 重排为「歌手/专辑/」结构。任务创建支持单曲 / 整张同步展开 / 歌手全部专辑异步展开。机制详解见[下载与目录布局](./download)。

## API 文档与契约

Scramble 从控制器与资源类自动生成 OpenAPI 3.1：运行时 `http://127.0.0.1:17017/docs/api.json`，固化产物即本目录 `openapi.json`（`php artisan scramble:export --path=openapi.json`）；Scalar 交互测试台在 `/api-docs.html`。前端契约类型包 `packages/api-contract` 由该规范经 openapi-typescript 生成——规范是唯一契约源。API V2 错误契约（真状态码 + `{error, message}`）渲染在 `bootstrap/app.php`。
