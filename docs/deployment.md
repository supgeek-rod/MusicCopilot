---
title: 部署指南
description: Docker Compose 拉取预构建镜像部署（GHCR / Docker Hub）与静态部署
---

# 部署指南

## 容器与拓扑（自建后端）

两容器默认拓扑（`docker compose up -d` 一键拉起），各司其职：

| 服务（容器名） | 镜像来源 | 职责 | 容器内端口 | 宿主端口 | 数据卷 |
| --- | --- | --- | --- | --- | --- |
| `web`（music-copilot-web） | CI 构建 `ghcr.io/supgeek-rod/music-copilot`（Docker Hub 同步发布；或本地 `Dockerfile`） | nginx 托管前端静态文件；`/api` 反代到 server；启动时按环境变量生成 `config.json` | 80 | `MC_WEB_PORT`（如 12312） | — |
| `server`（music-copilot-server） | CI 构建 `ghcr.io/supgeek-rod/music-copilot-server`（Docker Hub 同步发布；也可 `--build` 本地构建 `server/Dockerfile`，php:8.4-cli-alpine 多阶段） | 自建后端：API 进程（`php artisan serve`）负责搜索/详情/歌词/直链解析、下载任务创建与管理（无认证），附 OpenAPI 文档；entrypoint 同时拉起下载队列 worker（`queue:work`）：解析直链 → 流式下载落盘 → 状态回写 → 按路径模板重排 | 17017 | -（不发布宿主端口） | `data/` → `/data`（SQLite 库） |

server 的下载目录挂载的是宿主机音乐库目录（`MC_MUSIC_DOWNLOAD_DIR`，即 fnOS「音乐」应用扫描的目录）。数据流：

1. 前端发起下载 → server 写入 SQLite 队列
2. server 内的队列 worker 解析直链，把文件下载到音乐库目录
3. worker 按路径模板（`MC_MUSIC_DOWNLOAD_PATH_TEMPLATE`）把文件重排为「歌手/专辑/」结构（Navidrome 友好，详见[下载与目录布局](./download)）
4. fnOS「音乐」应用扫描目录自动入库

各环节的机制细节（状态机、音质决策、直链时效、真值覆盖写、路径防护等）见[下载与目录布局](./download)。

### 容器互访（compose 网络）

两个容器同处 compose 自动创建的网络，互相用**服务名**访问（Docker 内嵌 DNS `127.0.0.11`，运行时解析）：

| 调用方 | 目标 | 说明 |
| --- | --- | --- |
| web nginx | `http://server:17017`（`/api` 反代） | compose 内固定值，无需配置 |

nginx 已配置按请求解析（`resolver 127.0.0.11`）：上游容器重建换 IP 后 web 自动跟上，无需重启。这些服务名**只在容器网络内可解析**——server **不向宿主机发布端口**，web 的 `/api` 反代是它唯一的对外入口。SQLite 库在项目目录 `data/`（bind mount）中跨容器重建保留；音乐库目录里的文件是最终产物，可随目录迁移。

### compose 机制说明

docker-compose.yml 本身保持无注释、可直接复制使用，非显性约束记录在此：

