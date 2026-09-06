# MusicCopilot

[![Build & Publish Docker Image](https://github.com/supgeek-rod/MusicCopilot/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/supgeek-rod/MusicCopilot/actions/workflows/docker-publish.yml)

基于 **Vue 3 + TypeScript + Vite + shadcn-vue** 的音乐搜索与下载 Web 客户端，对接 [Simple SQ Music Plus](https://github.com/59799517/simple_sq_music_plus) 的 HTTP 接口。

## 功能

- **歌曲搜索**：音源固定为酷我（kw，不展示后端其余插件）、搜索联想词、分页、音质标签展示（按码率从高到低排序）
- **在线试听**：底部迷你播放条，流式播放高音质直链，支持播放队列连播（上一首/下一首/自动切歌）
- **歌词查看**：弹窗展示 LRC 歌词
- **歌手页**：歌手头像与简介、全部歌曲（分页加载更多）、全部专辑网格，支持一键下载全部专辑
- **专辑页**：专辑封面与详情、曲目列表（按曲目序号排序）、播放整张（入队连播）、下载整张（可选音质批量入队）
- **歌曲下载**：
  - 歌曲行**一键下载**（默认最高音质，可在「设置」中指定偏好音质；歌曲没有该音质时自动就近降档，再就近升档，仍无则取最高）
  - 「更多操作」菜单：加入**服务器下载队列**（可选音质，任务进度在「下载任务」页查看，支持重试 / 删除 / 批量操作）
  - **浏览器直链下载**（选音质后由浏览器保存到本机）
- **设置**：导航栏齿轮进入，可配置下载音质偏好（本地持久化）
- **下载任务管理**：状态徽标、5 秒轮询自动刷新、单条重试/重新入队/删除、批量重试与批量删除（带确认框）、按状态筛选
- **下载完成通知**：全局 toast 提醒（15 秒轮询检测状态迁移，批量完成自动聚合成摘要，任意页面可见）
- **深色模式**、运行时配置文件、登录态自动维护（token 失效自动重登）
- **PWA**：可安装到桌面 / 手机主屏，静态资源预缓存 + 封面图缓存（`/api` 与 `config.json` 永不缓存）

## 快速开始

```bash
npm install
npm run dev        # 开发，默认 http://localhost:5173
npm run build      # 构建产物输出到 dist/
npm run preview    # 本地预览构建产物
```

## 后端配置

配置统一走 **`MC_` 前缀环境变量**（模板见 [.env.example](.env.example)；真实环境变量优先于 `.env` 文件）：

```bash
cp .env.example .env   # 然后按需修改（.env 已被 git 忽略）
```

| 变量 | 说明 |
| --- | --- |
| `MC_API_BASE_URL` | SQ Music 后端地址：dev/preview 的 Vite 代理与 Docker nginx 的反代目标（`npm run dev` / `preview` 与容器部署必填，勿把局域网 IP 写进源码） |
| `MC_API_USERNAME` / `MC_API_PASSWORD` | 登录账号密码，启动时自动登录（token 失效也会自动重登） |
| `MC_AUTO_LOGIN` | 是否自动登录（`true` / `false`，默认 `true`） |
| `MC_ALLOWED_HOSTS` | 域名/反向代理访问 dev、preview 时放行的 Host（逗号分隔；Vite 默认仅放行 localhost） |

> 注意：`.env` 以明文保存密码，请仅在内网可信环境使用；「登录框 + 记住 token」模式规划在路线图第 2 期。

### 配置如何生效

应用启动时始终 `fetch` 运行时配置 `config.json`，不同场景来源不同：

- **开发 / 本地预览**：Vite 中间件从 `.env`（或真实环境变量）虚拟生成，无需任何文件
- **静态部署**：`npm run build` 时若配置了任一 `MC_*` 变量，会生成 `dist/config.json`；也可手动创建或修改该文件（运行时读取，改完刷新即生效，无需重新构建）
- **Docker**：容器启动时由入口脚本从环境变量生成（见下文）

### 跨域（CORS）说明

- **开发**：浏览器同源访问自身 `/api`，由 Vite 代理转发到 `MC_API_BASE_URL`，不存在 CORS 问题。
- **生产**：推荐直接用下方 Docker 镜像（容器内 nginx 反代 `/api`，天然同源）；自行静态部署 `dist/` 时，需在同源服务上把 `/api` 反代到后端（自建 nginx 的 `proxy_pass` 或同级反代），并保证 `config.json` 的 `baseUrl` 保持为空。个别需要浏览器直连后端的设备，可在应用设置面板按设备覆盖后端地址（仅存于该设备浏览器）。

## Docker 部署

容器内置 nginx：托管前端静态文件，并把 `/api` 反代到后端（同源访问，无需后端开启 CORS）。容器内 `baseUrl` 固定为空串，后端地址等配置全部通过环境变量注入，**改配置重启容器即可，无需重建镜像**：

```bash
# 方式一：拉取预构建镜像（CI 自动发布，docker-compose.yml 默认走这里）
docker run -d -p 17016:80 \
  -e MC_API_BASE_URL=http://192.168.31.31:8096 \
  -e MC_API_USERNAME=admin -e MC_API_PASSWORD=admin \
  supgeekrod/music-copilot:latest
# GHCR 镜像：ghcr.io/supgeek-rod/music-copilot:latest

# 方式二：docker compose（env_file 直接复用开发用的 .env）
docker compose up -d          # 拉取预构建镜像
docker compose up -d --build  # 或在本地构建

# 方式三：本地构建镜像
docker build -t music-copilot .
docker run -d -p 17016:80 \
  -e MC_API_BASE_URL=http://192.168.31.31:8096 \
  -e MC_API_USERNAME=admin -e MC_API_PASSWORD=admin \
  music-copilot
```

访问 http://localhost:17016。`MC_API_BASE_URL` 必填（nginx 反代目标）；密码避免包含 `"` 或 `\`。对外端口默认 17016，compose 部署时可在 `.env` 里用 `MC_PORT` 覆盖。容器启动失败先看 `docker logs music-copilot`，多为缺少 `MC_API_BASE_URL`。

### 镜像 tag 说明

镜像由 [GitHub Actions](.github/workflows/docker-publish.yml) 自动构建发布（`linux/amd64` + `linux/arm64`，同步发布到 Docker Hub 与 GHCR）：

| tag | 对应构建 |
| --- | --- |
| `latest` | `v0.1.x` 分支的最新构建 |
| `development` | `development` 分支的最新构建 |
| `0.1.2` / `0.1` | `v*` 版本 tag 的发布构建 |

## 目录结构

```
.env / .env.example    # 运行配置（后端地址 / 账号；.env 不入库，模板见 .env.example）
Dockerfile             # 前端镜像（多阶段构建，nginx 托管 + /api 反代）
docker-compose.yml     # 一键编排（env_file 复用 .env）
docker/                # nginx 反代模板 + 容器入口配置生成脚本
docs/                  # 项目文档
├─ ARCHITECTURE.md     #   整体架构设计（按路线图演进）
├─ FEATURES.md         #   功能说明（页面/交互/实现要点）
└─ api-test-report.md  #   后端接口实测报告（调用前必读）
src/api/               # 接口封装（axios + 统一响应解包 + 403 自动重登）
src/stores/            # Pinia：应用配置登录态 / 播放队列
src/views/             # 搜索页、歌手页、专辑页、下载任务页
src/components/        # 歌曲列表、下载音质菜单、播放条、歌词弹窗、歌手/专辑页组件
src/components/ui/     # shadcn-vue 生成的本地 UI 组件
src/lib/               # 工具：格式化、数据适配（adapter）、富文本净化（sanitize）
```

## 开发路线图

> 各期对应的整体架构设计（服务划分、模块边界、部署拓扑）见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

### 第 1 期 —— 已完成 ✅

- **歌曲搜索**：音源插件切换、搜索联想词（防抖）、分页、音质标签
- **在线试听**：底部迷你播放条，流式播放
- **歌词查看**：LRC 弹窗
- **歌曲下载**：服务器下载队列 + 浏览器直链下载两种方式
- **下载任务管理**：轮询刷新、状态徽标、重试/删除/批量操作、状态筛选
- **播放队列**：歌曲行「播放」或双击歌曲行即加入队列并立即播放（不替换队列）、整张/整组连播（替换队列）、加入/移出队列、队列面板（切歌/移除/清空）、上一首/下一首、自动切歌、刷新后恢复
- **歌手页**：歌手头像与简介、全部歌曲（加载更多）、全部专辑网格、一键下载全部专辑
- **专辑页**：封面与详情、曲目列表、播放整张、下载整张（可选音质）
- **基础设施**：运行时配置文件、自动登录与 token 失效自动重登、深色模式、Vite 代理与 CORS 兼容方案

### 第 2 期 —— 纯前端，立刻可做 ⬜

> 目标：把后端已有的能力吃完

- ✅ 播放队列管理：歌曲一键加入/移出队列、播放条队列面板、刷新后队列恢复（已提前完成）
- ✅ 歌手/专辑页（已提前在第 1 期完成）
- ✅ 批量下载：下载整张 / 下载歌手全部专辑（已提前在第 1 期完成）
- ✅ 搜索历史：本地保存最近搜索词，支持一键重搜（已提前完成）
- ✅ PWA：可安装到桌面 / 手机主屏（已提前完成）
- ✅ 下载完成通知：全局页面 toast，批量自动聚合（已提前完成）
- ⬜ 可再扩展：收藏夹（喜欢的歌曲）、最近播放记录

### 第 3 期 —— Companion 伴生服务：对接飞牛（fnOS）⬜

> 目标：先只做「fnOS 曲库浏览 + 歌单查看 + 歌单补全下载」，闭环最有感

- 新增轻量 Node.js 伴生服务，部署在 NAS 上（与 SQMusic 后端同机）：
  - **fnOS 接口代理**：fnOS 登录鉴权 + 音乐库/歌单接口转发（官方未开放完整文档，需社区逆向）
- 前端新增页面：
  - **曲库浏览**：按歌手/专辑/文件夹浏览 NAS 音乐库，本地文件流式试听
  - **歌单查看**：展示飞牛音乐歌单并直接播放
  - **歌单补全下载**：对比歌单与本地库，缺失歌曲一键从在线源下载到飞牛音乐目录（SQMusic 下载目录指向音乐库，fnOS 自动扫描入库，形成闭环）

### 第 4 期 —— 音乐库体检（元数据校正）⬜

> 目标：在伴生服务上加文件扫描与标签写入能力

- 伴生服务扩展：扫描音乐目录（`music-metadata` 读取），写入 ID3v2（mp3）/ Vorbis 注释（flac）标签、内嵌封面与歌词（`ffmpeg` / taglib）
- 前端新增「音乐库体检」页：
  - 问题清单：缺封面 / 缺歌词 / 缺歌手专辑 / 文件名混乱 / 疑似重复
  - 自动匹配：用文件名 + 现有标签调搜索接口，给出候选与置信度，一键写入并按「歌手 - 标题」规范重命名
  - 忽略清单，避免反复提示无法修正的文件

### 第 5 期 —— 自建下载服务，替换 Simple SQ Music Plus ⬜

> 目标：摆脱对第三方后端的依赖，前端沿用现有 `/api/*` 接口契约平滑切换

- 自建轻量后端（Node.js，可与第 3 期 Companion 伴生服务合并为同一个服务），对齐前端已使用的接口契约：登录鉴权、搜索（单曲/歌手/专辑/联想词）、歌手/专辑详情、获取下载直链、下载任务（单曲/整张/歌手全部专辑）及任务管理
- **音源插件架构**：各平台的搜索与直链解析按插件隔离（kw / netease / mg / tidal…），单个音源失效不影响整体；插件可配置启停，便于跟进平台变动
- **下载引擎**：任务队列 / 并发控制 / 进度上报 / 失败重试 / 下载完成自动写标签与内嵌封面（复用第 4 期能力）
- **持久化**：任务与配置使用 SQLite 存储
- 风险提示：各音乐平台的解析接口变动频繁，解析层建议保持独立、可热更新，降低维护成本

### 第 6 期 —— 打包成 Docker 应用 ⬜

> 基础前端镜像已提前落地（根级 `Dockerfile` + `docker-compose.yml`，见「Docker 部署」），本期收口多服务编排与 fnOS 适配。

> 目标：一条命令部署，前端 + 伴生服务整体交付，顺便根治 CORS 问题

- **前端镜像**：多阶段构建（node 构建 → nginx 托管静态文件），nginx 同时反代 `/api` 到后端，浏览器同源访问，不再依赖后端开启 CORS
- **伴生服务镜像**：第 3/4 期的 Companion 服务独立打包，与前端镜像组合编排
- **docker-compose.yml**：一键拉起 MusicCopilot 前端 + 伴生服务（可按需与 Simple SQ Music Plus 后端或自建下载服务编排到同一网络）
- **配置挂载**：`config.json` 以卷挂载，改后端地址/账号无需重建镜像，改完重启容器生效
- 适配飞牛 fnOS 的 Docker 图形化部署（compose 模板导入即用）

### 前置建议 🔐

目前 `config.json` 明文保存账号密码，只适合内网自用。第 2 期开始前建议改为「**首次访问弹登录框 + 记住 token**」的模式（配置文件只留后端地址，不再存密码），后续 Companion 伴生服务沿用同一套鉴权。
