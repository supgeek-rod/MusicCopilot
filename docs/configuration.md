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
| `MC_API_BASE_URL` | 后端服务地址：dev/preview 的 Vite 代理与 Docker nginx 的反代目标（勿把局域网 IP 写进源码）。**compose 部署可省略**——缺省即 `http://server:8097`（server 容器）；本地 `npm run dev` 必填，填 `http://127.0.0.1:8097`。自建后端的凭证变量（`MC_AUTH_*`）与下载相关变量见[部署指南](./deployment.md) |
| `MC_API_USERNAME` / `MC_API_PASSWORD` | 自动登录账号（token 失效也会用它静默重登；留空则不自动登录，可在应用设置面板按设备配置连接） |
| `MC_AUTO_LOGIN` | 是否自动登录（`true` / `false`，默认 `true`） |
| `MC_ALLOWED_HOSTS` | 域名/反向代理访问 dev、preview 时放行的 Host（逗号分隔；Vite 默认仅放行 localhost） |
| `MC_FNOS_BASE_URL` | 飞牛（fnOS）网关地址（如 `http://192.168.31.31:5666`）：Vite 代理与 Docker nginx 把 `/fnos` 反代到该地址；**不配置则「音乐库」入口不显示** |
| `MC_FNOS_USERNAME` / `MC_FNOS_PASSWORD` | 飞牛音乐登录账号（token 失效也会用它静默重登；密码经 SHA-256 后提交） |
| `MC_FNOS_AUTO_LOGIN` | 是否自动登录飞牛音乐（`true` / `false`，默认 `true`） |
| `MC_PORT` | 端口：docker-compose.yml 的对外端口，同时是本地 `npm run dev` / `npm run preview` 的服务器端口（默认 `17016`；本地未配置或非法值回退 `5173`，端口被占用自动 +1） |
| `MC_IMAGE_TAG` | 仓库自带 compose 拉取的镜像 tag（仅 docker-compose.yml 读取，默认 `latest`）。跟 `development` 分支预构建镜像时设为 `development`；本地构建用 `docker compose up -d --build` |
| `MC_MUSIC_HOST_DIR` | 自建后端下载落盘的音乐库目录（宿主机绝对路径，即 fnOS「音乐」应用扫描的目录）。未配置时落到项目目录 `data/downloads` |
| `MC_SERVER_PORT` | 自建后端的宿主映射端口（默认 `17017`，仅绑定 `127.0.0.1`——供本机直连 API / 查看 OpenAPI 文档调试用，不对局域网开放）。前端始终走 web 的 `/api` 反代，一般无需配置 |
| `MC_AUTH_USERNAME` / `MC_AUTH_PASSWORD` | 自建后端登录凭证（默认 `admin`/`admin`；SQMusic 对齐契约，鉴权请求头为 `sqmusic`） |
| `MC_DIR_TEMPLATE` | 下载完成后的目录布局模板（默认 `{albumArtist}/{album}/{title} - {albumArtist}.{ext}`，空串=平铺）；可用变量 `{albumArtist} {album} {artist} {title} {year} {trackNo} {ext}`，详见[下载与目录布局](./download) |

> `MC_DOWNLOAD_DIR`（容器内下载目录）由 docker-compose.yml 固定为 `/downloads` 并指向挂载的音乐库目录，`.env` 无需配置。

> 注意：`.env` 以明文保存密码，请仅在内网可信环境使用；密码避免包含 `"` 或 `\`（会破坏生成的 config.json / JSON 转义）。「登录框 + 记住 token」模式规划在[路线图](./roadmap.md)第 2 期。
>
> ⚠️ **已知安全取舍**：自动登录（autoLogin / 403 静默重登）要求浏览器持有账号密码，因此 `MC_API_USERNAME` / `MC_API_PASSWORD` 会随 `config.json` 下发给**任何能打开页面的访问者**（DevTools 的网络与存储面板可直接读到）。请勿将部署暴露到公网；如需收敛，可留空凭据（关闭自动登录），改为在各设备的设置面板单独配置连接。

## 运行时配置 config.json

应用启动时始终 `fetch` 运行时配置 `config.json`，不同场景来源不同：

- **开发 / 本地预览**：Vite 中间件从 `.env`（或真实环境变量）虚拟生成，无需任何文件
- **静态部署**：`npm run build` 时若配置了任一 `MC_*` 变量，会生成 `dist/config.json`；也可手动创建或修改该文件（运行时读取，改完刷新即生效，无需重新构建）
- **Docker**：容器启动时由入口脚本 `docker/generate-config.sh` 从环境变量生成

`config.json` 中的 `baseUrl` 恒为空串（同源访问）。个别需要浏览器直连后端的设备，可在应用「设置」面板按设备覆盖后端地址，仅存于该设备浏览器。

## 跨域（CORS）

- **开发**：浏览器同源访问自身 `/api`，由 Vite 代理转发到 `MC_API_BASE_URL`，不存在 CORS 问题。
- **生产**：推荐直接用 [Docker 镜像](./deployment.md)（容器内 nginx 反代 `/api`，天然同源）；自行静态部署 `dist/` 时，需在同源服务上把 `/api` 反代到后端（自建 nginx 的 `proxy_pass` 或同级反代），并保证 `config.json` 的 `baseUrl` 保持为空。
- **飞牛音乐库**：同理走同源 `/fnos` 反代（fnOS 媒体接口强制 Cookie 鉴权，跨域直连不可行）。dev 由 Vite 代理、Docker 由 nginx 按需生成 `location /fnos/`（配置了 `MC_FNOS_BASE_URL` 才生成）；自行静态部署需自行添加同等反代。
