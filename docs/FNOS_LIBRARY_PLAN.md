# 飞牛（fnOS）音乐库接入 · 功能规划与进度

> 状态图例：⬜ 未开始 ｜ 🚧 进行中 ｜ ✅ 已完成 ｜ ❌ 搁置（不在本期）
>
> 工作分支 `feature/fnos-music-library`（worktree `../MusicCopilot-fnos`）；本文档为该功能的**唯一进度看板**，每完成一个里程碑更新对应状态并提交。

## 1. 背景与目标

MusicCopilot 目前只能从 SQ Music 在线源搜索下载。飞牛（fnOS）NAS 上已运行官方「音乐」应用（`http://192.168.31.31:5666/music/`），其音乐库目录与 SQ Music 下载目录相同（`/vol1/@team/DockerSpace/simple-sq-music-plus/music/`），即「下载的歌自动进曲库」已天然成立。

本期目标：把 NAS 本地曲库接入 MusicCopilot，支持**浏览、搜索、流式播放（含歌词封面）、歌单查看与播放**。这对应 README 开发路线图第 3 期的前两项能力；「歌单补全下载」及 Node 伴生服务仍按路线图推后（见 §6）。

## 2. 已确认决策

| 决策点 | 结论 |
| --- | --- |
| 架构路线 | 纯前端 + 同源代理直连 fnOS API，不建 Node 服务；代理前缀 `/fnos`（`/mc` 保留给未来伴生服务） |
| 首期范围 | 曲库浏览 + 库内搜索 + 流式播放/歌词 + 歌单查看播放 |
| 凭据存放 | `.env`（`MC_FNOS_*`），运行时经 `config.json` 注入，不进代码 |
| 文档先行 | 按 AGENTS.md 约束：先更新 `docs/architecture.md` 模块边界，再动代码 |

## 3. fnOS 音乐 API 要点（2026-09-06 实测确认）

- Base：`http://<NAS>:5666/music/api/v1`，信封 `{code, msg, data}`，**`code==0` 成功**（区别于 SQ Music 的 `code=200`）
- 登录：`POST /user/password-login`，body `{username, password: SHA-256 hex, deviceId: 32位hex}` → `data.userToken`
- **登录响应无 Set-Cookie**：token 需前端自行 `document.cookie = 'music-token=<token>; path=/'` 写入，同源请求自动携带
- 会话失效：HTTP 401 或响应 `code==401` → 静默重登一次（对齐现有 SQ 403 重登思路）
- 分页统一 `?page=&size=`，响应 `data: {list, total, sort?}`（列表默认 `sort=trackCount,desc`）
- 媒体（封面/音频流）**必须带 Cookie** → 必须走同源代理，`img`/`audio` 直接用相对路径
- `track/stream?guid=` 支持 Range（实测 206, `audio/flac`）；网盘挂载曲目可能 302 跳 CDN，浏览器自动跟随
- 不实现 `authx` 签名头（社区项目均未携带亦可调通，实测确认）

## 4. 里程碑与任务清单

### M0 真机验证 ✅（2026-09-06）

| 任务 | 状态 |
| --- | --- |
| 连通性：`GET /music/` | ✅ 200（27ms） |
| 登录：`POST /user/password-login` | ✅ `code:0`，返回 userToken（role=admin） |
| `GET /track/list` | ✅ 字段与调研一致（guid/title/album/artists/audioSpec…） |
| `GET /static/cover` | ✅ 200 image/webp |
| `GET /track/stream`（Range） | ✅ 206 audio/flac |
| `GET /lyric/list` | ✅ 返回 LRC 内容 |
| `GET /search/track` | ✅ |
| `GET /album/list` / `artist/list` / `genre/list` | ✅ |
| `GET /playlist/list` | ✅（当前为空，UI 需空态） |

### M1 配置与接入层 ✅（2026-09-06）

