# 音乐库体检（Meta 刮削）· 功能规划与进度

> 状态图例：⬜ 未开始 ｜ 🚧 进行中 ｜ ✅ 已完成 ｜ ❌ 搁置（不在本期）
>
> 工作分支 `feature/meta-scraper`（worktree `../MusicCopilot-meta-scraper`）；本文档为该功能的**唯一进度看板**，每完成一个里程碑更新对应状态并提交。对应路线图[第 4 期](./roadmap.md)，架构依据见[架构设计](./architecture.md)（决策 #2 修订 / #9 / #10）。

## 1. 背景与目标

NAS 音乐库（fnOS「音乐」应用曲库目录，即 SQMusic 下载目录）长期积累的文件存在标签缺失、封面缺失、文件名混乱等问题，fnOS 曲库展示质量直接受制于文件内嵌元数据。本期做一个**独立 Docker 工具**挂载音乐目录卷，直接读写音频文件的 ID3v2 / Vorbis / MP4 标签（补全、封面、歌词、可选重命名），并在现有 Web 上提供「音乐库体检」后台：手动触发扫描/刮削、查看问题清单与候选、管理刮削配置与忽略清单。

## 2. 已确认决策（2026-09-11）

| 决策点 | 结论 |
| --- | --- |
| 形态 | **独立 Docker 工具**（`scraper/`，镜像 `music-copilot-scraper`），挂载音乐目录卷 rw——不进 Laravel server（PHP 标签写入库弱；写文件风险隔离） |
| 技术栈 | Node.js 24 + TypeScript + Fastify + node:sqlite（零原生编译）；读 `music-metadata`，写 `taglib-wasm`（ffmpeg 兜底） |
| 反代前缀 | `/mc`（预留前缀启用，语义=伴生工具通道，同 `/fnos` 先例：前缀稳定、反代目标可切换） |
| 匹配数据源 | **复用 server/ 酷我搜索**（SQMusic 契约 `/api/music/searchSong` + 封面）；歌词由 server/ 新增酷我歌词代理端点；工具不自带音源解析 |
| v1 写入范围 | 标签补全 + 内嵌封面 + 内嵌歌词 + 「歌手 - 标题」重命名（重命名默认关、冲突跳过） |
| 安全 | 体检页永远先 dry-run 预览；写入需显式确认；写前备份到 `/music/.mc-backup/`（默认开）；忽略清单 |
| 鉴权 | 可选共享 token：`MC_SCRAPER_TOKEN` 非空时前端带 `x-mc-token` 头，默认空（内网） |
| 契约 | 干净设计：标准 HTTP 状态码 + JSON，不复制 `{code,msg}` 历史瑕疵；类型进 `packages/api-contract` |

## 3. 工具设计

### 3.1 目录结构

```
scraper/
├─ src/
│  ├─ index.ts      # Fastify 启动，路由挂 /mc/api/*，可选 x-mc-token 鉴权
│  ├─ config.ts     # env + 持久化配置（zod）：写入策略 fill-missing|overwrite、
│  │                #   重命名模板（默认关）、并发数、minScore、备份开关
│  ├─ db.ts         # node:sqlite：tracks / jobs / ignore_list / config
│  ├─ scanner.ts    # 递归扫描 /music，music-metadata 读标签入库 + 体检分类
│  ├─ matcher.ts    # 文件名（"歌手 - 标题"解析）+ 现有标签 → 调 server/ searchSong
│  │                #   → 候选列表 + 置信度评分（归一化标题/歌手相似度加权）
│  ├─ writer.ts     # taglib-wasm 写标签/封面/歌词；dry-run；备份；ffmpeg 兜底
│  ├─ jobs.ts       # 任务队列（扫描/匹配/写入统一 job），进度可轮询
│  └─ routes/       # status / scan / tracks / match / write / jobs / config / ignore
├─ Dockerfile       # node:24-alpine 多阶段、非 root、VOLUME /music /data
└─ openapi.json     # 契约固化
```

### 3.2 API（`/mc/api`）

| 方法/路径 | 说明 |
| --- | --- |
| `GET /status` | 版本、配置摘要、库统计（各问题类计数） |
| `POST /scan` | 触发全库扫描（job） |
| `GET /tracks?filter=&page=` | 曲目/问题清单（filter：`all`/`missing_cover`/`missing_lyrics`/`missing_album`/`missing_artist`/`messy_name`/`suspect_dup`） |
| `POST /match` | `{trackIds}` → 每首候选列表 + 置信度（不写） |
| `POST /write` | `{trackIds, dryRun, mode}` → jobId；按选中候选/策略写入 |
| `GET /jobs/:id`、`GET /jobs` | 进度（total/done/当前文件/错误列表/结果明细） |
| `GET/PUT /config` | 刮削配置读写 |
| `GET/POST/DELETE /ignore` | 忽略清单管理 |

### 3.3 体检分类（路线图口径）

缺封面 / 缺歌词 / 缺专辑 / 缺歌手 / 文件名混乱（不符合「歌手 - 标题」且标签不全）/ 疑似重复（同名同 duration 或同 title+artist 多文件）。

### 3.4 server/ 配套

- 新增 `GET /api/music/getLyric`：酷我歌词代理，SQMusic 对齐契约（`server/scripts/kw-lyric.sh` 已有现成口径）
- `server/openapi.json` 同步固化 → `npm run gen -w packages/api-contract` 重生成契约类型

