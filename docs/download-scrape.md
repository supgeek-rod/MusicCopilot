---
title: 下载与刮削原理
description: 音乐下载引擎与下载完成自动刮削的工作机制详解
---

# 下载与刮削原理

音乐下载与刮削是两段接力：**server 负责下载文件**，**scraper 负责把标签写好**，中间靠一次 HTTP 推送衔接。整体数据流：

```
前端发起下载
    │
    ▼
server 建任务 → SQLite 队列（waiting）
    │  queue:work
    ▼
解析直链（loading）→ 传输落盘（downloading）→ success
    │
    ▼ 推送真值元数据（文件名 + 歌名/歌手/专辑/封面/kw 歌曲id）
scraper download-tag job
    │  读现状 → 覆盖写标签 → 嵌封面/歌词
    ▼
音乐库目录（fnOS「音乐」应用扫描自动入库）
```

对应[部署指南 · 容器与拓扑](./deployment#容器与拓扑自建后端刮削)中的四容器分工；本文展开其中的机制细节。

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
- `pic`——封面地址，供刮削通知使用
- `status` / `progress` / `file_path` / `error_msg`——状态机与结果

音质决策：`brType` / `bit` 指定了就直接用（`bit` 经插件音质枚举反查为 `KW_*` 别名）；**省略则 worker 自动选最高可用**——任务 `brTypes` 与插件枚举求交集、按码率排序取最大；无任何参照时兜底 320k。

### 队列与状态机

SQLite database queue + `queue:work` 单进程串行（下载是重 IO，串行避免磁盘与网络争用）。每个任务由 `DownloadSongJob` 处理，状态机：

```
waiting → loading（解析直链）→ downloading（传输中）→ success
                              ↘ 任一步失败 → error（手动重试回 waiting）
```

`$tries = 1`：不做自动重试，失败即落 `error` 并写明原因，由用户在任务页手动重试（`errorTaskRetry` / `againTask`）——对齐 SQMusic 语义，避免坏任务无限循环打上游。任务管理共 8 个端点：`list`（分页 + 状态筛选）、`del`、`refreshTask`、`errorTaskRetry`、`againTask`、`delErrorTask`、`delWaitingTask`、`delSuccessTask`（⚠️ 沿用 SQMusic「清空全部成功记录」语义，只删记录不删文件）。

### 直链解析

worker 在 `loading` 阶段调用音源插件的直链解析：酷我走 `mobi.kuwo.cn/mobi.s?type=convert_url_with_sign`，`KW_FLAC_2000` 这类对外别名经插件的音质表双向映射为酷我 `br` 值（如 `2000kflac`）。两个关键性质：

- **该接口有大陆 IP 区域限制**（海外返回 `code:407`，server 映射为明确提示）；搜索/详情/歌词则海外可用
- 返回的直链**带签名与时效**（URL 路径含过期时间戳），只能即时解析即时下载，绝不落库

### 文件传输与落盘

进入 `downloading` 后用 Guzzle `sink` **流式写盘**（不占内存），先写 `<最终名>.part` 临时文件：

- 成功：确认任务仍存在（**下载期间被删除 → 直接丢弃文件**，不留垃圾）→ 原子 `rename` 为最终名 → 回写 `success` 与落盘路径
- 失败（HTTP 非 200 / 文件为空）：删临时文件 → `error` + 错误信息

文件名规则：`歌手 - 标题.格式`，格式取直链实际返回的 `format`（酷我部分 128k 实际是 AAC 流，会落成 `.aac`——按真实格式命名）；路径分隔符与 Windows 非法字符替换为下划线，重名自动追加 ` (2)` 序号。

## 下载完成自动刮削（scraper）

### 触发——真值推送而非模糊匹配

worker 落盘成功后，fire-and-forget 地 `POST /mc/api/downloads`，载荷只带**文件名（basename）+ 真值元数据**（歌名 / 歌手 / 专辑 / 封面地址 / kw 歌曲 id）。三个设计要点：

- **推送而非轮询**：server 明确知道自己刚下载了什么，无需 scraper 按文件名猜；scraper 的 `download-tag` job 可多个排队串行，足以消化突发
- **覆盖写而非补空**：体检页对「来历不明」的存量文件用 fill-missing + 置信度评分（≥0.8 才自动写入），因为那是在猜；刚下载的文件元数据是**事实**，标题/歌手/专辑按覆盖写入，上游错值也一并纠正
- **失败降级**：通知失败（scraper 未启动/超时）只记日志、不回滚任务——文件已完整落盘，标签可随时在「音乐库体检」页手动补

路径安全：载荷只接受**纯文件名**（拒绝 `/`、`\`、`..`），scraper 解析后校验必须落在音乐目录内。server 只传 basename 而非绝对路径，server 容器与 scraper 容器对同一宿主机目录的挂载路径不同也不影响。

### 写入流水线（download-tag job）

1. **读现状**：`music-metadata` 读取文件现有标签与封面/歌词有无
2. **构建变更集**：标题/歌手/专辑/专辑歌手逐字段比对，值相同则跳过（酷我文件自带正确基础标签时不产生无意义写入）；嵌封面则拉取图片（限 10MB、必须 `image/*`），嵌歌词则调用 server 歌词接口（酷我加密歌词解密 + 服务端永久缓存——该接口有按 IP 分钟级限流）
3. **执行写入**：`taglib-wasm` 打开文件字节 → 逐字段写入 → 封面以 FrontCover 嵌入、歌词以 USLT 帧嵌入 → 保存
4. **安全三件套**（沿用体检页策略）：写前备份原文件到 `.mc-backup/`（点开头目录，fnOS 扫描忽略）；写出的字节先落同目录 `.mc-tmp` 再原子 rename，写一半不会损坏原文件；封面/歌词**拉取失败自动降级跳过**，不阻断标签写入

行为开关复用体检配置：`embedCover` / `embedLyrics` / `backup`。重命名不参与——文件名在 server 侧已按「歌手 - 标题」生成。

### 闭环终点

写完的文件就在 fnOS「音乐」应用扫描的目录里，应用自动扫描入库，封面与歌词直接展示。

## 实测边界行为

- **AAC 情形**：酷我部分歌曲的「128k mp3」实际返回 AAC 编码流，worker 按直链实际 `format` 落盘为 `.aac`（scraper 对其写标签已验证成功；fnOS 对 `.aac` 的支持以实际版本为准）
- **体积参考**：晴天 128k 原始约 4.3 MB，刮削后 +119 KB（封面 106 KB + 歌词约 8.7K 字符）
- **上游一致性**：基础标签（标题/歌手/专辑）与真值一致时，job 变更集只剩 albumArtist/cover/lyrics 三项——无变化跳过的守卫在起作用
- **直链时效**：签名直链过期后下载会失败，此时重试任务会重新解析新直链（`refreshTask` / `errorTaskRetry` 均可）

## 参考实现

| 文件 | 内容 |
| --- | --- |
| `server/app/Jobs/DownloadSongJob.php` | 下载 worker：状态机、音质决策、流式落盘、刮削通知 |
| `server/app/Services/DownloadTaskService.php` | 任务创建与专辑/歌手展开 |
| `server/app/Plugins/Sources/Kuwo/KuwoPlugin.php` | 酷我直链解析（KW_* ↔ br 映射） |
| `scraper/src/downloads.ts` | 下载刮削载荷校验、路径防护、真值写标签计划 |
| `scraper/src/writer.ts` | taglib-wasm 写入、备份与原子替换 |
| `server/docs/kuwo-api-notes.md` | 酷我接口实测口径（加密、限流、区域限制） |
