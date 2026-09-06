---
title: 部署指南
description: Docker 一键部署与静态部署
---

# 部署指南

## Docker 部署（推荐）

容器内置 nginx：托管前端静态文件，并把 `/api` 反代到后端（同源访问，无需后端开启 CORS）。容器内 `baseUrl` 固定为空串，后端地址等配置全部通过环境变量注入，**改配置重启容器即可，无需重建镜像**：

```bash
# 方式一：docker compose（env_file 直接复用开发用的 .env）
docker compose up -d --build

# 方式二：docker run
docker build -t music-copilot .
docker run -d -p 17016:80 \
  -e MC_API_BASE_URL=http://<你的 SQ Music 后端地址>:8096 \
  -e MC_API_USERNAME=admin -e MC_API_PASSWORD=admin \
  music-copilot
```

构建并启动后访问 `http://localhost:17016`。

- `MC_API_BASE_URL` 必填（nginx 反代目标）。后端与容器同机时注意：容器内 `localhost` 指向容器自身，应使用 `http://host.docker.internal:8096`（compose 已配好 host-gateway 映射）或宿主机局域网 IP。
- 密码避免包含 `"` 或 `\`。
- 对外端口默认 `17016`，compose 部署时可在 `.env` 里用 `MC_PORT` 覆盖。
- 容器启动失败先看 `docker logs music-copilot`，多为缺少 `MC_API_BASE_URL`。

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
| `docker-compose.yml` | 一键编排（env_file 复用 `.env`） |
| `docker/` | nginx 反代模板 + 容器入口配置生成脚本 |
