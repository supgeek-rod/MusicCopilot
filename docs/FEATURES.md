# MusicCopilot 功能说明

> 本文档描述前端已实现的全部功能与实现要点。后端接口的实测差异与完整清单见
> [api-test-report.md](api-test-report.md)，整体架构见 [ARCHITECTURE.md](ARCHITECTURE.md)。

## 页面与路由（hash 模式）

| 路由 | 页面 | 说明 |
| --- | --- | --- |
| `#/search` | 搜索页（默认，`/` 重定向至此） | 音源切换、联想词、歌曲列表、分页 |
| `#/artist/:plug/:id` | 歌手页 | 歌手详情、全部歌曲、全部专辑网格 |
| `#/album/:plug/:id` | 专辑页 | 专辑详情、曲目列表、播放/下载整张 |
| `#/downloads` | 下载任务页 | 任务队列管理与批量操作 |

顶部导航：Logo「MusicCopilot」+ 连接状态指示（绿点已连接 / 红点异常 + 错误横幅）+ 页签导航 + 快捷搜索框（md 以上屏幕显示，回车跳转搜索页）+ 深色模式切换。

## 启动与登录（stores/app.ts）

1. 启动时 `fetch` 加载运行时配置 `config.json`（`no-store`，缺失则用空配置）。dev/preview 下由 Vite 中间件从 `.env`（或环境变量）虚拟生成，生产为部署目录下的 `config.json` 文件。
2. 读取 localStorage 中的 token（键 `musiccopilot:auth:<baseUrl>`，同时清理更名前遗留的 `sqmusic:auth:*` 旧键）。
3. **仅当本地已有 token** 才调 `isLogin` 校验（该后端无 token 时也返回 true，不能作为跳过登录的依据）；无 token 或已失效则用配置的账号密码自动登录（`device: "web"`）。
4. 登录响应的 `tokenName`/`tokenValue` 存入 localStorage；之后所有请求自动带该请求头。
5. 任何接口遇 HTTP 403：自动用配置账号重登一次并重试原请求（认证接口本身不重试，防死循环）。
6. 登录成功后并行拉取：音源插件列表（`getOption`，渲染音源下拉）与音质枚举表（`getPlugBrTypeList`，用于音质标签展示；当前部署返回空数组时回退到本地解析）。

## 搜索页

- **音源下拉**：选项来自 `getOption`，展示时去掉括号内的提示文字（完整提示保留在 `title`）；插件列表为空时兜底「酷我」。
- **联想词**：`searchTips` 防抖 300ms，取前 8 条；输入框聚焦打开、失焦/Esc 关闭、点击词条（`mousedown.prevent` 保持焦点）立即以该词搜索。
- **搜索历史**：最近 10 条搜索词存 localStorage（键 `musiccopilot:search-history`，去重、最新在前）；输入框聚焦且未输入时展示历史面板（与联想词互斥），支持点击一键重搜（回填后以当前音源搜索）、单条删除（悬浮出现 ×）、底部「清空搜索历史」。搜索成功后自动记录。
- **快捷搜索与 URL 同步**：顶部导航栏输入回车 → 跳转 `#/search?q=关键词` 由页面接续搜索（任意页面可用，小屏隐藏）；页内搜索成功后 `router.replace` 把关键词同步进 URL（不产生历史记录），因此搜索结果可刷新恢复、可分享链接；`?q=` 变化由 watch 驱动，与页内搜索互不打环。
- **搜索**：`searchSong`，每页 30 条；回车（`keydown.enter.prevent`）或点搜索按钮触发；切换音源后自动以已提交关键词重搜。
- **结果列表**：封面（Avatar，加载失败回退图标）、歌名、歌手/专辑、音质徽标（取前 3 个，按码率降序）、时长。
- **音质徽标**：`brType` 字符串本地解析（如 `KW_FLAC_2000` → `FLAC 2000K`），音质枚举表能命中时优先用其 `type`/`bit`；按 `parseBrType` 解析的码率降序排序；无损（FLAC/APE/HI-RES…）紫色、≥320K 蓝色、其余灰色。
- **分页**：`searchTotal` 计算总页数，上一页/下一页。
- 歌手名、专辑名是链接，分别跳转歌手页（`artistids[0]`）与专辑页（`albumid`）。

## 播放器（stores/player.ts + PlayerBar.vue）

- **播放队列**：`queue[]` + `queueIndex`；`play(song)` 等价单元素队列；`playAll(songs, startIndex)` 供专辑页/歌手页整组连播。
- **直链懒加载**：切到哪首才调 `getDownloadUrl`（最高音质 + 必传 `brTypes` 数组），避免直链过期；响应返回时若用户已切歌则丢弃。
- **自动切歌**：`ended` 事件自动 `next()`，队尾停止；上一首/下一首按钮仅在队列长度 > 1 时显示。
- **播放条**：封面、歌名/歌手、播放暂停、进度条拖拽、时间、音量（静音切换）、队列位置（如 `2/11`）、关闭。
- 播放失败（链接失效）toast 提示；audio 元素操作放在 `flush: 'post'` 的 watcher 中（首次挂载时 DOM 才存在）。
- 状态存于 Pinia，跨页面持久（路由切换不中断播放）。

## 歌词（LyricDialog）

- `getLyric` 响应不遵循统一包裹，歌词文本在 `msg` 字段（兼容 `data` 字符串与纯文本三种形态）。
- 解析：按行去除 `[...]` 时间轴标签，过滤空行；无内容时显示「无歌词或纯音乐」。

## 歌手页（ArtistPage）