- **容器变量全部显式声明**：compose 不用 `env_file` 整包注入 `.env`——容器能收到哪些变量，读 compose 的 `environment` 即可一目了然；`.env`（及真实环境变量）只对 yaml 里出现的项生效（`- KEY` 裸名为透传，`${KEY:-默认}` 为带兜底取值），其余键（如仅 Vite dev 使用的 `MC_ALLOWED_HOSTS`）不再进入容器。
- **web 的 `MC_API_BASE_URL` 固定**：compose 中写死 `http://server:17017`（server 容器），`.env` 里为本地开发配置的值不影响容器——两套场景互不干扰。`docker run` 等场景用 `-e MC_API_BASE_URL=...` 传入。
- **server 健康检查**：镜像基于 php:8.4-cli-alpine，没有 curl，故用 `php -r` 探测专属探活端点 `/api/healthcheck`（恒 200 + 统一信封；前端连接探测共用该端点）。
- **server 不发布宿主端口**：容器网络内监听 17017，web 的 `/api` 反代是唯一对外入口。本机临时调试用 `docker compose exec server wget -qO- http://127.0.0.1:17017/api/healthcheck`（alpine 自带 busybox wget），或临时加回 `ports` 再 `up -d`。
- **`stop_grace_period: 10m`**：`docker compose stop` 发出 SIGTERM 后等队列 worker 收尾当前下载（`.part` → rename 落盘），不被默认 10s 的 SIGKILL 腰斩；兜底 10 分钟，小于单个下载任务本身的 1h 超时。
- **卷映射**：两处均为 bind mount，宿主目录可选 env 覆盖——SQLite 库挂 `MC_SERVER_DATA_DIR`（未配置时落到项目目录 `./data`）；下载目录挂 `MC_MUSIC_DOWNLOAD_DIR`（未配置时落到项目目录 `./downloads`）。备份/迁移直接拷这两个目录即可。容器内路径 `DB_DATABASE=/data/database.sqlite`、`MC_MUSIC_DOWNLOAD_DIR=/downloads` 由镜像 ENV（`server/Dockerfile`）固定，`.env` 无需配置。
- **迁移前务必先拷数据**：从命名卷切到 bind mount 后容器会挂到空目录并重建空库，既有任务历史不可恢复。切换前用 `docker compose cp server:/data/. ./data` 迁出（compose 子命令按**服务名**解析，不认容器名），确认无误再 `docker volume rm music-copilot_server-data` 回收空间。
- **从旧默认目录升级**：SQLite 库默认宿主目录已由 `./.data` 改为 `./data`。未显式设置 `MC_SERVER_DATA_DIR` 的既有部署，升级 compose 前先把旧目录改名（`mv .data data`）或显式设 `MC_SERVER_DATA_DIR=./.data`，否则容器会挂到空目录重建空库，下载历史丢失。

### 从旧版本升级：变量改名对照（2026-09-25 起）

compose 变量已统一改名，**旧名会被静默忽略**（无告警、回落默认值），升级前先同步 `.env`：

| 旧名 | 新名 | 未改名的后果 |
| --- | --- | --- |
| `MC_PORT` | `MC_WEB_PORT` | 对外端口回落 `17016` |
| `MC_MUSIC_HOST_DIR` | `MC_MUSIC_DOWNLOAD_DIR` | 音乐库回落项目目录 `./downloads`，下载不再落 NAS 曲库目录 |
| `MC_DIR_TEMPLATE` | `MC_MUSIC_DOWNLOAD_PATH_TEMPLATE` | 模板回落默认值（目录布局退回默认，非致命） |

同时 `MC_API_USERNAME` / `MC_API_PASSWORD` / `MC_API_AUTO_LOGIN`（认证移除后无凭证概念）与历史残留 `MC_API_BASE_URL`、`MC_SERVER_PORT`、`COMPOSE_PROFILES` 已全部失效，可从 `.env` 删除。

### 启用与配置

```bash
# NAS 端 .env（节选，完整模板见仓库 .env.example）
MC_MUSIC_DOWNLOAD_DIR=/vol1/1000/Musics/MusicCopilot   # 音乐库绝对路径（下载落盘目录）
docker compose up -d
```

server **无认证**（2026-09-25 起，任何客户端可直接访问 `/api`，无需账号密码）；数据库迁移随容器启动自动执行，无需手工操作。

## Docker 部署（仅前端，对接外部后端）

