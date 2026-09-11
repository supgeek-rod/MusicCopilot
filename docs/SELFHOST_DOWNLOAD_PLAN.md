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
| 下载完成刮削 | 复用第 4 期 `scraper/` 写入能力（taglib-wasm，dry-run/备份先例）；**M4 定稿（2026-09-12）**：server 下载成功后 fire-and-forget HTTP 推送**真值元数据**到 scraper `POST /mc/api/downloads`（只带音乐目录根下文件名 + 歌名/歌手/专辑/封面地址/kw 歌曲id，scraper 按自身 MC_MUSIC_DIR 定位文件）——不走模糊匹配，标题/歌手/专辑按覆盖写入；通知失败仅记日志不回滚任务（体检页兜底）；部署期 server 与 scraper 容器经 compose 网络直连（`MC_SCRAPER_URL`） |
| 音质 | 酷我 brType 枚举（128kmp3…2000kflac）与对外别名双向映射（§10 建议 3）；`getDownloadUrl` 需完整歌曲对象 + `brTypes`，否则解析码率失败 |
| 部署 | Docker；容器需大陆出口环境（酷我直链海外返回 `code:407`，§10 建议 6），目标 fnOS-Just4fun；nginx `/api/*` 反代目标由 SQMusic 切到 server（架构决策 #9 前缀稳定思路） |
| 前端切换 | `src/api/*` 调用面已收敛（`http.ts` 统一信封解包/token 头/403 重登），切换仅改 `.env`；token 头名前端已动态化（`stores/app.ts` tokenName，默认 `sqmusic`） |

## 3. 对齐范围：SQMusic 契约端点全表（前端调用面）

来源 `src/api/auth.ts` / `src/api/music.ts` / `src/api/task.ts`；行为契约权威来源为 `docs/api-test-report.md`（内网实测记录，站点排除文档）。

| 分组 | 端点 | server/ 现状 |
| --- | --- | --- |
| config（鉴权/配置） | `POST /api/config/login`（username / password / device:"web"） | ✅ |
| | `POST /api/config/logout`、`GET /api/config/isLogin` | ✅ |
| | `GET /api/config/getOption`（插件清单）、`GET /api/config/getPlugBrTypeList`（音质清单） | ✅ |
| music（搜索） | `GET /api/music/searchSong` / `searchArtist` / `searchAlbum` | ✅（kw 插件） |
| | `GET /api/music/searchTips`（联想词） | ✅ |
| music（歌词） | `POST /api/music/getLyric` | ✅ |
| music（详情/直链） | `GET /api/music/artistAlbumById`（歌手详情 + 全部专辑）、`GET /api/music/albumInfoById`（专辑详情 + 曲目） | ✅ |
| | `POST /api/music/getDownloadUrl`（plugName / id / brType / brTypes） | ✅ |
| download | `POST /api/download/downloadSong`（完整歌曲记录 + 可选 brType，省略自动选最高音质） | ✅ |
| | `POST /api/download/downloadAlbum`（专辑记录 + 可选 bit 整数码率）、`POST /api/download/downloadArtistAlbum`（歌手记录 + 可选 bit） | ✅ |
| task | `POST /api/task/list`（分页 + 状态筛选）、`POST /api/task/del`、`POST /api/task/refreshTask`（重新入队）、`POST /api/task/errorTaskRetry` | ✅ |
| | `GET /api/task/againTask`（全部错误重试）、`GET /api/task/delErrorTask`、`GET /api/task/delWaitingTask`、`GET /api/task/delSuccessTask`（⚠️ SQMusic 语义 = 清空全部成功记录） | ✅ |

## 4. 里程碑与任务清单

### M0 文档先行 ✅（2026-09-11）