### 3.5 Web 后台（现有 Web 应用内）

- 通道（照 `/fnos` 套路）：vite proxy `/mc` → `MC_SCRAPER_BASE_URL`（不 rewrite）；PWA denylist；`config.json` `scraper` 块（enabled/token）；nginx `location /mc/`（`generate-config.sh` 按需生成）
- `src/api/companion.ts`：仿 `fnos.ts` 的独立客户端，可选 `x-mc-token`
- 路由 `/library/health`「音乐库体检」（`AppHeader` 按 `scraper.enabled` 条件插入）：
  - 总览卡片（各问题类计数）+ 问题清单（筛选/分页）
  - 单首/批量：匹配候选预览（置信度）→ 确认写入 → dry-run 对比 → 写入结果
  - 任务进度轮询（仿 DownloadsView）；配置区（写入策略/来源/重命名模板/忽略清单）

## 4. 里程碑与任务清单

### M0 文档先行 ✅（2026-09-11）

| 任务 | 状态 |
| --- | --- |
| `docs/architecture.md`：模块表（scraper/*）、决策 #2 修订、#9 #10、部署拓扑、前端适配层 | ✅ |
| `docs/roadmap.md`：第 4 期标 🚧 + 形态调整说明 | ✅ |
| 本看板建立 | ✅ |

### M1 server/ 歌词端点 ✅（2026-09-11）

| 任务 | 状态 |
| --- | --- |
| `GET→POST /api/music/getLyric`（酷我 newlyric 代理，SQMusic 契约；LRC 放 `data`，不复制 SQMusic 放 `msg` 的瑕疵） | ✅ |
| `server/openapi.json` 固化 + `packages/api-contract` 重生成（4 端点） | ✅ |
| WSL `php artisan test` 通过（7 tests / 16 assertions，含加密链路 mock、重试、错误分支） | ✅ |
| 真机验证：晴天 id=228908 → code=200，LRC 8716 字符 | ✅ |

### M2 scraper 骨架 + 扫描 + 体检 API ⬜

| 任务 | 状态 |
| --- | --- |
| `scraper/` 工程：package.json / tsconfig / Fastify / node:sqlite / zod | ⬜ |
| scanner：递归扫描 + music-metadata 读标签入库 + 体检分类 | ⬜ |
| routes：status / scan / tracks / jobs / config / ignore | ⬜ |
| 本地样例目录 curl 全链路验证（扫描→清单→过滤→分页） | ⬜ |

### M3 匹配 + 写入 ⬜

| 任务 | 状态 |
| --- | --- |
| matcher：文件名解析 + 调 server/ 搜索 + 置信度评分 | ⬜ |
| writer：taglib-wasm 写标签/封面/歌词 + dry-run + 备份 + 重命名 | ⬜ |
| ffmpeg 兜底路径（taglib-wasm 覆盖不了的类型） | ⬜ |
| mp3 / flac / m4a 真实样例验证：dry-run、写入、备份还原、封面歌词嵌入 | ⬜ |

### M4 Web 后台 ⬜

| 任务 | 状态 |
| --- | --- |
| vite proxy + PWA denylist + config.json scraper 块 + nginx/generate-config.sh | ⬜ |
| `src/api/companion.ts` + 契约类型 | ⬜ |
| `LibraryHealthView.vue`：总览/清单/匹配预览/写入/进度/配置/忽略清单 | ⬜ |
| 路由 + AppHeader 条件导航 | ⬜ |
| `npm run build` 通过 + 浏览器实测 | ⬜ |

### M5 Docker + CI ⬜

| 任务 | 状态 |
| --- | --- |
| `scraper/Dockerfile` + `.dockerignore`（node:24-alpine 多阶段、非 root） | ⬜ |
| compose 增 scraper 服务（音乐卷 rw / data 卷 / MC_SERVER_URL / token） | ⬜ |
| CI `scraper-docker.yml`（同 tag 策略，amd64+arm64） | ⬜ |
| 文档站功能页 + nav/sidebar | ⬜ |

## 5. 风险与备选

- **taglib-wasm 不可靠/不维护** → 写入路径整体切 ffmpeg（`-c copy` 重写元数据，镜像内自带静态 ffmpeg）；writer 按接口抽象，切换不影响上层
- **node:sqlite 在 Node 22 需 `--experimental-sqlite`**（本地 dev 与容器 node:24 行为差异）→ dev 脚本统一带 flag，容器内无感
- **酷我直链/歌词有大陆 IP 区域限制**（海外 407）→ NAS 通常在大陆网络；开发机测试走 `--noproxy`（见 `server/docs/kuwo-api-notes.md`）
- **写文件安全**：所有写入强制 dry-run 可预览、备份默认开、重命名冲突跳过；`.mc-backup/` 目录 fnOS 扫描会忽略（以 `.` 开头）
- **中文 argv 乱码**（Windows mingw curl）→ 测试经 node 脚本或 `encodeURIComponent`（见根 AGENTS.md）

## 6. 进度日志

- 2026-09-11：方案批准（Node + TS / 复用 server/ 酷我 / v1 全量写入范围）；worktree 建立；文档先行 M0 开始
- 2026-09-11：M0 完成（架构/路线图/看板三份文档，docs:build 通过）；M1 完成（getLyric 端点 + 契约固化 + 测试 + 真机验证）
