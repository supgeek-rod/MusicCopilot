---
title: 部署指南
description: Docker Compose 拉取预构建镜像部署（GHCR / Docker Hub）与静态部署
---

# 部署指南

## 容器与拓扑（自建后端）

启用第 5 期全家桶（在 `.env` 配置 `COMPOSE_PROFILES=server` 后 `docker compose up -d`）共三个容器，各司其职：

| 服务（容器名） | 镜像来源 | 职责 | 容器内端口 | 宿主端口 | 数据卷 |
| --- | --- | --- | --- | --- | --- |
| `web`（music-copilot） | CI 构建 `ghcr.io/supgeek-rod/music-copilot`（Docker Hub 同步发布；或本地 `Dockerfile`） | nginx 托管前端静态文件；`/api` 反代到 server；启动时按环境变量生成 `config.json` | 80 | `MC_PORT`（如 12312） | — |
| `server`（music-copilot-server） | CI 构建 `ghcr.io/supgeek-rod/music-copilot-server`（Docker Hub 同步发布；也可 `--build` 本地构建 `server/Dockerfile`，php:8.4-cli-alpine 多阶段） | 自建后端 API：登录鉴权、搜索/详情/歌词/直链解析、下载任务创建与任务管理（SQMusic 对齐契约），附 OpenAPI 文档 | 8097 | `MC_SERVER_PORT`（默认 8097） | `server-data` → `/data`（SQLite 库） |
| `server-worker`（music-copilot-server-worker） | 与 server 同镜像 | 下载队列 worker（`queue:work`）：解析直链 → 流式下载落盘 → 状态回写 → 完成后按目录模板重排 | — | — | 与 server 共享（SQLite + 音乐库目录） |

server 与 server-worker 的下载目录挂载的是宿主机音乐库目录（`MC_MUSIC_HOST_DIR`，即 fnOS「音乐」应用扫描的目录）。数据流：

1. 前端发起下载 → server 写入 SQLite 队列
2. server-worker 解析直链，把文件下载到音乐库目录
3. worker 按目录模板（`MC_DIR_TEMPLATE`）把文件重排为「歌手/专辑/」结构（Navidrome 友好，详见[下载与目录布局](./download)）
4. fnOS「音乐」应用扫描目录自动入库

各环节的机制细节（状态机、音质决策、直链时效、真值覆盖写、路径防护等）见[下载与目录布局](./download)。

### 容器互访（compose 网络）

三个容器同处 compose 自动创建的网络，互相用**服务名**访问（Docker 内嵌 DNS `127.0.0.11`，运行时解析）：

| 调用方 | 目标 | 引用变量 |
| --- | --- | --- |
| web nginx | `http://server:8097`（`/api` 反代） | `MC_API_BASE_URL` |

nginx 已配置按请求解析（`resolver 127.0.0.11`）：上游容器重建换 IP 后 web 自动跟上，无需重启。这些服务名**只在容器网络内可解析**——局域网访问后端要走宿主发布的端口（`MC_SERVER_PORT`）。SQLite 库在 `server-data` 卷中跨容器重建保留；音乐库目录里的文件是最终产物，可随目录迁移。

### 启用与配置

```bash
# NAS 端 .env（节选，完整模板见仓库 .env.example）
COMPOSE_PROFILES=server
MC_MUSIC_HOST_DIR=/vol1/1000/Musics/MusicCopilot   # 音乐库绝对路径（下载落盘目录）
docker compose up -d
```

server 的登录凭证用 `MC_AUTH_USERNAME` / `MC_AUTH_PASSWORD`（默认 admin/admin）；数据库迁移随容器启动自动执行，无需手工操作。

## Docker 部署（仅前端，对接外部后端）

