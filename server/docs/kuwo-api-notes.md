# 酷我音乐接口调研笔记

> 调研日期：2026-09-10。来源：参考仓库 [59799517/simple_sq_music_plus](https://github.com/59799517/simple_sq_music_plus)
> branch `3.0` 的 `src/main/resources/application-kw.yml` + `v3/plug/kw/hander/NKwSearchHander.java`，
> 并全部经 curl 实测复核。测试样本：晴天（id=228908，周杰伦，专辑叶惠美 id=1293，歌手 id=336）。

## 0. 实测环境与关键结论

- 本机（Windows，Git Bash）出口 IP 在**日本**（走了代理/VPN），家中 NAS 网段 192.168.31.x 为大陆出口。
- **区域限制是本次调研最重要的发现**：

| 环节 | 海外出口（本机） | 大陆出口（NAS 实测） |
| --- | --- | --- |
| 搜索（search.kuwo.cn/r.s） | ✅ 可用 | ✅ 可用 |
| 搜索提示（kuwo.cn/openapi） | ✅ 可用 | ✅ 可用 |
| 歌曲信息（musicpay.kuwo.cn） | ✅ 可用 | ✅ 可用 |
| 歌词（newlyric.kuwo.cn） | ✅ 可用 | ✅ 可用 |
| **直链解析（mobi.kuwo.cn convert_url_with_sign）** | ❌ `code:407` "not available in your region or country due to copyright protection" | ✅ 返回真实直链（经 SQMusic 3.1.20 同端点验证） |
| **直链 CDN 下载（kw-er.kuwo.cn）** | ✅ 可下载（128k mp3 全量 + flac range 206 均成功） | ✅ |

→ 结论：**只有"解析"一步需要大陆出口 IP，文件下载不限区域**。自建服务必须部署在大陆出口环境
（目标部署位置为家中 NAS / Docker，满足条件）。开发期若在海外出口调试直链会得到 407，属预期。

## 1. 音质映射（BrType）

参考实现 `KwBrType` 枚举；SQMusic 对外用 `KW_` 前缀别名，酷我接口用 `br` 值：

| SQMusic brType | 酷我 br 值 | 格式 | 码率 kbps |
| --- | --- | --- | --- |
| KW_MP3_128 | `128kmp3` | mp3 | 128 |
| KW_MP3_192 | `192kmp3` | mp3 | 192 |
| KW_MP3_320 | `320kmp3` | mp3 | 320 |
| KW_APE_1000 | `1000kape` | ape | 1000 |
| KW_FLAC_2000 | `2000kflac` | flac | 2000 |

歌曲实际可用音质来自 `MINFO` 字段（musicpay / 搜索结果都有），格式为分号分隔的
`level:<级别>,bitrate:<码率>,format:<格式>,size:<大小>`，`level:ff` 即无损 flac。
搜索结果里 `N_MINFO` 是重排版本（无损在前）。

注意：大陆直连的搜索结果里还会出现 `format:mgg/mflac/zp`（`level:bcms/zply/zp` 等加密会员格式，
码率 20000-24000），这些**不是** `convert_url_with_sign` 可请求的 br 值，解析时只用 §1 表中五个明文格式；
做"可用音质"清单时应过滤掉加密格式。

## 2. 搜索

`GET http://search.kuwo.cn/r.s`（无需任何鉴权头，海外可用）

```
client=kt
encoding=utf8
rformat=json
mobi=1
vipver=1
pn=<页码，从 0 开始>
rn=<每页条数>
correct=1
all=<关键词，URL 编码>
ft=<music | artist | album>
```

响应外层为大写键：`TOTAL`（总数）、`SHOW`、`PN`、`RN`、`abslist`（数组）。

### ft=music → `abslist[]`（歌曲）

| 字段 | 含义 | 映射建议 |
| --- | --- | --- |
| `MUSICRID` | `MUSIC_<id>` | 歌曲 id = 去掉 `MUSIC_` 前缀 |
| `NAME` / `SONGNAME` | 歌曲名 | name |
| `ARTIST` / `FARTIST` | 歌手（多个用 `&` 连接） | artistName 按 `&` 拆分 |
| `ARTISTID` / `allartistid` | 歌手 id（多个 `&` 连接，可能为 0） | artistIds |
| `ALBUM` / `ALBUMID` | 专辑名 / id（可能为 0/空=无专辑） | albumName / albumId |
| `DURATION` | 秒（SQMusic 契约为毫秒，×1000） | duration |
| `N_MINFO` | 音质清单（无损在前） | brTypes |
| `web_albumpic_short` | 封面相对路径 | 拼 `https://img3.kuwo.cn/star/albumcover/` 前缀，并把 `/120` 替换成 `/500` |
| `web_artistpic_short` | 歌手图相对路径 | 拼 `https://star.kuwo.cn/star/starheads/`，`/120`→`/500` |

### ft=artist → `abslist[]`（歌手）

`ARTIST`、`ARTISTID`、`ALBUMNUM`（专辑数）、`hts_picpath`（歌手图，同样 `/120`→`/500`）。

### ft=album → `albumlist[]`（专辑，注意字段名不同）

`albumid`、`name`、`artist`、`artistid`、`pic`（拼 albumcover 前缀）、`pub`（发行时间）、`musiccnt`、`info`（简介）。

实测注意：搜索相关性排序里翻唱/翻自版本可能排前面，官方原曲靠后（晴天搜索第一条是翻唱），
前端按 `PAY`/`MINFO`/`ARTISTID=0` 过滤或直接按名字+歌手精确匹配。

## 3. 搜索提示

`GET https://kuwo.cn/openapi/v1/www/search/searchKey?key=<关键词>&httpsStatus=1`

返回 `{code:200, data:["RELWORD=晴天\r\nSNUM=9905300\r\nRNUM=1000\r\nTYPE=0", ...]}`，取 `RELWORD=` 后文本。

## 4. 歌曲详情（musicpay，含音质清单）

`GET http://musicpay.kuwo.cn/music.pay`（海外可用）

```
newver=2&uid=0&sid=
android_id=76a84aed3ff799de&from=ar&deviceid=76a84aed3ff799de
ver=11.1.9.1&src=kwplayer_ar_11.1.9.1_kwtest.apk
appuid=2752816366&allpay=1&notrace=0&oaid=bbcdcf642ce70f13
op=query&action=play&signver=new&filter=no&apiversion=2&local=0
quality=H&preload=0
ids=<歌曲id>
```

- 响应 `{"errorcode":0,"result":"ok","songs":[{...}]}`，取 `songs[0]`。
- `songs[0]` 含 `id/name/artist/artistid/album/albumid/duration/MINFO` 等。
- 注意参考实现注释：**该接口返回的 name 与搜索接口的 name 可能不一致**（同一首歌两个接口名字会变），做匹配时要容忍。

## 5. 歌词（newlyric 加密接口）

`GET http://newlyric.kuwo.cn/newlyric.lrc?<参数>`，无明文参数，参数串需加密：

1. 明文：`user=12345,web,web,web&requester=localhost&req=1&rid=MUSIC_<id>&lrcx=1`
2. 对明文逐字节 XOR key `yeelion`（循环使用）
3. Base64 编码 → URL Encode 拼到 `?` 后
4. 响应体：前 10 字节应为 `tp=content`，用 `\r\n\r\n` 分隔头部与数据体
5. 数据体 **zlib inflate**
6. （lrcx 模式）结果再 Base64 解码 → 再 XOR `yeelion` → **gb18030 解码** 为 LRCX 文本
   （不带 `lrcx=1` 时第 6 步直接 gb18030 解码，但实测服务端返回 8 字节空内容，**只有 lrcx=1 可用**）

LRCX 格式：`[ti:晴天][ar:周杰伦][al:叶惠美]` 元信息 + 每行 `<时间,时长>` 逐字标签（卡拉OK时间轴）。
纯 LRC 可由 LRCX 去掉 `<>` 标签生成。实测晴天 lrcx 解出 8716 字符完整歌词。

**⚠️ 服务端限流（实测重点）**：`newlyric` 有按 IP 的分钟级滑动窗口限流，触发后**所有歌曲**
（含此前成功的）统一返回 `TP=ERROR REQUEST`，持续数分钟以上，与 UA / IPv4v6 / 参数重放均无关
（已逐一排除）。低频请求（每次间隔数秒以上）稳定成功，连续十几次后即触发。
实现要求：**歌词是不可变数据，必须永久缓存；请求失败按 30s+ 退避重试；考虑备用歌词源**。
`user=12345,web,web,web&requester=localhost` 为魔法值，改动即报错；`req=1` 取内容、`req=2` 取候选列表（实测返回 `cand_lrc_count=0`）。

## 6. 直链解析（核心，⚠️ 大陆 IP 限制）

`GET https://mobi.kuwo.cn/mobi.s`

```
f=web
user=0
source=kwplayer_ar_5.0.0.0_B_jiakong_vh.apk
type=convert_url_with_sign
rid=<歌曲id>
br=<128kmp3|192kmp3|320kmp3|1000kape|2000kflac>
```

成功：`{"code":200,"data":{"bitrate":320,"duration":269,"format":"mp3","sig":"...","rid":228908,"type":0,"url":"http://kw-er.kuwo.cn/<签名>/<有效期>/resource/.../M800....mp3?bitrate$320&format$mp3&..."}}`
失败（海外）：`{"code":407,"data":{"format":"None","sig":"None","url":"None"},"msg":"...copyright protection"}`

- 直链带签名与时效（URL 路径段含过期时间戳），**不能持久化存储，只能即用即取**。
- 直链 CDN（kw-er.kuwo.cn）不限区域：本机实测 128k mp3 全量下载成功（4.3MB，ID3 头）、
  FLAC range 请求 206 + `fLaC` 头（55397039 字节，与 MINFO 声明的 52.83Mb 一致）。
- `data.url` 文件名前缀与音质对应：`M500`=128k、`M800`=320k、`F000`=flac 2000k。
- 本机发现：家中路由器 LAN 内有代理（192.168.31.11:7890，日本出口）。若环境变量带 `http_proxy`，
  curl 会走代理导致 407；**加 `--noproxy '*'` 直连（家庭宽带大陆出口）即返回 200**——已在本地正向验证
  320kmp3 与 2000kflac 均解析成功。
- 参考实现里还有老接口 `http://nmobi.kuwo.cn/mobi.s?f=kuwo&source=jiakong&q=<DES加密串>`（application-kw.yml 的 `downloadurl`），
  当前 Java 代码已不用（只用 downloadurl2），本次未采用。

## 7. 专辑 / 歌手（search.kuwo.cn/r.s 同族，均海外可用）

- 歌手信息：`stype=artistinfo&artistid=<id>&pcjson=1` → 顶层对象（`name/aartist/albumnum/birthday/...`）
- 歌手专辑列表：`stype=albumlist&artistid=<id>&pn=0&rn=10000&sortby=1&alflac=1&show_copyright_off=1&pcmp4=1&encoding=utf8&plat=pc&vipver=MUSIC_9.1.1.2_BCS2&devid=38668888&pcjson=1` → `albumlist[]`
- 专辑详情：`stype=albuminfo&albumid=<id>&pn=<pn>&rn=<rn>&show_copyright_off=1&alflac=1&pcmp4=1&encoding=utf8&plat=pc&vipver=MUSIC_9.1.1.2_BCS2&devid=38668888&newver=1&pcjson=1` → 顶层专辑元信息 + `musiclist[]`（11 首实测）+ `songnum`
- 歌手单曲列表：`stype=artist2music&artistid=<id>&pn=<pn>&rn=<rn>&sortby=0&...` → `musiclist[]` + `total`

`musiclist[]` 字段与搜索 `abslist` 基本一致（`MINFO/N_MINFO/album/albumId/audio_id` 等）。

## 8. 失效端点记录（勿再用）

| 端点 | 现象 |
| --- | --- |
| `http://www.kuwo.cn/url?...type=convert_url3...`（老 web 直链） | 返回 Nuxt HTML 页面，接口已下线 |
| `https://www.kuwo.cn/api/v1/www/music/playUrl?mid=...` | `"The request is illegal!"`（csrf 校验 + 区域限制） |
| `m.kuwo.cn/newh5/singles/songinfoandlrc`（歌详情+歌词） | `{"status":301,"msg":"音乐查询失败"}`（2026-09 实测不可用） |

## 9. Windows Git Bash 开发坑（curl 验证阶段实测）

1. **mingw64 curl（7.87）会把 argv 里的中文按 GBK 处理**：`--data-urlencode "all=晴天"` 实际发出
   `%c7%e7%cc%ec`（GBK 编码）；`--data-urlencode all@file` 更是直接把参数丢弃。
   bash 变量、脚本参数、node argv 里的中文都还是正确的 UTF-8——只有过 curl argv 这一层坏。
   → **对策：先 `node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$KEY"` 编成 ASCII 再拼 URL**。
2. **Windows 原生 node 不认 MSYS 的 `/tmp`**：mktemp 结果传给 node 前要 `cygpath -m` 转成 `C:/...`。
3. **大 JSON 别走 argv**：完整专辑列表几百 KB，作为 argv 传 node 会报 `Argument list too long`，改用临时文件。
4. **`set -e` 下 `[ cond ] && cmd` 短路会杀脚本**：条件为假时整行返回 1，用 `if` 代替。
5. **sed 替换串里 `&` 是元字符**（代表整个匹配），改 curl 参数时曾被坑出畸形 URL。
6. 本机环境有系统代理（`http://192.168.31.11:7890`，日本出口），测试大陆服务统一加 `--noproxy '*'`。
7. 控制台显示中文乱码只是 GBK 显示问题，数据本身是 UTF-8；验证内容看 `code` 字段或落盘后用 Read 工具看。

## 10. 对 Laravel 13 实现的建议

1. **插件架构**：定义 `SourcePlugin` 接口（searchSong/searchArtist/searchAlbum/albumInfo/artistAlbum/artistSongs/songInfo/lyric/downloadUrl），
   酷我实现为 `KuwoPlugin`；`plugName=kw` 路由到对应插件，为后续 netease/mg 留扩展点。
2. **HTTP 客户端**：Guzzle/Laravel HTTP Client 封装 r.s / musicpay / mobi / newlyric 四个 client，超时与重试统一；
   歌词加密用 PHP `openssl`/纯 PHP XOR + `gzinflate` 实现（无额外扩展依赖）。
3. **brType 枚举**：`KwBrType`（128kmp3…2000kflac）与对外 `KW_*` 别名双向映射；`MINFO` 解析成可用音质清单。
4. **契约对齐 SQMusic**：`{code,msg,data}` 信封（code=200 成功）、登录 `device` 字段、`sqmusic` token 头、
   `pageIndex/pageSize` 分页、`getDownloadUrl` 需要完整歌曲对象 + brType —— 保证 MusicCopilot 前端零改动切换。
5. **下载队列**：database queue（SQLite）+ `queue:work`，Docker 里单独一个 worker 进程；
   直链即时解析即时下载（URL 有时效不能落库长期保存），任务表只存状态/路径/音质。
6. **部署**：Docker 镜像 `php:8.3-fpm` + nginx（或 FrankenPHP），容器需部署在大陆出口环境，否则直链 407。
