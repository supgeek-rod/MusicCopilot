# MusicCopilot Server（server/）

自建音乐下载服务，**PHP / Laravel 13 纯后端 + Docker 部署**，音源插件化，第一个接入**酷我音乐（kw）**。
无认证、连接即用；接口以 OpenAPI 3.1 规范为准（本目录 `openapi.json`，契约类型经
MusicCopilot 仓库 `packages/api-contract` 自动生成）。

> 本目录已从独立仓库并入 MusicCopilot monorepo（git subtree，保留历史）；
> Laravel 应用根就是本目录（`app/ composer.json artisan` 直接在此）。

## 当前进度

- [x] 酷我接口调研：搜索 / 详情 / 歌词 / 直链解析 全链路 curl 实测通过（2026-09-10）
- [x] Laravel 13 应用（WSL PHP 8.4 运行，`php artisan serve --port=17017`）
- [x] 搜索 API：kw 插件，曾统一 `{code,msg,data}` 信封（**2026-09-26 API V2 起改 REST 裸 JSON**，见下）
- [x] API 文档 + 在线测试台：Scalar（本地化）+ Scramble 自动生成 OpenAPI 3.1 规范（2026-09-11）
- [x] ~~鉴权~~：**2026-09-25 认证移除、2026-09-26 端点删除**，探活由 `/api/healthcheck` 承担
- [x] 歌词 / 歌曲详情 / 直链解析：2026-09-12 第 5 期 M2 落地（⚠️ 直链有大陆 IP 区域限制，海外出口 code:407）
- [x] 下载任务：三创建端点 + 任务管理（2026-09-12 第 5 期 M3，SQLite 队列 + queue:work worker）
- [x] **API V2（2026-09-26）**：`/api/v2/*` 清理版契约——REST 语义、真 HTTP 状态码、整数类型、
      统一分页 `{items,total,page,pageSize}`、错误体 `{error,message}`；旧信封端点整体删除
      （探活 `/api/healthcheck` 保留历史信封形态）
- [ ] Dockerfile / docker-compose（Dockerfile 与 compose 编排已就位，镜像构建随 CI 验证）

## 开发

```bash
# PHP/Composer 只在 WSL（详见根 AGENTS.md server/ 一节）
wsl -e bash -lc "cd '<仓库路径>/MusicCopilot/server' && php artisan serve --host=0.0.0.0 --port=17017"   # <仓库路径> 按本机实际位置替换
```

### API V2 契约（2026-09-26，现行）

REST 语义：真 HTTP 状态码 + 裸 JSON，无 `{code,msg,data}` 信封；错误体 `{error: <机器码>, message: <中文文案>}`
（422 验证 / 400 语义错 / 404 不存在 / 502 音源上游失败 / 429 限流）。分页统一 `{items, total, page, pageSize}`。

```bash
curl 'http://127.0.0.1:17017/api/v2/search/songs?plugName=kw&keyword=晴天&page=1&pageSize=3'
curl 'http://127.0.0.1:17017/api/v2/search/artists?plugName=kw&keyword=周杰伦'
curl 'http://127.0.0.1:17017/api/v2/search/albums?plugName=kw&keyword=叶惠美'
curl 'http://127.0.0.1:17017/api/v2/config/options'
```

`page` 从 1 开始（内部转酷我 pn=page-1）；`pageSize` 上限 100。端点全表见 `openapi.json`
（搜索/详情/歌词/直链在 `search|artists|albums|songs` 资源下，下载任务统一 `downloads` 资源，
fnOS 代持会话在 `fnos/session`）。

### 认证（2026-09-25 移除）

所有 `/api/*` 端点**公开可访问，无需任何凭证或请求头**。原鉴权体系（`sqmusic` 请求头 +
登录 token 落库 + 403 拦截）整体删除，`MC_API_USERNAME` / `MC_API_PASSWORD` / `MC_AUTH_TTL` 配置废弃：

- 探活统一走 **`GET /api/healthcheck`**（恒 200 + 历史信封；Docker healthcheck、运维探测与前端连接探测共用）
- 已有部署升级后无需任何迁移：旧 token 记录（`auth_tokens` 表）留存库中但不再被读取，可无视

### 下载与任务队列（第 5 期 M3）

```bash
# 启动 worker（开发期；Docker 部署时由 server 容器 entrypoint 自动拉起，与 API 同容器）
php artisan queue:work --tries=1 --timeout=3600

# 创建单曲任务（body 为 V2 统一 Song 对象；brType 省略自动选最高可用音质）
curl -s --noproxy '*' -X POST -H 'Content-Type: application/json' \
  --data-binary @song.json 'http://127.0.0.1:17017/api/v2/downloads/songs'

# 任务列表（分页 + status 筛选：waiting/downloading/loading/success/error）
curl -s --noproxy '*' 'http://127.0.0.1:17017/api/v2/downloads?page=1&pageSize=20&status=error'
```

