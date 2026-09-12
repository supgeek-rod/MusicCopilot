# MusicCopilot Scraper（元数据刮削工具）

独立 Docker 工具：直接读写 NAS 音乐文件卷，扫描音乐目录、在线匹配元数据（标签/封面/歌词）并写回文件，是 Web 端「音乐库体检」后台的服务端。规划与进度见 [docs/META_SCRAPER_PLAN.md](../docs/META_SCRAPER_PLAN.md)。

## 架构

- **Node.js 24 + Fastify + node:sqlite**（零原生依赖，单镜像多架构）；读标签 `music-metadata`，写标签 `taglib-wasm`（TagLib v2 的 WASM 封装，覆盖 mp3/flac/m4a/ogg/opus/wav/ape 等）
- 接口挂 `/mc/api/*`（同源反代前缀，见 `docs/architecture.md` 决策 #9），标准 HTTP 状态码 + JSON
- 在线匹配**不自带音源解析**：调音源后端（SQMusic 对齐契约）的 `GET /api/music/searchSong` 与 `POST /api/music/getLyric`，由 `MC_SERVER_URL` 指定（默认同 MC_API_BASE_URL）
- 可选共享 token：工具侧 `MC_SCRAPER_TOKEN` 非空时校验请求头 `x-mc-token`

## 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `MC_MUSIC_DIR` | `/music`（容器）/ `music`（本地 dev） | 音乐目录（读写；备份写入 `<dir>/.mc-backup/`） |
| `MC_DATA_DIR` | `/data`（容器）/ `data`（本地 dev） | SQLite 目录（曲目索引/任务历史/配置/忽略清单） |
| `MC_SERVER_URL` | `http://127.0.0.1:8097` | 音源后端基址（searchSong/getLyric） |
| `MC_SERVER_USERNAME` / `MC_SERVER_PASSWORD` | 空 | 音源后端登录凭证（server M1 起接口要求 `sqmusic` 头；非空时 403 自动登录重试，留空兼容未鉴权后端） |
| `MC_LASTFM_API_KEY` | 空 | Last.fm API key（流派补全优先源，免费申请）；留空仅用 Deezer。两源大陆直连均不可达，不可达时静默跳过 |
| `MC_SCRAPER_TOKEN` | 空 | 非空时启用 `x-mc-token` 鉴权 |
| `MC_PORT` | `8098` | 监听端口 |

## 本地开发

```bash
cd scraper
npm install
# 造样例（或指向真实目录）：MC_MUSIC_DIR=./dev-music
MC_MUSIC_DIR=./dev-music MC_DATA_DIR=./data MC_SERVER_URL=http://127.0.0.1:8097 npm run dev
curl -s localhost:8098/mc/api/status
```

Web 后台联调：仓库根 `.env` 设 `MC_SCRAPER_BASE_URL=http://127.0.0.1:8098`，`npm run dev` 后访问 `#/library/health`。

## 部署（与 web 容器编排）

```bash
# .env
MC_MUSIC_DIR=/vol1/@team/DockerSpace/simple-sq-music-plus/music   # fnOS 音乐库目录（读写）
MC_SCRAPER_BASE_URL=http://scraper:8098
docker compose --profile scraper up -d
```

安全设计：体检流程永远先 dry-run 预览、写入需显式确认、写前备份默认开（`.mc-backup/`，fnOS 扫描忽略点开头目录）、重命名默认关且冲突跳过、低置信候选（< 0.8）不自动写入。

## 下载完成自动刮削（M4，server 推送）

server/ 的下载 worker 落盘成功后 fire-and-forget 推送真值元数据到本工具
`POST /mc/api/downloads`（`fileName` 为音乐目录根下文件名 + 歌名/歌手/专辑/封面地址/kw 歌曲 id）。
本工具排队（`download-tag` job，可多个串行）后**覆盖写**标题/歌手/专辑/专辑歌手（下载元数据是事实而非猜测，
区别于体检页 fill-missing 模糊匹配）、按配置嵌入封面与歌词（拉取失败跳过不阻断）、备份沿用 `.mc-backup/`。
server 侧经 `MC_SCRAPER_URL` / `MC_SCRAPER_TOKEN` 配置（空 = 关闭，标签可经体检页手动补）。

## API 一览

`GET /status` · `POST /scan` · `GET /tracks?filter=&search=&page=` · `POST /match {trackIds}` · `POST /write {trackIds,dryRun,selections}` · `POST /downloads {fileName,name,artist,album,coverUrl,musicId}` · `GET /jobs[/:id]` · `GET|PUT /config` · `GET|POST|DELETE /ignore`