镜像由 [GitHub Actions](https://github.com/supgeek-rod/MusicCopilot/actions/workflows/docker-publish.yml) 自动构建并发布到 **GHCR 与 Docker Hub**（`linux/amd64` + `linux/arm64` 双架构，**默认使用 GHCR**：`ghcr.io/supgeek-rod/music-copilot`），直接拉取即可，**无需克隆仓库、无需本地构建**。容器内置 nginx：托管前端静态文件，并把 `/api` 反代到后端（同源访问，无需后端开启 CORS），后端地址等配置全部通过环境变量注入，**改配置重启容器即可，无需重建镜像**。

### 方式一：Compose 拉取预构建镜像（推荐）

> 本节及后续「静态部署」描述的是**仅前端容器**、后端另行部署的轻量方式；启用自建后端全家桶见上文「容器与拓扑」。

新建一个空目录，放入 `docker-compose.yml`：

```yaml
services:
  web:
    image: ghcr.io/supgeek-rod/music-copilot:latest   # Docker Hub 用户可用 supgeekrod/music-copilot:latest
    container_name: music-copilot
    ports:
      - "17016:80"                # 对外端口，按需修改
    environment:
      MC_API_BASE_URL: http://<你的后端地址>:17017            # 必填：nginx 反代目标
    extra_hosts:
      - "host.docker.internal:host-gateway"   # 后端与容器同机时，后端地址可写 http://host.docker.internal:17017
    restart: unless-stopped
```

```bash
docker compose up -d
```

访问 `http://localhost:17016`。后续升级到新版本：

```bash
docker compose pull && docker compose up -d
```

### 方式二：克隆仓库，使用自带 Compose

仓库自带的 `docker-compose.yml` 各分支内容相同：默认拉取 `latest`（稳定线），加 `--build` 时改为本地构建，并直接复用开发用的 `.env`（`MC_WEB_PORT` 覆盖对外端口，`MC_IMAGE_TAG` 覆盖镜像 tag）：

```bash
git clone https://github.com/supgeek-rod/MusicCopilot.git
cd MusicCopilot
cp .env.example .env    # 默认值即可部署；仅本地开发需把后端地址改为 http://127.0.0.1:17017（.env 不入库）
# 可选：MC_IMAGE_TAG=development 跟随开发分支预构建镜像
docker compose up -d
# 或跟当前代码：docker compose up -d --build
```

### 方式三：docker run

```bash
docker run -d -p 17016:80 \
  -e MC_API_BASE_URL=http://<你的后端地址>:17017 \
  ghcr.io/supgeek-rod/music-copilot:latest
```

### 本地构建镜像

```bash
docker build -t music-copilot .                       # 前端
docker build -t music-copilot-server ./server         # 自建后端（API 与 worker 同容器）
docker run -d -p 17016:80 \
  -e MC_API_BASE_URL=http://<你的后端地址>:17017 \
  music-copilot
```

### 部署注意事项

- `MC_API_BASE_URL`：仓库自带 compose **无需设置**（yaml 内固定 `http://server:17017` 指向 server 容器，`.env` 里的本地开发值不影响容器）；仅 `docker run` / 自带 sample compose 对接独立部署的后端时用 `-e` 传入。后端与容器同机时注意：容器内 `localhost` 指向容器自身，应使用宿主机局域网 IP。
- 密码避免包含 `"` 或 `\`（当前仅涉飞牛音乐库账号）。
- 对外端口默认 `17016`；克隆仓库部署时可在 `.env` 里用 `MC_WEB_PORT` 覆盖。
- 仓库自带 compose 的镜像 tag 默认 `latest`；在 `.env` 里用 `MC_IMAGE_TAG` 覆盖（如 `development`），不要按分支改 yaml。
- 容器启动失败先看容器日志（自带 compose 为 `docker logs music-copilot-web`）：`docker run` 未传 `-e` 时多为缺少 `MC_API_BASE_URL`（compose 部署已内置）。后端无认证，无需任何账号密码配置。

### 镜像 tag 说明

构建触发规则：push `development` 分支发布 `development` tag；push `v*` 版本 tag 发布语义化版本并发布 `latest`（稳定线 = 版本发布）。**前端（`music-copilot`）与自建后端（`music-copilot-server`）双镜像使用同一套 tag 策略，由同一 workflow 矩阵并行构建**：

| tag | 对应构建 |
| --- | --- |
| `latest` | `v*` 版本 tag 的最新发布构建 |
| `development` | `development` 分支的最新构建 |
| `0.2.0` / `0.2` | `v*` 版本 tag 的发布构建 |

## 静态部署

`npm run build` 产物为纯静态文件（`dist/`），可托管到任意静态服务器：

- 需在同源服务上把 `/api` 反代到后端（自建 server，见[配置说明 · CORS](./configuration.md#跨域-cors)）
- 运行时配置通过 `dist/config.json` 提供，改完刷新即生效、无需重新构建（见[配置说明](./configuration.md)）
- 路由为 hash 模式（`#/search` 等），无需配置 history 回退
- PWA 同样生效（Service Worker 要求 HTTPS 或 localhost 环境）

## 相关文件

| 文件 | 说明 |
| --- | --- |
| `Dockerfile` | 前端镜像（多阶段构建：node 构建 → nginx 托管 + `/api` 反代） |
| `docker-compose.yml` | 一键编排两容器（默认 `latest`，可用 `MC_IMAGE_TAG` 覆盖；容器变量在 `environment` 中显式声明，`.env` 经插值传入） |
| `docker/` | nginx 反代模板 + 容器入口配置生成脚本 |
| `server/Dockerfile` | 自建后端镜像（php:8.4-cli-alpine 多阶段，vendor 分层；API 与 worker 同镜像） |
| `.github/workflows/docker-publish.yml` | 前端镜像自动构建与发布（GHCR + Docker Hub） |