| 任务 | 状态 |
| --- | --- |
| worktree `../MusicCopilot-selfhost-download` 建立（分支 `feature/selfhost-download`，基于 development@5e5317b；根与 server 的 `.env` 已复制，npm / composer 依赖就绪） | ✅ |
| `docs/roadmap.md`：第 5 期标 🚧 + 技术栈表述修订（Node.js → PHP / Laravel 13，对齐架构决策 #7） | ✅ |
| 本看板建立 | ✅ |

### M1 鉴权与 config 端点 ✅（2026-09-11）

| 任务 | 状态 |
| --- | --- |
| `POST /api/config/login`：`device:"web"` 校验、token 发放，sa-token 风格 `LoginInfo`（tokenName/tokenValue/isLogin/loginId/loginDevice） | ✅ |
| `GET|POST /api/config/isLogin`（恒 200，登录态在 `data` 布尔值上，不复制 SQMusic 无 token 也返回 true 的瑕疵）、`POST /api/config/logout`（撤销 token） | ✅ |
| `GET /api/config/getOption`（注册插件清单）、`GET /api/config/getPlugBrTypeList`（kw 五档音质枚举，id 与搜索 brTypes 同源） | ✅ |
| `sqmusic` 请求头鉴权中间件：缺失/无效/过期一律 HTTP 403 + `{code:403}`（前端 `http.ts` 403 自动重登重试契约）；`SourcePlugin` 接口扩展 `label()`/`brTypeList()` | ✅ |
| token：随机 64 位 hex、`auth_tokens` 表只存 sha256 摘要、7 天有效期、多设备并存、过期顺手清理 | ✅ |
| 契约固化（`scramble:export --path=openapi.json`，9 端点 → `packages/api-contract` 重生成） | ✅ |
| `php artisan test`：18 tests / 80 assertions 全绿（新增 ConfigAuthTest 10 例，GetLyricTest 适配鉴权 + 403 用例） | ✅ |
| 真机验证：登录/错密码/device 缺失/isLogin/getOption/brType/受保护路由 403/真实酷我搜索（晴天 228908）/logout 撤销 全部符合预期 | ✅ |
| 配套：scraper server 客户端 403 自动登录重试（`MC_SERVER_USERNAME/PASSWORD`），tsx 冒烟通过 | ✅ |

### M2 联想词 / 详情 / 直链解析 ✅（2026-09-12）

| 任务 | 状态 |
| --- | --- |
| `SourcePlugin` 接口扩展：searchTips / artistAlbum / albumInfo / downloadUrl（songInfo / artistSongs 无前端消费点，待需要时再补，见风险节） | ✅ |
| `GET /api/music/searchTips`（openapi searchKey，RELWORD 提取，空项过滤） | ✅ |
| `GET /api/music/artistAlbumById`（r.s artistinfo + albumlist 两次请求聚合；封面统一取 /500 大图） | ✅ |
| `GET /api/music/albumInfoById`（r.s albuminfo；musiclist 小写键映射，`MUSIC_` 前缀与大写键兜底，duration 秒） | ✅ |
| `POST /api/music/getDownloadUrl`（mobi `convert_url_with_sign`；KW_* ↔ 酷我 br 双向映射，407 映射为大陆 IP 限制提示） | ✅ |
| 契约固化（openapi.json 13 端点 → `packages/api-contract` 重生成） | ✅ |
| `php artisan test`：30 tests / 166 assertions 全绿（新增 4 个端点测试文件共 12 例，字段样例取自真实响应） | ✅ |
| 真机验证：联想词（晴天 10 条）、歌手详情（336：45 专辑 / 别名 / 头像 / 12KB 简介）、专辑详情（1293：11 曲目全对）、直链 320k 与 FLAC 均返回真实签名 URL（duration/format 正确） | ✅ |

实现备注（2026-09-12）：

- albumlist 每条专辑自带大段 `info` 简介，响应可达数百 KB；WSL2 NAT 链路 10s 传不完导致超时，`KUWO_TIMEOUT` 默认提到 30s（参考实现的 rn=10000 口径收敛为 500，远超现实专辑数）
- 直链 CDN（kw-er.kuwo.cn）实测不限区域：320k mp3（M800 前缀）与 2000k FLAC（F000 前缀）均解析成功且可下载

