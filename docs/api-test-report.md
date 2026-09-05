# SQ Music 接口测试记忆（2026-09-05 实测）

> 用途：本项目（SQ Music 相关任务）的共享记忆。任何针对该服务的接口调用/开发任务，先读本文档，
> **不要按官方文档的参数名调用**——多数与实际实现不符（详见下文"文档 vs 实际差异"）。

## 环境与认证

- **服务地址**: `http://192.168.31.170:8096`（前端 + API 同源，API 前缀 `/api`）
- **服务端版本**: 3.1.20（`GET /api/config/version`）
- **账号/密码**: admin / admin
- **登录**: `POST /api/config/login`，body `{"username":"admin","password":"admin","device":"web"}`
  - ⚠️ **必须带 `device` 字段**（文档没写），否则报"请填写登录设备类型"
  - 返回 `data.tokenName="sqmusic"`, `data.tokenValue=<JWT>`，有效期 604800s（7天）
- **鉴权**: 所有接口加请求头 `sqmusic: <tokenValue>`
- 接口文档（参数名过时，仅作参考）: https://59799517.github.io/simple_sq_music_plus/#/README
- 源码仓库（branch `3.0`）: https://github.com/59799517/simple_sq_music_plus

## ⚠️ 文档 vs 实际差异（重要）

| 文档写法 | 实际写法 |
|---|---|
| `GET /api/version` | `GET /api/config/version`（/api/version 返回"资源不存在"） |
| `platform=kw` | `plugName=kw` |
| `keywords=xxx` | `keyword=xxx` |
| `currentPage=1` | `pageIndex=1`（分页参数为 `pageSize`/`pageIndex`） |
| `songId` / `quality=128k` | `id` / `brType`（如 `KW_MP3_128`、`KW_FLAC_2000`） |
| `POST /config/isLogin` | 前端用 POST，GET 也可用 |

- 按文档参数调 music 模块会统一返回 `{"msg":null,"code":500}`，不要误判为服务故障。
- 前端实际调用的接口清单可从前端 JS bundle 提取：`/assets/index-*.js` 中 grep `url:ue+Eo` 等。

## ✅ 可用接口（实测通过）

### config 模块
- `POST /api/config/login`（带 device 字段）
- `GET|POST /api/config/isLogin`
- `GET /api/config/version` → "3.1.20"
- `GET /api/config/getCurrentNetwork`（实时网速）
- `GET /api/config/getConfigList`（全部配置项，含插件开关状态）
- `POST /api/config/updateConfig`（body `{"configKey","configValue"}`，实测原值回写 OK）
- `GET /api/config/getOption` → 可用平台: kw / netease / mg / tidal
- `POST /api/config/importSongList`（multipart，字段名 `file`，JSON 数组文件；空数组返回"导入成功"）

### music 模块（kw 平台实测，均正常返回真实数据）
- `GET /api/music/searchTips?plugName=kw&keyword=晴天`
- `GET /api/music/searchSong?plugName=kw&keyword=...&pageSize=3&pageIndex=1`
- `GET /api/music/searchArtist?...`（同上分页参数）
- `GET /api/music/searchAlbum?...`（同上）
- `GET /api/music/artistAlbumById?plugName=kw&id=<artistid>`
- `GET /api/music/albumInfoById?plugName=kw&id=<albumid>`
- `GET /api/music/SongInfoById?plugName=kw&id=<songid>&brType=KW_MP3_128`
- `POST /api/music/getLyric` body `{"id":"228908","plugName":"kw"}` → LRC 文本
- `POST /api/music/getDownloadUrl` → **必须传完整歌曲对象 + brType**（前端做法：搜索结果 record + `brType` 字段，可选 `downloadFormat`）
  - ⚠️ 按文档传 `{"platform","songId","quality"}` 会触发后端 500 NPE：`Cannot invoke "java.util.List.iterator()" because "bits" is null`
  - 成功返回 `data.url` 真实直链、`data.bit`、`data.plugBrTypeId`（如 `kw_mp3_128`）
  - 测试样例歌曲: kw 平台"晴天" id=228908，专辑 id=1293，歌手 id=336

### task 模块
- `POST /api/task/list` body `{downloadMusicname,downloadArtistname,downloadAlbumname,downloadPlugName,downloadStatus,downloadTimeStart,downloadTimeEnd,pageSize,pageIndex}`（字符串筛选条件，可传空串）
- `GET /api/task/refreshTask`（刷新全部任务状态）
- `POST /api/task/refreshTask` body `{"id":n}`（单任务刷新，未实测）
- `GET /api/task/delErrorTask` / `delWaitingTask` / `againTask`（实测通过，当时均无对应状态任务=空操作）
- `POST /api/task/del` body `{"id":n}`（实测通过，真实删除）
- 任务状态值: `success`（还有 waiting/error/downloading 等，服务器当时 22 条全部 success）
- ⚠️ `GET /api/task/delSuccessTask` 会**删光全部成功记录**，慎用

