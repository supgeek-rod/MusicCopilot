---
title: 部署指南
description: Docker Compose 拉取预构建镜像部署（Docker Hub / GHCR）与静态部署
---

# 部署指南

## Docker 部署（推荐）

镜像由 [GitHub Actions](https://github.com/supgeek-rod/MusicCopilot/actions/workflows/docker-publish.yml) 自动构建并发布到 **Docker Hub 与 GHCR**（`linux/amd64` + `linux/arm64` 双架构），直接拉取即可，**无需克隆仓库、无需本地构建**。容器内置 nginx：托管前端静态文件，并把 `/api` 反代到后端（同源访问，无需后端开启 CORS），后端地址等配置全部通过环境变量注入，**改配置重启容器即可，无需重建镜像**。

### 方式一：Compose 拉取预构建镜像（推荐）

新建一个空目录，放入 `docker-compose.yml`：

```yaml
services:
  web:
    image: supgeekrod/music-copilot:latest   # GHCR 用户改为 ghcr.io/supgeek-rod/music-copilot:latest
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
  supgeekrod/music-copilot:latest
```

### 本地构建镜像

```bash
docker build -t music-copilot .
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

构建触发规则：push `development` / `v0.1.x` 分支发布对应分支名 tag（`v0.1.x` 分支额外发布 `latest`）；push `v*` 版本 tag 发布语义化版本：

| tag | 对应构建 |
| --- | --- |
| `latest` | `v0.1.x` 分支的最新构建 |
| `v0.1.x` | `v0.1.x` 分支的最新构建（与 `latest` 同时发布） |
| `development` | `development` 分支的最新构建 |
| `0.1.2` / `0.1` | `v*` 版本 tag 的发布构建 |

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
| `docker-compose.yml` | 一键编排（默认 `latest`，可用 `MC_IMAGE_TAG` 覆盖；env_file 复用 `.env`） |
| `docker/` | nginx 反代模板 + 容器入口配置生成脚本 |
| `.github/workflows/docker-publish.yml` | 镜像自动构建与发布（GHCR + Docker Hub） |
