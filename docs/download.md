---
title: 下载与目录布局
description: 音乐下载引擎与下载完成目录重排的工作机制详解
---

# 下载与目录布局

下载链路由 server 单体完成：任务队列 → 直链解析 → 文件落盘 → 按目录模板重排为「歌手/专辑/」结构（Navidrome 友好）。整体数据流：

```
前端发起下载
    │
    ▼
server 建任务 → SQLite 队列（waiting）
    │  queue:work
    ▼
解析直链（loading）→ 传输落盘（downloading）→ success
    │
    ▼ 按 MC_MUSIC_DOWNLOAD_PATH_TEMPLATE 重排
音乐库目录（fnOS「音乐」应用扫描自动入库）
```

对应[Docker 部署 · 容器与拓扑](./deployment#容器与拓扑自建后端)中的容器分工；本文展开其中的机制细节。

## 音乐下载（server）

### 任务创建

| 端点 | 入参 | 展开方式 |
| --- | --- | --- |
| `POST /api/download/downloadSong` | 搜索返回的完整歌曲记录 + 可选 `brType` | 单曲，直接建 1 个任务 |
| `POST /api/download/downloadAlbum` | 专辑记录 + 可选 `bit`（整数码率） | **同步**展开：调一次上游专辑详情，每首曲目建一个任务，响应返回任务数组（前端取长度显示「已加入 N 首」） |
| `POST /api/download/downloadArtistAlbum` | 歌手记录 + 可选 `bit` | **异步**展开：专辑多、每张都要请求一次上游，HTTP 立即返回，由 `ExpandArtistAlbumJob` 在队列里逐张展开，任务在列表中渐进出现 |

任务落 `download_tasks` 表，关键字段：

- `br_types`——该曲可用音质清单（来自搜索结果 MINFO 的解析）
- `music_info`——**上游原始条目 JSON**。前端按入队音质查 MINFO 里的 size 来估算文件大小，所以任务页能看到「52.8 MB」这类预估
- `status` / `progress` / `file_path` / `error_msg`——状态机与结果

音质决策：`brType` / `bit` 指定了就直接用（`bit` 经插件音质枚举反查为 `KW_*` 别名）；**省略则 worker 自动选最高可用**——任务 `brTypes` 与插件枚举求交集、按码率排序取最大；无任何参照时兜底 320k。

### 队列与状态机

SQLite database queue + `queue:work` 单进程串行（下载是重 IO，串行避免磁盘与网络争用）。每个任务由 `DownloadSongJob` 处理，状态机：

```
waiting → loading（解析直链）→ downloading（传输中）→ success
                              ↘ 任一步失败 → error（手动重试回 waiting）
```

`$tries = 1`：不做自动重试，失败即落 `error` 并写明原因，由用户在任务页手动重试（`errorTaskRetry` / `againTask`），避免坏任务无限循环打上游。任务管理共 8 个端点：`list`（分页 + 状态筛选）、`del`、`refreshTask`、`errorTaskRetry`、`againTask`、`delErrorTask`、`delWaitingTask`、`delSuccessTask`（⚠️ 清空全部成功记录、只删记录不删文件，前端有确认弹窗）。

### 直链解析

worker 在 `loading` 阶段调用音源插件的直链解析：酷我走 `mobi.kuwo.cn/mobi.s?type=convert_url_with_sign`，`KW_FLAC_2000` 这类对外别名经插件的音质表双向映射为酷我 `br` 值（如 `2000kflac`）。两个关键性质：

- **该接口有大陆 IP 区域限制**（海外返回 `code:407`，server 映射为明确提示）；搜索/详情/歌词则海外可用
- 返回的直链**带签名与时效**（URL 路径含过期时间戳），只能即时解析即时下载，绝不落库

### 文件传输与落盘

进入 `downloading` 后用 Guzzle `sink` **流式写盘**（不占内存），先写 `<最终名>.part` 临时文件：

- 成功：确认任务仍存在（**下载期间被删除 → 直接丢弃文件**，不留垃圾）→ 原子 `rename` 为最终名 → 回写 `success` 与落盘路径
- 失败（HTTP 非 200 / 文件为空）：删临时文件 → `error` + 错误信息

文件名规则：`歌手 - 标题.格式`，格式取直链实际返回的 `format`（酷我部分 128k 实际是 AAC 流，会落成 `.aac`——按真实格式命名）；路径分隔符与 Windows 非法字符替换为下划线，重名自动追加 ` (2)` 序号。

## 目录布局（下载完成后）

落盘成功后 worker 按 `MC_MUSIC_DOWNLOAD_PATH_TEMPLATE`（默认 `{albumArtist}/{album}/{title} - {albumArtist}.{ext}`；模板不含目录部分即为平铺，如 `{title}.{ext}`）把文件移入「歌手/专辑/」两级目录：

- 专辑上下文（专辑歌手/年份/音轨号）经本机插件原生查询（albumInfoById），无专辑 id 或查询失败时用任务自带字段尽力渲染
- 模板逐段渲染：中间空段（如无专辑时的 `{album}/`）整体丢弃；非法字符替换为下划线
- 冲突处理：同名追加序号；同内容视为重复下载，删源保留既有文件；移动后自清理变空的目录
- 任一失败保持平铺原位，不影响任务成功状态

## 实测边界行为

- **AAC 情形**：酷我部分歌曲的「128k mp3」实际返回 AAC 编码流，worker 按直链实际 `format` 落盘为 `.aac`（fnOS 对 `.aac` 的支持以实际版本为准）
- **上游一致性**：基础标签（标题/歌手/专辑）与真值一致时，job 变更集只剩 albumArtist/cover/lyrics 三项——无变化跳过的守卫在起作用
- **直链时效**：签名直链过期后下载会失败，此时重试任务会重新解析新直链（`refreshTask` / `errorTaskRetry` 均可）

## 参考实现

| 文件 | 内容 |
| --- | --- |
| `server/app/Jobs/DownloadSongJob.php` | 下载 worker：状态机、音质决策、流式落盘、目录重排 |
| `server/app/Services/DownloadTaskService.php` | 任务创建与专辑/歌手展开 |
| `server/app/Plugins/Sources/Kuwo/KuwoPlugin.php` | 酷我直链解析（KW_* ↔ br 映射） |
| `server/docs/kuwo-api-notes.md` | 酷我接口实测口径（加密、限流、区域限制） |