### download 模块
- `POST /api/download/downloadSong`：完整歌曲对象 + `brType`（同 getDownloadUrl），实测真实下载成功（晴天 128k，秒级完成）
- `POST /api/download/downloadAlbum`：专辑对象（注意 `artistName` 是**字符串**不是数组，传数组会 JSON 反序列化错误）；无效 ID 优雅返回 `{"msg":"下载成功","data":[]}` 不建任务
- `POST /api/download/downloadArtistAlbum`：歌手对象；同上
- `POST /api/download/downloadParserText` body `{"text":"晴天 周杰伦"}` → 返回"开始解析并下载"（异步；实测未产生任务）
- `downloadParserTextResult` / `downloadParserUrlResult` 是 **POST**（GET 报 method not supported），结果未验证
- ❌ `POST /api/download/downloadParserUrl` body `{"url":...,"isAudioBook":false,"bookName":"","artist":""}`：
  4 种链接格式全部"解析失败 仅支持qq 酷我 酷狗概念 网易云"（试过 music.163.com 三种写法、kuwo 两种），
  需要真实 App 分享链接（含短码）才能识别，待验证

### monitor 模块
- `GET /api/monitor/list`
- `POST /api/monitor/add` body `{"plugName":"kw","type":"album","enabled":"true","targetId":"1293"}`（实体类 `SqMonitor`）
- `POST /api/monitor/delete` body 同 add（**传对象，不是数组/id**）
- 实测 add→list→delete 全通过

### expand/ali 模块（阿里云盘未授权状态下，接口本身均通）
- `GET /api/expand/ali/getDefaultSavePath` → "备份文件/SqMusic"
- `GET /api/expand/ali/queryAllUploadFile` / `queryAllUploadFileTree` → 空列表
- `GET /api/expand/ali/checkAccessToken` / `getAndSetUserInfo` → "暂无授权信息请重新授权"（业务预期）
- `GET /api/expand/ali/syncOnce` → "正在后台同步！"（无授权时实际无效果）
- `POST /api/expand/ali/getAuthorizationCode` → "没有发现appId请先填写APPID"（需先配置 APPID）
- 未测: `getConfirmCode`、`autoCreateFolder`、`incrementalSync`、`checkFolder`（测试端编码问题未重测）

## ❌ 不可用 / 未开启

| 接口 | 现象 |
|---|---|
| `GET /api/version` | "资源不存在"（路径已变更） |
| `GET /api/task/refreshDownloading` | "资源不存在"，3.1.20 已移除 |
| `POST /api/download/downloadParserUrl` | 各种 URL 均"解析失败 仅支持qq 酷我 酷狗概念 网易云" |
| `kg/*`（酷狗全部） | "酷狗插件未开启"——需先在配置启用酷狗插件 |
| `qqvip/checkQrCodeStatus` | "qqvip插件未开启"（`plug.qqvip.open=false`） |
| `qqvip/refreshQQvipCookie` | 接口通但 cookie 失效，需重新扫码 |
| music 模块按文档参数调用 | 全部 500（参数名不对，见上表） |

## 插件开关状态（getConfigList 实测快照）

- `plug.kw.open=true`、`plug.netease.open=true`、`plug.mg.open=true`、`plug.tidal.open=true`、`plug.qqvip.open=false`
- netease 依赖外部 API 站点列表（`plug.netease.baseurl` 内置多个公共源）

## 未测试 / 有风险未实测

- `GET /api/task/delSuccessTask`（会清空 22 条历史成功记录，禁止随意调用）
- `POST /api/task/errorTaskRetry`（需要失败任务）
- `parser` 废弃模块（`/api/parser/*`，前端仅调 `POST /api/parser/parserUrlInfo`）
- `proxy/tidal`、MCP 端点 `/mcp`、`POST /api/config/logout`
- `downloadParserUrlResult`、`expand/ali` 其余 3 个

## 服务器状态备注

- 服务器有 22 条历史下载任务（Taylor Swift / Michael Jackson / Ed Sheeran 等，全部 success，kw_flac_2000）
- 本地下载路径配置 `system.download.path=/music`
- 并发下载数 `system.download.num=8`
- 历史测试清理情况: 测试任务与监控记录已删除，历史记录完好；`/music` 可能残留一个测试文件"晴天 - 周杰伦.mp3"（删任务不删文件）

## 测试技巧（本项目可复用）

- 服务器响应为 UTF-8，Git Bash 控制台直接输出中文可能乱码（GBK 显示问题，数据本身正常），验证时看 `code` 字段
- 用 Node(v22, 自带 fetch) 发 JSON 请求比 curl+bash 变量拼接可靠（避免 UTF-8 传参被 shell 破坏）；Node 路径 `/c/Users/superod/AppData/Local/hermes/node/node`
- curl 的 `-F file=@路径` 不能用 `/c/tmp/...` 形式（MSYS 不转换），用 `/tmp/...`
- 前端 JS bundle 是最可靠的接口契约来源: `curl http://192.168.31.170:8096/assets/index-*.js` 后 grep `url:ue+` / `/api/`
