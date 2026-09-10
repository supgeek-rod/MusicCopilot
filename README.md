# MusicCopilotServer

自建音乐下载服务的研究仓库（对标 [simple_sq_music_plus](https://github.com/59799517/simple_sq_music_plus)），
目标形态：**PHP / Laravel 13 纯后端 + Docker 部署**，音源插件化，第一个接入**酷我音乐（kw）**。
未来按 MusicCopilot 的 SQMusic 接口契约替换原后端（接口契约见 MusicCopilot 仓库 `docs/api-test-report.md`）。

## 当前进度

- [x] 酷我接口调研：搜索 / 详情 / 歌词 / 直链解析 全链路 curl 实测通过（2026-09-10）
- [ ] Laravel 13 骨架（计划用 Docker 内 Composer 生成，本机无 PHP）
- [ ] API 封装（{code,msg,data} 契约 + sqmusic token 鉴权）
- [ ] 下载队列与任务管理
- [ ] Dockerfile / docker-compose

## 目录结构

```
├─ docs/
│  └─ kuwo-api-notes.md    # 酷我接口调研笔记（端点、参数、加密、区域限制结论）
├─ scripts/                # curl 验证脚本（Git Bash 可直接运行）
│  ├─ kw-search.sh         # 歌曲mv/歌手/专辑搜索
│  ├─ kw-tips.sh           # 搜索提示
│  ├─ kw-info.sh           # 歌曲详情 + 音质清单（musicpay）
│  ├─ kw-lyric.sh          # 歌词（newlyric 加密接口，curl 取包 + node 解码）
│  ├─ kw-download-url.sh   # 直链解析（⚠️ 需大陆出口 IP）
│  ├─ kw-download.sh       # 解析 + 真实下载文件
│  ├─ kw-album.sh          # 专辑详情（含曲目）
│  └─ kw-artist.sh         # 歌手信息 / 专辑列表 / 歌手单曲
└─ research/               # 参考仓库提取的原始资料
```

## 用法

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