- **头部**：`artistAlbumById` 返回的歌手照片（圆形）、名称、「N 张专辑 / N 首歌曲」徽标、播放全部 / 下载全部专辑按钮。
- **全部歌曲**：以歌手名调 `searchSong`（50 条/页）+「加载更多」追加（按歌曲 id 去重；整页重复时停止显示按钮）。
- **全部专辑网格**：详情响应自带 `albums[]`；卡片为封面 + 名称 + 年份 + 曲目数，点击进专辑页，悬浮「下载整张」按钮（`downloadAlbum` 默认音质，带确认框）。
- **下载全部专辑**：`downloadArtistAlbum`，确认框提示任务量大。
- **歌手简介**：HTML 内容经净化（去 `<script>` 与 `on*` 事件属性）后折叠展示（限高 + 渐隐 + 展开全文）。

## 专辑页（AlbumPage）

- **头部**：大封面、名称、歌手（链接到歌手页）、发行时间/唱片公司/曲目数、简介折叠。
- **曲目列表**：详情响应自带 `musics[]`，经 `albumSongToRecord` 适配为统一 `SongRecord`（`musicName→name`、`musicArtists→artistName`、`musicImage→pic`、秒→毫秒、`bits→brTypes`），按 `dataInfo.track` 排序后复用 SongList。
- **播放整张**：全部曲目入队，从第 1 首连播。
- **下载整张**：音质下拉（默认音质 + 从全部曲目 `bits` 汇总去重的码率选项，映射为整数 `bit`）→ 确认框 → `downloadAlbum`，成功 toast 显示任务数。
- 当前队列正在播放本专辑歌曲时显示「♪ 正在播放本专辑」。

## 下载

- **服务器下载队列**：`downloadSong`（完整歌曲记录 + 可选 `brType`，省略时后端选最高音质）、`downloadAlbum`（专辑记录 + 整数 `bit`）、`downloadArtistAlbum`（歌手记录）。操作结果均以 toast 反馈。
- **浏览器直链下载**：`getDownloadUrl` 取直链后创建 `<a download>`（`target="_blank"`）触发保存，文件名 `歌手 - 歌名.格式`。
- 每首歌曲的下载菜单分两组：加入服务器下载队列 / 浏览器直链下载，音质项来自该歌 `brTypes`。

## 下载任务页（DownloadsView）

- `task/list` 5 秒轮询 + 手动刷新；按状态筛选（`all` 哨兵值，非空才传 `downloadStatus`）。
- **状态徽标**：waiting 等待中 / downloading 下载中 / loading 解析中（闪烁）/ success 成功 / error 失败。
- **单条操作**：失败→重试（`errorTaskRetry`）；等待/解析中→重新入队（`refreshTask`）；删除（`del`，确认框）。
- **批量操作**（确认框）：重试全部失败（`againTask`）、删除失败/成功/等待中任务。
- 分页：`total/pages`，页大小 20。
- **完成通知（全局）**：`lib/taskToaster.ts` 登录成功后随 App 启动，15 秒轮询最近 50 条任务，检测「进行中 → 成功/失败」迁移后弹 toast（任意页面可见）；首次建档不通知（避免启动刷屏），同轮多条自动聚合成摘要（成功/失败各一条，描述取前 3 个歌名），失败描述附带后端消息（截断 60 字）。

## 基础设施

- **Pinia stores**：`app`（配置、连接与登录状态、token、插件列表、音质枚举）、`player`（队列与播放状态）。
- **axios 封装（api/http.ts）**：动态 `baseURL`（config.json 的 `baseUrl`，留空同源走 Vite 代理）、动态 token 头（名取登录响应 `tokenName`）、统一解包 `{code, msg, data}`、网络错误友好提示。
- **竞态防御**：页面组件的异步请求在卸载后丢弃响应（`disposed` 守卫），避免与路由切换竞态引发渲染崩溃。
- **深色模式**：`useDark`（`vueuse-color-scheme` 持久化），主题变量见 `src/style.css`。
- **PWA（vite-plugin-pwa）**：`registerType: autoUpdate` 静默更新；构建产物全量预缓存 + SPA `navigateFallback`；`/api/*` 与 `config.json` 在 `navigateFallbackDenylist` 中永不缓存（后者容器内运行时生成）；封面等图片走 `StaleWhileRevalidate` 运行时缓存（限 200 条 / 14 天）。图标由 `public/favicon.svg` 经 sharp 一次性生成（192/512/maskable-512/apple-touch-180）。仅在构建产物（preview / Docker）生效，dev 模式默认无 SW。

## 运行配置（MC_* 环境变量）

配置统一以 `MC_` 前缀变量提供（真实环境变量 > `.env` 文件，模板见 `.env.example`）：

| 变量 | 说明 |
| --- | --- |
| `MC_API_BASE_URL` | 后端地址；留空 `""` 表示同源（开发走 Vite 代理 / 生产 nginx 反代） |
| `MC_DEV_PROXY_TARGET` | 仅开发环境生效：Vite 代理的转发目标，默认取 `MC_API_BASE_URL` |
| `MC_USERNAME` / `MC_PASSWORD` | 自动登录账号（内网明文，改进计划见 README 前置建议） |
| `MC_AUTO_LOGIN` | 是否自动登录（`true` / `false`，默认 `true`） |

应用侧始终 `fetch /config.json`：dev/preview 由 Vite 中间件虚拟生成；`npm run build` 时若配置了任一变量则生成 `dist/config.json`（也可手动修改，运行时读取）；Docker 由容器入口脚本从环境变量生成。

## 已知注意事项

- 后端接口的文档差异、危险接口（`delSuccessTask` 会清空全部成功记录）、插件开关状态等**务必先读 [api-test-report.md](api-test-report.md)**。
- 搜索联想面板遮挡结果首行属于正常交互（失焦即关闭）；自动化测试点击列表操作前需先让输入框失焦。
- 直链有时效，试听/下载均实时获取，不做缓存。