镜像由 [GitHub Actions](https://github.com/supgeek-rod/MusicCopilot/actions/workflows/docker-publish.yml) 自动构建并发布到 **GHCR 与 Docker Hub**（`linux/amd64` + `linux/arm64` 双架构，**默认使用 GHCR**：`ghcr.io/supgeek-rod/music-copilot`），直接拉取即可，**无需克隆仓库、无需本地构建**。容器内置 nginx：托管前端静态文件，并把 `/api` 反代到后端（同源访问，无需后端开启 CORS），后端地址等配置全部通过环境变量注入，**改配置重启容器即可，无需重建镜像**。

### 方式一：Compose 拉取预构建镜像（推荐）

> 本节及后续「静态部署」描述的是**仅前端容器**对接既有后端（如 SQ Music）的轻量部署；启用自建后端全家桶见上文「容器与拓扑」。

新建一个空目录，放入 `docker-compose.yml`：

```yaml
services:
  web:
    image: ghcr.io/supgeek-rod/music-copilot:latest   # Docker Hub 用户可用 supgeekrod/music-copilot:latest
    container_name: music-copilot
    ports:
      - "17016:80"                # 对外端口，按需修改
    environment:
      MC_API_BASE_URL: http://<你的 SQ Music 后端地址>:8096   # 必填：nginx 反代目标
      MC_API_USERNAME: admin      # 自动登录账号（留空则不自动登录，可在应用设置面板按设备配置）
      MC_API_PASSWORD: admin
    extra_hosts:
      - "host.docker.internal:host-gateway"   # 后端与容器同机时，后端地址可写 http://host.docker.internal:8096
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

仓库自带的 `docker-compose.yml` 各分支内容相同：默认拉取 `latest`（稳定线），加 `--build` 时改为本地构建，并直接复用开发用的 `.env`（`MC_PORT` 覆盖对外端口，`MC_IMAGE_TAG` 覆盖镜像 tag）：

```bash
git clone https://github.com/supgeek-rod/MusicCopilot.git
cd MusicCopilot
cp .env.example .env    # 填写后端地址与账号（.env 不入库）
# 可选：MC_IMAGE_TAG=development 跟随开发分支预构建镜像
docker compose up -d
# 或跟当前代码：docker compose up -d --build
```

### 方式三：docker run

```bash
docker run -d -p 17016:80 \
  -e MC_API_BASE_URL=http://<你的 SQ Music 后端地址>:8096 \
  -e MC_API_USERNAME=admin -e MC_API_PASSWORD=admin \
  ghcr.io/supgeek-rod/music-copilot:latest
```

### 本地构建镜像

```bash
docker build -t music-copilot .                       # 前端
docker build -t music-copilot-server ./server         # 自建后端（server-worker 共用）
docker run -d -p 17016:80 \
  -e MC_API_BASE_URL=http://<你的 SQ Music 后端地址>:8096 \
  -e MC_API_USERNAME=admin -e MC_API_PASSWORD=admin \
  music-copilot
```

### 部署注意事项

- `MC_API_BASE_URL` 必填（nginx 反代目标）。后端与容器同机时注意：容器内 `localhost` 指向容器自身，应使用 `http://host.docker.internal:8096`（自带 compose 已配好 host-gateway 映射）或宿主机局域网 IP。
- 密码避免包含 `"` 或 `\`。
- 对外端口默认 `17016`；克隆仓库部署时可在 `.env` 里用 `MC_PORT` 覆盖。
- 仓库自带 compose 的镜像 tag 默认 `latest`；在 `.env` 里用 `MC_IMAGE_TAG` 覆盖（如 `development`），不要按分支改 yaml。
- 容器启动失败先看 `docker logs music-copilot`，多为缺少 `MC_API_BASE_URL`。

### 镜像 tag 说明

构建触发规则：push `development` / `main` 分支发布对应分支名 tag（`main` 分支额外发布 `latest`）；push `v*` 版本 tag 发布语义化版本。**前端（`music-copilot`）与自建后端（`music-copilot-server`）双镜像使用同一套 tag 策略，由同一 workflow 矩阵并行构建**：

| tag | 对应构建 |
| --- | --- |
| `latest` | `main` 分支的最新构建 |
| `main` | `main` 分支的最新构建（与 `latest` 同时发布） |
| `development` | `development` 分支的最新构建 |
| `0.2.0` / `0.2` | `v*` 版本 tag 的发布构建 |

## 静态部署

`npm run build` 产物为纯静态文件（`dist/`），可托管到任意静态服务器：

- 需在同源服务上把 `/api` 反代到 SQ Music 后端（见[配置说明 · CORS](./configuration.md#跨域-cors)）
- 运行时配置通过 `dist/config.json` 提供，改完刷新即生效、无需重新构建（见[配置说明](./configuration.md)）
- 路由为 hash 模式（`#/search` 等），无需配置 history 回退
- PWA 同样生效（Service Worker 要求 HTTPS 或 localhost 环境）

## 相关文件

| 文件 | 说明 |
| --- | --- |
| `Dockerfile` | 前端镜像（多阶段构建：node 构建 → nginx 托管 + `/api` 反代） |
| `docker-compose.yml` | 一键编排（默认 `latest`，可用 `MC_IMAGE_TAG` 覆盖；server 走 profile；env_file 复用 `.env`） |
| `docker/` | nginx 反代模板 + 容器入口配置生成脚本 |
| `server/Dockerfile` | 自建后端镜像（php:8.4-cli-alpine 多阶段，vendor 分层；API 与 worker 同镜像） |
| `.github/workflows/docker-publish.yml` | 前端镜像自动构建与发布（GHCR + Docker Hub） |