| 任务 | 状态 |
| --- | --- |
| 更新 `docs/architecture.md`（模块边界：/fnos 代理路径 + 前端 fnos 接入层） | ✅ |
| `.env.example` / `.env`：`MC_FNOS_BASE_URL` / `MC_FNOS_USERNAME` / `MC_FNOS_PASSWORD` | ✅ |
| `vite.config.ts`：proxy `'/fnos'`（changeOrigin + rewrite）；PWA `navigateFallbackDenylist` 加 `/fnos` | ✅ |
| `docker/nginx-default.conf.template` + `generate-config.sh`：`location /fnos`（按需生成） | ✅ |
| `src/lib/sha256.ts`：纯 JS SHA-256（HTTP 局域网下 `crypto.subtle` 不可用；已对照 Node crypto 验证 7 用例） | ✅ |
| `src/api/fnosTypes.ts` + `src/api/fnos.ts`：登录/重登、曲库、搜索、歌单、歌词、媒体 URL | ✅ |
| `src/lib/adapter.ts`：`fnosTrackToRecord`（`plugName='fnos'`） | ✅ |
| `src/stores/fnos.ts`：登录态 + deviceId 持久化 | ✅ |
| 端到端验证：经 Vite 代理登录 `code=0`、`track/list` `code=0`（51 首） | ✅ |

### M2 曲库浏览页 ✅（2026-09-06）

| 任务 | 状态 |
| --- | --- |
| `router` 加 `/library` 与 `/library/collection/:kind/:guid` + `AppHeader` 导航「音乐库」（fnos.enabled 时显示） | ✅ |
| `LibraryView.vue`：Tabs（歌曲/专辑/歌手/流派）+ 分页 + 封面网格 | ✅ |
| 专辑/歌手/流派二级浏览：`FnosCollectionView.vue`（detail 头部 + 按碟/曲号排序曲目 + 播放全部） | ✅ |
| SongList：fnos 记录歌手/专辑链接映射到音乐库路由，隐藏下载与音质菜单 | ✅ |
| 播放器 fnos 分流（`fnosStreamUrl` 直链）提前落地，浏览器实测音频推进（duration 272s） | ✅ |

### M3 库内搜索 ⬜

| 任务 | 状态 |
| --- | --- |
| LibraryView 搜索框（`search/track|album|artist|playlist`，防抖 300ms） | ⬜ |

### M4 播放与歌词集成 ⬜

| 任务 | 状态 |
| --- | --- |
| `stores/player.ts` 按 `plugName` 分流取流地址（fnos 直链） | ⬜ |
| 歌词（`lyric/list` 取 preferred）与封面分流 | ⬜ |
| SongList / PlayerBar：fnos 记录隐藏下载按钮与音质徽章；队列持久化照旧 | ⬜ |

### M5 歌单 ⬜

| 任务 | 状态 |
| --- | --- |
| 歌单 Tab：列表 → 详情曲目 → 加入队列/整单播放 | ⬜ |

### M6 收尾验收 ⬜

| 任务 | 状态 |
| --- | --- |
| `npm run build` 通过；dev 手测全流程 | ⬜ |
| 更新 `docs/features.md`、`docs/roadmap.md` 第 3 期标注（浏览/播放 ✅，补全下载 ⬜） | ⬜ |

## 5. 风险与备选

- **Set-Cookie 兜底**：实测登录无 Set-Cookie，由前端 `document.cookie` 写入即可；若浏览器策略拦截（如未来固件加 SameSite），备选为代理侧（vite configure 钩子）读登录响应记忆 token 并注入 Cookie 头
- **歌词乱码**：终端显示乱码为 Git Bash 代码页问题，字节为 UTF-8，浏览器 fetch 正常解码；上线前手测确认
- **fnOS 固件升级**：接口为逆向所得，升级可能变动；路径清单以 §3 为准，异常时先重测 M0

## 6. 不在本期（按路线图推后）

- ❌ 歌单补全下载（对比歌单与本地库缺失曲目一键下载）——依赖 Node 伴生服务（第 3 期 `/mc`）
- ❌ fnOS 多用户管理、播放历史/收藏写操作、漫游播放（roam）
- ❌ 单仓库迁移（monorepo）与 `packages/api-contract`

## 7. 进度日志

- 2026-09-06：M0 真机验证通过（9 项实测）；本文档建立
- 2026-09-06：M1 接入层完成；经 Vite 代理端到端验证（登录/曲库 code=0）；分支已快进到 development 最新（docs 站重构后路径为小写文件名）
