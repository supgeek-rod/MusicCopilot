---
title: 配置说明
description: MC_* 环境变量、运行时 config.json 与跨域（CORS）方案
---

# 配置说明

配置统一以 **`MC_` 前缀环境变量**提供（真实环境变量 > `.env` 文件，模板见仓库内 `.env.example`）：

```bash
cp .env.example .env   # 然后按需修改（.env 已被 git 忽略）
```

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `MC_API_BASE_URL` | 后端服务地址，**仅本地开发使用**：`npm run dev` / `preview` 的 Vite 代理目标，模板默认 `http://127.0.0.1:17017`。**Docker 部署忽略此变量**——compose 内固定反代到 server 容器（`http://server:17017`）；`docker run` 对接独立部署的后端时用 `-e` 传入。自建后端的下载相关变量见[部署指南](./deployment.md) |
| `MC_ALLOWED_HOSTS` | 域名/反向代理访问 dev、preview 时放行的 Host（逗号分隔；Vite 默认仅放行 localhost） |
| `MC_FNOS_BASE_URL` | 飞牛（fnOS）网关地址（如 `http://192.168.1.100:5666`）：Vite 代理与 Docker nginx 把 `/fnos` 反代到该地址；**不配置则「音乐库」入口不显示** |
| `MC_FNOS_USERNAME` / `MC_FNOS_PASSWORD` | 飞牛音乐登录账号，**由 server 容器代持**（`/api/fnos/login` 服务端代调登录，token 经 HttpOnly Cookie 下发浏览器，**不写入 config.json**）。本地 dev 需将三项同步配到 `server/.env`（server 直连 fnOS 网关） |
| `MC_FNOS_AUTO_LOGIN` | 是否自动登录飞牛音乐（`true` / `false`，默认 `true`） |
| `MC_WEB_PORT` | 端口：docker-compose.yml 的 web 对外端口，同时是本地 `npm run dev` / `npm run preview` 的服务器端口（默认 `17016`；本地未配置或非法值回退 `5173`，端口被占用自动 +1） |
| `MC_IMAGE_TAG` | 仓库自带 compose 拉取的镜像 tag（仅 docker-compose.yml 读取，默认 `latest`）。跟 `development` 分支预构建镜像时设为 `development`；本地构建用 `docker compose up -d --build` |
| `MC_SERVER_DATA_DIR` | 自建后端 SQLite 库的宿主机目录（绝对路径）。未配置时落到项目目录 `data` |
| `MC_MUSIC_DOWNLOAD_DIR` | 自建后端下载落盘的音乐库目录（宿主机绝对路径，即 fnOS「音乐」应用扫描的目录）。未配置时落到项目目录 `downloads` |
| `MC_MUSIC_DOWNLOAD_PATH_TEMPLATE` | 下载完成后的路径布局模板（默认 `{albumArtist}/{album}/{title} - {albumArtist}.{ext}`）；可用变量 `{albumArtist} {album} {artist} {title} {year} {trackNo} {ext}`。模板不含目录部分即为平铺（如 `{title}.{ext}`），详见[下载与目录布局](./download) |

> 容器内的下载路径由镜像 ENV 固化为 `MC_MUSIC_DOWNLOAD_DIR=/downloads`（即上表宿主机目录的容器挂载点，同一目录的两层表述），`.env` 无需配置。server **不向宿主机发布任何端口**（仅容器网络内可达，web 的 `/api` 反代是唯一入口）；临时调试用 `docker compose exec server wget -qO- http://127.0.0.1:17017/api/healthcheck` 或临时加回 `ports`。

> 注意：`.env` 以明文保存密码（飞牛音乐库账号），请仅在内网可信环境使用；密码避免包含 `"` 或 `\`（破坏 JSON 转义）。
>
> ⚠️ **已知安全取舍**：后端 API 无认证（2026-09-25 起，任何能访问 `/api` 的客户端都可搜索与发起下载）。fnOS 凭据（2026-09-26 起）由 server 代持、不再经 `config.json` 下发浏览器，但部署本身仍**请勿暴露到公网**；详见[部署指南 · 安全边界](./deployment.md#安全边界务必阅读)。

## 运行时配置 config.json

应用启动时始终 `fetch` 运行时配置 `config.json`，不同场景来源不同：

- **开发 / 本地预览**：Vite 中间件从 `.env`（或真实环境变量）虚拟生成，无需任何文件
- **静态部署**：`npm run build` 时若配置了后端地址或 fnOS 接入任一 `MC_*` 变量，会生成 `dist/config.json`；也可手动创建或修改该文件（运行时读取，改完刷新即生效，无需重新构建）
- **Docker**：容器启动时由入口脚本 `docker/generate-config.sh` 从环境变量生成

`config.json` 中的 `baseUrl` 恒为空串（同源访问）。个别需要浏览器直连后端的设备，可在应用「设置」面板按设备覆盖后端地址，仅存于该设备浏览器。

## 跨域（CORS）

- **开发**：浏览器同源访问自身 `/api`，由 Vite 代理转发到 `MC_API_BASE_URL`，不存在 CORS 问题。
- **生产**：推荐直接用 [Docker 镜像](./deployment.md)（容器内 nginx 反代 `/api`，天然同源）；自行静态部署 `dist/` 时，需在同源服务上把 `/api` 反代到后端（自建 nginx 的 `proxy_pass` 或同级反代），并保证 `config.json` 的 `baseUrl` 保持为空。
- **飞牛音乐库**：同理走同源 `/fnos` 反代（fnOS 媒体接口强制 Cookie 鉴权，跨域直连不可行）。dev 由 Vite 代理、Docker 由 nginx 按需生成 `location /fnos/`（配置了 `MC_FNOS_BASE_URL` 才生成）；自行静态部署需自行添加同等反代。