### M3 下载队列与任务管理 ✅（2026-09-12）

| 任务 | 状态 |
| --- | --- |
| 迁移：`download_tasks` 表（plugName / 歌曲与专辑 / brType / brTypes / 上游原始条目 JSON / 状态 / 进度 / 落盘路径 / 错误信息 / 下载与更新时间）+ Model + 契约映射 `toContract()` | ✅ |
| `POST /api/download/downloadSong`（完整歌曲记录，brType 省略 worker 自动选最高可用音质） | ✅ |
| `POST /api/download/downloadAlbum`（bit 整数码率 → KW_* 反查；同步展开曲目，返回任务数组供前端计数） | ✅ |
| `POST /api/download/downloadArtistAlbum`（专辑多、每张一次上游请求 → `ExpandArtistAlbumJob` 队列异步展开，任务渐进出现） | ✅ |
| `DownloadSongJob`：waiting→loading→downloading→success/error；直链即用即取、Guzzle sink 流式落盘（`.part` → 改名）、「歌手 - 标题」命名（非法字符清洗 + 重名序号）、任务中途被删则丢弃文件；失败不自动重试（error 由用户重试，对齐 SQMusic） | ✅ |
| `/api/task/*` 8 端点（list 分页状态筛选 / del / refreshTask / errorTaskRetry / againTask / delErrorTask / delSuccessTask⚠️ / delWaitingTask） | ✅ |
| Dockerfile（php:8.4-cli-alpine 多阶段 vendor 分层）+ entrypoint（migrate + APP_KEY 自动生成）+ compose `server`/`server-worker` 服务（`profiles: [server]`、server-data 卷） | ✅（docker build 随 CI 验证，同 scraper M5 先例） |
| 契约固化（openapi.json 24 端点 → `packages/api-contract` 重生成） | ✅ |
| `php artisan test`：47 tests / 291 assertions 全绿（新增 17 例：任务创建/展开/状态机/文件名清洗与碰撞/删除丢弃/任务管理 8 端点） | ✅ |
| 端到端真机：queue:work 真实下载晴天 128k → `周杰伦 - 晴天.mp3` 4,317,292 字节（ID3 头、与调研口径一致）、状态 waiting→downloading→success、del/delSuccessTask/list 全通 | ✅ |

实现备注（2026-09-12）：

- `downloadMusicInfo` 按契约存**上游原始条目 JSON**（顶层 MINFO/N_MINFO），前端 `taskSizeBytes` 据此按入队音质估算大小
- 前端 `downloadAlbum` 响应为数组时取长度做计数提示——故整张专辑同步展开返回任务数组；歌手全部专辑异步展开（HTTP 立即返回）
- 状态机五枚举与前端筛选器一致：waiting / downloading / loading（解析中）/ success / error
- 测试坑记录：Laravel `Http::response()` stub 的响应体流被首次请求耗尽，同一 stub 多次请求（sink 落盘）须用闭包 fake 或 `Http::sequence()->push()`——见 DownloadFlowTest

### M4 下载完成自动刮削写标签 ✅（2026-09-12）

| 任务 | 状态 |
| --- | --- |
| server↔scraper 边界定稿：HTTP 推送真值元数据（见已确认决策表），不采用任务轮询与 sidecar 文件 | ✅ |
| scraper 新增 `POST /mc/api/downloads` + `download-tag` job（可多个排队串行）：真值覆盖写标题/歌手/专辑/专辑歌手 + 按配置嵌入封面与歌词（拉取失败降级跳过），复用 `applyPlan`（备份/原子替换/安全守卫全套） | ✅ |
| 路径防护：仅接受音乐目录根下文件名（拒绝路径穿越），server 侧只传 basename（容器路径差异由卷映射吸收） | ✅ |
| server：`download_tasks` 加 `pic` 列；worker 落盘成功后推送通知（`MC_SCRAPER_URL` / `MC_SCRAPER_TOKEN`，10s 超时，失败仅记日志） | ✅ |
| server 测试：50/50 全绿（新增通知 3 例：真值载荷与 token 头 / 通知失败任务仍 success / 未配置不发请求）；scraper tsc 构建通过 | ✅ |
| 端到端三进程联调（server + worker + scraper 共享落盘目录）：晴天 128k 下载 4.3MB → 通知 → scraper 写入 albumArtist + 封面 106KB + 歌词 8716 字符（与 getLyric 实测长度一致），title/artist/album 与上游标签一致被正确跳过；`.mc-backup/` 备份生成 | ✅ |

