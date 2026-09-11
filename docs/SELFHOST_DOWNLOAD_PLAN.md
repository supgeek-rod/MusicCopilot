# 自建下载服务（替换 SQMusic）· 功能规划与进度

> 状态图例：⬜ 未开始 ｜ 🚧 进行中 ｜ ✅ 已完成 ｜ ❌ 搁置（不在本期）
>
> 工作分支 `feature/selfhost-download`（worktree `../MusicCopilot-selfhost-download`）；本文档为该功能的**唯一进度看板**，每完成一个里程碑更新对应状态并提交。对应路线图[第 5 期](./roadmap.md)，架构依据见[架构设计](./architecture.md)（决策 #2 / #7 / #9 与第 5 期落地清单）。

## 1. 背景与目标

前端 MusicCopilot 的搜索、详情、试听取流、下载与任务管理全部依赖第三方后端 Simple SQ Music Plus（`simple_sq_music_plus`）。自建后端 `server/`（PHP / Laravel 13，原独立仓库 subtree 并入）已提前落地搜索三端点与歌词端点。本期补齐剩余能力——**鉴权、搜索联想词、歌手/专辑详情、下载直链解析、下载队列与任务管理、下载完成自动刮削写标签**——使前端仅改 `.env` 的 `MC_API_BASE_URL` 即可零改动切换，随后 SQMusic 退役（退役后按契约策略以 `/v2` 出清理版）。

## 2. 已确认决策（2026-09-11）

| 决策点 | 结论 |
| --- | --- |
| 技术栈 | `server/` = PHP / Laravel 13 + SQLite（架构决策 #7；Fastify+Node 方案作废，`scraper/` 除外——决策 #10） |
| 契约策略 | 过渡期严格对齐 SQMusic：`{code,msg,data}` 信封（code=200 成功）、`sqmusic` 请求头、登录 `device:"web"`、`pageIndex/pageSize` 分页；契约固化 `server/openapi.json` → `packages/api-contract` 重生成；SQMusic 退役后以 `/v2` 出清理版（见 `packages/api-contract/README.md`） |
| 音源插件 | `SourcePlugin` 接口扩展为完整九方法：searchSong / searchArtist / searchAlbum / albumInfo / artistAlbum / artistSongs / songInfo / lyric / downloadUrl（`server/docs/kuwo-api-notes.md` §10 建议 1），`plugName=kw` 路由到 KuwoPlugin，为 netease/mg 留扩展点 |
| 下载队列 | database queue（SQLite）+ `queue:work`，Docker 内独立 worker 进程；直链有时效，即时解析即时下载、不落库，任务表只存状态/路径/音质（§10 建议 5） |
| 下载完成刮削 | 复用第 4 期 `scraper/` 写入能力（taglib-wasm，dry-run/备份先例）；server↔scraper 调用边界在 M4 定稿（架构决策 #2：文件级写操作归 scraper/ 容器，server 只做音源解析与下载） |
| 音质 | 酷我 brType 枚举（128kmp3…2000kflac）与对外别名双向映射（§10 建议 3）；`getDownloadUrl` 需完整歌曲对象 + `brTypes`，否则解析码率失败 |
| 部署 | Docker；容器需大陆出口环境（酷我直链海外返回 `code:407`，§10 建议 6），目标 fnOS-Just4fun；nginx `/api/*` 反代目标由 SQMusic 切到 server（架构决策 #9 前缀稳定思路） |
| 前端切换 | `src/api/*` 调用面已收敛（`http.ts` 统一信封解包/token 头/403 重登），切换仅改 `.env`；token 头名前端已动态化（`stores/app.ts` tokenName，默认 `sqmusic`） |

## 3. 对齐范围：SQMusic 契约端点全表（前端调用面）

来源 `src/api/auth.ts` / `src/api/music.ts` / `src/api/task.ts`；行为契约权威来源为 `docs/api-test-report.md`（内网实测记录，站点排除文档）。

| 分组 | 端点 | server/ 现状 |
| --- | --- | --- |
| config（鉴权/配置） | `POST /api/config/login`（username / password / device:"web"） | ⬜ |
| | `POST /api/config/logout`、`GET /api/config/isLogin` | ⬜ |
| | `GET /api/config/getOption`（插件清单）、`GET /api/config/getPlugBrTypeList`（音质清单） | ⬜ |
| music（搜索） | `GET /api/music/searchSong` / `searchArtist` / `searchAlbum` | ✅（kw 插件） |
| | `GET /api/music/searchTips`（联想词） | ⬜ |
| music（歌词） | `POST /api/music/getLyric` | ✅ |
| music（详情/直链） | `GET /api/music/artistAlbumById`（歌手详情 + 全部专辑）、`GET /api/music/albumInfoById`（专辑详情 + 曲目） | ⬜ |
| | `POST /api/music/getDownloadUrl`（plugName / id / brType / brTypes） | ⬜ |
| download | `POST /api/download/downloadSong`（完整歌曲记录 + 可选 brType，省略自动选最高音质） | ⬜ |
| | `POST /api/download/downloadAlbum`（专辑记录 + 可选 bit 整数码率）、`POST /api/download/downloadArtistAlbum`（歌手记录 + 可选 bit） | ⬜ |
| task | `POST /api/task/list`（分页 + 状态筛选）、`POST /api/task/del`、`POST /api/task/refreshTask`（重新入队）、`POST /api/task/errorTaskRetry` | ⬜ |
| | `GET /api/task/againTask`（全部错误重试）、`GET /api/task/delErrorTask`、`GET /api/task/delWaitingTask`、`GET /api/task/delSuccessTask`（⚠️ SQMusic 语义 = 清空全部成功记录） | ⬜ |

