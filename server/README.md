# MusicCopilot Server（server/）

自建音乐下载服务（对标 [simple_sq_music_plus](https://github.com/59799517/simple_sq_music_plus)），
**PHP / Laravel 13 纯后端 + Docker 部署**，音源插件化，第一个接入**酷我音乐（kw）**。
按 MusicCopilot 的 SQMusic 接口契约实现（契约见 MusicCopilot 仓库 `docs/api-test-report.md`），
目标是前端零改动切换。

> 本目录已从独立仓库并入 MusicCopilot monorepo（git subtree，保留历史）；
> Laravel 应用根就是本目录（`app/ composer.json artisan` 直接在此）。

## 当前进度

- [x] 酷我接口调研：搜索 / 详情 / 歌词 / 直链解析 全链路 curl 实测通过（2026-09-10）
- [x] Laravel 13 应用（WSL PHP 8.4 运行，`php artisan serve --port=8097`）
- [x] 搜索 API：`/api/music/searchSong|searchArtist|searchAlbum`（kw 插件，SQMusic `{code,msg,data}` 契约，
      字段对齐 MusicCopilot 前端 `SongRecord/ArtistRecord/AlbumRecord`）
- [x] API 文档 + 在线测试台：Scalar（本地化）+ Scramble 自动生成 OpenAPI 3.1 规范（2026-09-11）
- [ ] 鉴权（登录 + sqmusic token 头）
- [ ] 歌词 / 歌曲详情 / 直链解析 / 下载链接
- [ ] 下载队列与任务管理
- [ ] Dockerfile / docker-compose

## 开发

```bash
# PHP/Composer 只在 WSL（详见根 AGENTS.md server/ 一节）
wsl -e bash -lc "cd '/mnt/c/Users/superod/OneDrive/文档/ZCode/MusicCopilot/server' && php artisan serve --host=0.0.0.0 --port=8097"
```

### 搜索 API 用法

```bash
curl 'http://127.0.0.1:8097/api/music/searchSong?plugName=kw&keyword=晴天&pageIndex=1&pageSize=3'
curl 'http://127.0.0.1:8097/api/music/searchArtist?plugName=kw&keyword=周杰伦'
curl 'http://127.0.0.1:8097/api/music/searchAlbum?plugName=kw&keyword=叶惠美'
```

`pageIndex` 从 1 开始（内部转酷我 pn=pageIndex-1）；`pageSize` 上限 100。
错误统一 `{code:500, msg, data:null}`：keyword 缺失、plugName 未注册、上游请求失败。

### API 文档与在线测试（Scalar + Scramble）

- **`http://127.0.0.1:8097/api-docs.html`** —— Scalar 渲染的交互式文档 + 请求测试控制台
  （资产已本地化到 `public/vendor/scalar/`，离线 NAS 可用；CDN 产物有坏包问题勿换回，见 git 历史）
- `http://127.0.0.1:8097/docs/api` —— Scramble 自带文档页（Stoplight Elements，控制台经实测可发真实请求）
- `http://127.0.0.1:8097/docs/api.json` —— OpenAPI 3.1 规范（Scramble 从控制器自动生成，可喂 openapi-typescript 生成前端契约类型）
- 本目录 `openapi.json` —— 规范固化产物（`php artisan scramble:export`），
  契约类型单一来源：前端仓库 `packages/api-contract`（`npm run gen`）

已知限制：规范中 `records` 的内部结构是宽松推断（`array<string,mixed>`），信封与分页字段精确；
后续可用 Scramble 扩展或响应类进一步收紧。

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
   → 自建服务需部署在大陆出口环境（如家中 NAS）。
2. 参考仓库（Java 3.1.20）当前所用端点家族 2026-09 仍然全部有效。
3. 歌词接口需两层 XOR（key `yeelion`）+ base64 + zlib，最终 gb18030 解码，仅 `lrcx=1` 模式有效。