### M5 前端切换与 SQMusic 下线 ✅（2026-09-12）

| 任务 | 状态 |
| --- | --- |
| 本地全链路回归（dev 代理切自建后端 127.0.0.1:8097，浏览器实测）：自动登录 / 搜索 3587 首（音源选项 + 音质徽章）/ 播放取流（CDN 流式进度走动）/ 服务端下载（自动最高音质 + 大小估算展示）/ 任务页状态与下载中流转 | ✅ |
| 部署编排：compose server/scraper profile 完整化（音乐库目录 bind 挂载 `MC_MUSIC_HOST_DIR`、scraper CI 镜像回归、scraper 通知走 compose 网络） | ✅ |
| fnOS-Just4fun 部署：web 重建 + server/worker/scraper 四容器上线 + `/api` 反代切自建后端（`http://server:8097`） | ✅ |
| fnOS-Just4fun 全链路验证：12312 登录/搜索 3587 首/任务列表（SQMusic 历史清零）→ 下载晴天 128k 约 25 秒落库音乐目录 → scraper 自动刮削（albumArtist + 封面 + 歌词 written，errorCount 0）→ 文件 4,436,339 字节（含标签体积） | ✅ |
| SQMusic 退役：`sqmusic_web/main/mysql` 三容器已停（数据与卷保留，`docker start` 可逆） | ✅ |
| `/v2` 清理版契约规划（见下） | ✅ |

**部署踩坑记录（fnOS-Just4fun，均已在仓库修复）**：

- NAS 构建需 composer 走阿里镜像 + `--no-scripts`（vendor 阶段无 artisan，post-autoload-dump 必失败）
- `.dockerignore` 必须排除 `bootstrap/cache/*.php`：本地 dev 的包发现清单含 pail 等 dev 依赖 provider，`--no-dev` 镜像启动即崩
- NAS `.env` 的 `MC_PORT`（web 对外端口）会经 `env_file` 污染 scraper 监听端口 → compose 显式 `MC_PORT: 8098`
- web 的 `/mc` 反代改 Docker DNS 运行时解析：scraper 容器缺失/重启时 web 降级 502 而非 nginx emerg 拒绝启动
- 开发联调（非容器）注意：WSL→Windows 环回/NAT 网关被防火墙拦截，走宿主 LAN IP
- **版本检测生效流程**：Docker 构建上下文无 .git，需本机 `node scripts/gen-build-info.mjs` 预生成 `src/build-info.json` 并单独 rsync 到 NAS（deploy 的 rsync filter 会排除但不会删除它）；gen-build-info 已改为非 git 环境保留已有生成物（b2191ee 起生效）
- 并行分支合并：`fix/remove-source-dropdown` 的 11 项前端修复（含版本检测）已并入本分支一并部署（8e35c6b）

**`/v2` 清理版契约规划**（SQMusic 退役后作为独立小迭代，不阻塞本期）：