- 状态机：waiting → loading（解析直链）→ downloading → success / error；失败经 `POST /v2/downloads/{id}/retry` 回 waiting
- 落盘「歌手 - 标题.格式」，重名追加序号；目录 `MC_MUSIC_DOWNLOAD_DIR`（默认 `storage/app/downloads`；容器内由镜像 ENV 固定为 `/downloads`，即音乐库挂载点）
- 整张专辑同步展开（响应 `{tasks: [...]}`，前端取长度计数）；歌手全部专辑队列异步展开（202 `{queued}`）、任务渐进出现
- 删除任务记录不删已落盘文件；`DELETE /v2/downloads?status=success` 清空全部成功记录（前端有确认弹窗，脚本调用务必谨慎）

### API 文档与在线测试（Scalar + Scramble）

- **`http://127.0.0.1:17017/api-docs.html`** —— Scalar 渲染的交互式文档 + 请求测试控制台
  （资产已本地化到 `public/vendor/scalar/`，离线 NAS 可用；CDN 产物有坏包问题勿换回，见 git 历史）
- `http://127.0.0.1:17017/docs/api` —— Scramble 自带文档页（Stoplight Elements，控制台经实测可发真实请求）
- `http://127.0.0.1:17017/docs/api.json` —— OpenAPI 3.1 规范（Scramble 从控制器自动生成，可喂 openapi-typescript 生成前端契约类型）
- 本目录 `openapi.json` —— 规范固化产物（`php artisan scramble:export --path=openapi.json`），
  契约类型单一来源：前端仓库 `packages/api-contract`（`npm run gen`）

V2 响应结构由 `app/Http/Resources/V2/` 资源类精确推断（components.schemas），无宽松推断残留；
新增字段时在该层调整类型转换即可。

## 目录结构

```
server/
├─ app/ routes/ config/ ...     # Laravel 13 应用（源码插件在 app/Plugins/Sources/）
├─ docs/
│  └─ kuwo-api-notes.md    # 酷我接口调研笔记（端点、参数、加密、区域限制结论）
├─ scripts/                # curl 验证脚本（Git Bash 可直接运行）
│  ├─ kw-search.sh         # 歌曲/歌手/专辑搜索
│  ├─ kw-tips.sh           # 搜索提示
│  ├─ kw-info.sh           # 歌曲详情 + 音质清单（musicpay）
│  ├─ kw-lyric.sh          # 歌词（newlyric 加密接口，curl 取包 + node 解码）
│  ├─ kw-download-url.sh   # 直链解析（⚠️ 需大陆出口 IP）
│  ├─ kw-download.sh       # 解析 + 真实下载文件
│  ├─ kw-album.sh          # 专辑详情（含曲目）
│  └─ kw-artist.sh         # 歌手信息 / 专辑列表 / 歌手单曲
├─ research/               # 参考仓库提取的原始资料
└─ openapi.json            # OpenAPI 3.1 规范固化产物
```

## 调研脚本用法

```bash
scripts/kw-search.sh "晴天 周杰伦"          # 歌曲搜索
scripts/kw-search.sh "叶惠美" album        # 专辑搜索
scripts/kw-info.sh 228908                  # 晴天详情与可用音质
scripts/kw-lyric.sh 228908                 # LRCX 歌词
scripts/kw-download-url.sh 228908 320kmp3  # 直链（大陆出口下可用）
scripts/kw-download.sh 228908 128kmp3      # 解析并下载文件
```

脚本内 `node` 仅用于中文 URL 编码、JSON 美化与歌词解码，HTTP 一律走 `curl`。
所有脚本默认 `--noproxy '*'` 直连（酷我是大陆服务；本机若挂着 Clash 等代理会污染结果，
详见 docs/kuwo-api-notes.md §9 的 Windows Git Bash 开发坑）。

已知行为：`kw-lyric.sh` 所依赖的 `newlyric.kuwo.cn` 有按 IP 的分钟级限流，
高频调用后会返回 `TP=ERROR REQUEST`（脚本内置 3 次退避重试，仍失败请等几分钟）；
这正是 Laravel 实现要加"结果永久缓存 + 长退避重试"的原因。

## 关键结论（详见 docs/kuwo-api-notes.md）

1. 搜索、详情、歌词接口**海外 IP 可用**；仅**直链解析**（`mobi.kuwo.cn` convert_url_with_sign）有
   **大陆 IP 区域限制**（海外返回 `code:407`），CDN 直链文件本身不限区域可下载。
   → 自建服务需部署在大陆出口环境（如内网 NAS）。
2. 参考仓库（Java 3.1.20）当前所用端点家族 2026-09 仍然全部有效。
3. 歌词接口需两层 XOR（key `yeelion`）+ base64 + zlib，最终 gb18030 解码，仅 `lrcx=1` 模式有效。