## 4. 里程碑与任务清单

### M0 文档先行 ✅（2026-09-11）

| 任务 | 状态 |
| --- | --- |
| worktree `../MusicCopilot-selfhost-download` 建立（分支 `feature/selfhost-download`，基于 development@5e5317b；根与 server 的 `.env` 已复制，npm / composer 依赖就绪） | ✅ |
| `docs/roadmap.md`：第 5 期标 🚧 + 技术栈表述修订（Node.js → PHP / Laravel 13，对齐架构决策 #7） | ✅ |
| 本看板建立 | ✅ |

### M1 鉴权与 config 端点 ⬜

| 任务 | 状态 |
| --- | --- |
| `POST /api/config/login`：`device:"web"` 校验、token 发放，返回 `LoginInfo` 形状（以 api-test-report.md 实测口径为准） | ⬜ |
| `GET /api/config/isLogin`、`POST /api/config/logout` | ⬜ |
| `GET /api/config/getOption`（插件启停清单）、`GET /api/config/getPlugBrTypeList`（kw 可用音质清单，brType 映射见 kuwo-api-notes §1） | ⬜ |
| `sqmusic` 请求头鉴权中间件（401/403 语义与前端 `http.ts` 自动重登对齐） | ⬜ |
| 契约固化（openapi.json + `npm run gen -w packages/api-contract`）+ `php artisan test` + 真机 curl | ⬜ |

### M2 联想词 / 详情 / 直链解析 ⬜

| 任务 | 状态 |
| --- | --- |
| `SourcePlugin` 接口扩展为九方法 + `KwBrType` 枚举双向映射（§10 建议 1/3） | ⬜ |
| `GET /api/music/searchTips`（酷我联想词） | ⬜ |
| `GET /api/music/artistAlbumById`、`GET /api/music/albumInfoById`（`scripts/kw-album.sh` / `kw-artist.sh` 现成口径） | ⬜ |
| `POST /api/music/getDownloadUrl`（mobi `convert_url_with_sign`；大陆 IP 区域限制记录在案） | ⬜ |
| 契约固化 + 测试 + 真机验证（大陆出口，本机 curl 一律 `--noproxy '*'`） | ⬜ |

### M3 下载队列与任务管理 ⬜

| 任务 | 状态 |
| --- | --- |
| 迁移：`tasks` 表（plugName / 歌曲记录 / brType / 状态 / 进度 / 落盘路径 / 错误信息 / 时间戳）+ Model | ⬜ |
| `POST /api/download/downloadSong|downloadAlbum|downloadArtistAlbum`：建任务入队；整张 / 歌手全部专辑展开为单曲任务 | ⬜ |
| `queue:work` worker：即时直链解析 → 下载 → 进度与状态回写；并发控制、失败重试 | ⬜ |
| `/api/task/*` 8 端点（list 分页筛选 / del / refreshTask / errorTaskRetry / againTask / delErrorTask / delWaitingTask / delSuccessTask⚠️） | ⬜ |
| Dockerfile + worker 进程编排（§10 建议 5/6） | ⬜ |
| 契约固化 + 测试 + 端到端真机（下载一首 mp3 落盘、任务状态流转） | ⬜ |

### M4 下载完成自动刮削写标签 ⬜

| 任务 | 状态 |
| --- | --- |
| server↔scraper 边界定稿：下载完成如何触发写入（事件通知 / 任务轮询）、目标目录约定（= fnOS 音乐库目录） | ⬜ |
| 标签补全 + 内嵌封面 + 内嵌歌词（复用 `scraper/` writer 与 taglib-wasm 能力，写入安全策略沿用 dry-run/备份先例） | ⬜ |
| 端到端：下载 → 文件落库目录 → 标签完整 → fnOS「音乐」应用自动扫描入库 | ⬜ |

### M5 前端切换与 SQMusic 下线 ⬜

| 任务 | 状态 |
| --- | --- |
| `.env` 的 `MC_API_BASE_URL` 切自建后端，前端全链路回归：登录 / 搜索 / 详情 / 下载 / 任务管理 / 播放取流（`player.ts` 亦走 getDownloadUrl） | ⬜ |
| 部署 fnOS-Just4fun：镜像 + compose，nginx `/api/*` 反代目标切换 | ⬜ |
| SQMusic 退役；`/v2` 清理版契约规划（`packages/api-contract/README.md` 契约策略） | ⬜ |

## 5. 风险与备选

- **酷我解析接口变动频繁** → 解析收敛在插件内，单个音源失效不影响整体（路线图风险提示）；接口家族现状见 kuwo-api-notes §8 失效端点记录
- **直链解析大陆 IP 区域限制**（海外 407；搜索/详情/歌词海外可用）→ 部署目标为内网 NAS；开发机测试统一 `--noproxy '*'`（kuwo-api-notes §9）
- **`delSuccessTask` 会清空服务器全部成功下载记录**（根 AGENTS.md 明示禁止随意调用）→ 契约保留以对齐前端，实现与使用从谨慎
- **歌词接口按 IP 分钟级限流** → 结果永久缓存 + 长退避重试（KuwoPlugin 已有实现先例）
- **worker 稳定性** → `queue:work` 崩溃自动重启（Docker restart 策略 / supervisor）；任务失败可重试
- **前端切换回归面大**（下载与播放取流都依赖 getDownloadUrl）→ 按 `docs/api-test-report.md` 逐端点对照实测后再切换

## 6. 进度日志

- 2026-09-11：第 5 期启动。worktree 建立（env 复制、npm/composer 依赖安装）；看板建立；roadmap 第 5 期标 🚧 并修订技术栈表述（M0 完成）