1. **信封与状态码**：弃 `{code,msg,data}`（code=200 成功）→ 标准 HTTP 状态码 + 裸 JSON，错误体 `{error, message}`
2. **类型规范化**：消除字符串数字（duration 毫秒字符串→int、total/total 专辑数→int）与冗余字段（downloadGid / downloadBits / springName / audioBook / rewriteMp3tag / 双写 albumid/albumId）
3. **端点收敛（REST 化）**：`/api/v2/auth/*`、`/api/v2/search/{songs,artists,albums,tips}`、`/api/v2/{songs,albums,artists}/{id}`、`/api/v2/songs/{id}/download-url`、`POST /api/v2/downloads` + `GET|DELETE /api/v2/downloads/{id}`、`POST /api/v2/downloads/{id}/retry`；插件层（SourcePlugin/KuwoPlugin）不动，仅外壳清理
4. **落地方式**：契约先进 `packages/api-contract`（openapi-typescript），前端 `src/api/*` 基于生成类型机械化重写；scraper 的 server 客户端同步迁移

## 5. 风险与备选

- **酷我解析接口变动频繁** → 解析收敛在插件内，单个音源失效不影响整体（路线图风险提示）；接口家族现状见 kuwo-api-notes §8 失效端点记录
- **接口能力与前端消费对齐**：`songInfo` / `artistSongs`（§10 九方法之列）暂无前端调用点，未实现；待 M3 下载链路或后续功能需要时按需补充，避免死代码
- **直链解析大陆 IP 区域限制**（海外 407；搜索/详情/歌词海外可用）→ 部署目标为内网 NAS；开发机测试统一 `--noproxy '*'`（kuwo-api-notes §9）
- **`delSuccessTask` 会清空服务器全部成功下载记录**（根 AGENTS.md 明示禁止随意调用）→ 契约保留以对齐前端，实现与使用从谨慎
- **歌词接口按 IP 分钟级限流** → 结果永久缓存 + 长退避重试（KuwoPlugin 已有实现先例）
- **worker 稳定性** → `queue:work` 崩溃自动重启（Docker restart 策略 / supervisor）；任务失败可重试
- **前端切换回归面大**（下载与播放取流都依赖 getDownloadUrl）→ 按 `docs/api-test-report.md` 逐端点对照实测后再切换

## 6. 进度日志

- 2026-09-11：第 5 期启动。worktree 建立（env 复制、npm/composer 依赖安装）；看板建立；roadmap 第 5 期标 🚧 并修订技术栈表述（M0 完成）
- 2026-09-11：M1 完成（鉴权五端点 + `sqmusic` 中间件 + token 落库；契约 9 端点固化；18 tests 全绿；真机与 scraper 冒烟通过）。注意：根 package.json 未声明 workspaces，契约生成须在 `packages/api-contract` 内 `npm run gen`
- 2026-09-12：M2 完成（联想词/歌手详情/专辑详情/直链四端点；契约 13 端点；30 tests 全绿；真机全链路含真实直链解析通过）。发现并处理：albumlist 大响应在 WSL2 链路超时（KUWO_TIMEOUT→30s、rn 收敛 500）
- 2026-09-12：M3 完成（download 3 端点 + task 8 端点 + SQLite 队列 worker；契约 24 端点；47 tests 全绿；端到端真机下载晴天 128k 落盘 4.3MB 成功）。至此前端契约 20/20 端点全部落地，SQMusic 契约面补齐
- 2026-09-12：M4 完成（server 推送真值元数据 → scraper `POST /downloads` 真值写标签；50 tests 全绿；三进程端到端联调通过——封面 106KB、歌词 8716 字符成功嵌入）。环境坑记录：WSL→Windows 环回/NAT 网关均不可达（防火墙），开发联调走宿主 LAN IP；容器部署无此问题
- 2026-09-12：M5 完成，**第 5 期收官，SQMusic 退役**。本地浏览器全链路回归通过；fnOS-Just4fun 四容器上线（web 12312 + server/worker + scraper），12312 经 nginx 反代自建后端，下载→自动刮削→音乐库入库闭环验证通过（晴天 128k 约 25 秒落库并嵌入封面歌词）；sqmusic 三容器停止（数据保留）。部署踩坑五条已回填仓库（见 M5 节）
