# MusicCopilot 代码审查与测试记录（2026-09-06）

> 状态：仅记录，供后续排期修复用。
> 检查方式：通读 `src/` 全部业务代码（api / stores / lib / views / components）、构建与部署配置（vite.config / Dockerfile / docker / CI）、`npm run build` 与本地 dev 冒烟测试。
> 后端实测说明：审查当日 `http://192.168.31.31:8096` 不可达（连接超时，本机同网段 192.168.31.12），SQ Music 在线接口未复测；结论基于代码走读 + `docs/api-test-report.md` 记忆。dev 服务器冒烟（config.json 虚拟端点、/api 代理、错误路径）已验证通过。
>
> **修复进度**：
> - P0-1 ✅ 已修复——分支 `fix/library-genre-grid`（commit 5236498）
> - P0-2 ✅ 已修复——分支 `fix/detail-views-race-guards`（commit 88d9f43）
> - P1-1 ~ P1-6 ✅ 已修复（2026-09-10）——分支 `fix/code-review-p1`：
>   - P1-1 `src/lib/sanitize.ts` 补齐无引号事件属性、iframe/object/embed/form/meta/link、`javascript:` 链接过滤（已用 node 验证绕过 payload）
>   - P1-2 `PlayerBar.vue` 上/下一首与自动切歌统一 catch + toast，`togglePlay` 在取链中防重复 jump
>   - P1-3 `SettingsDialog.vue` 密码 placeholder 改为「默认值：已配置」，不再明文展示
>   - P1-4 `docs/configuration.md` 显式标注 config.json 明文凭据下发风险与收敛建议（彻底方案留路线图第 2 期）
>   - P1-5 `SearchView.vue` doSearch 增加请求序号守卫（与 P0-2 同款）
>   - P1-6 `docker/generate-config.sh` 对所有字符串字段做 JSON 转义（`\` 与 `"`）
> - 其余 P2/P3 未处理。
> - 验证：`npm run build`、`npm run docs:build`、`sh -n docker/generate-config.sh` 均通过。
> - P2/P3 第二批 ✅ 已修复（2026-09-10）——同分支 `fix/code-review-p1`：
>   - P2-2 `LibraryView.vue` 加载失败时清空列表并复位 pageIndex/total
>   - P2-4 `QualityMenu.vue` 直链下载提示改中性（说明跨域文件名由浏览器决定）
>   - P2-5 `taskToaster.ts` / `DownloadsView.vue` 轮询在 `document.hidden` 时跳过
>   - P2-6 `player.ts` 新增 `setVolume`，音量持久化到 localStorage（0 静音有效）
>   - P2-8 `DownloadsView.vue` 行内重试/入队按钮增加 `busyTaskId` 防连点
>   - P2-9 `http.ts` 响应拦截器先判 `axios.isCancel`，不再误报连接失败
>   - P2-12 `LibraryView.vue` 登录失败重试改为重跑 `ensureLogin()`，不再整页刷新
>   - O1 `vite.config.ts` Rolldown `advancedChunks` 拆 vendor（vue/reka-ui/axios），单 chunk 542 kB → 最大 176 kB
>   - O2 `nginx-default.conf.template` 开 gzip + `/assets/*` 一年 immutable 缓存
>   - O4 批量删除确认文案带上当前筛选 total 与「不受筛选影响」提示
>   - O5 `shadcn-vue` 移入 devDependencies；`RetriableConfig` 收紧为 `AxiosRequestConfig & { __retried403?: boolean }`
> - 本轮明确不处理：P2-1（无服务端 logout 接口）、P2-3（跨页排序，需拉全量）、P2-7 / P2-10 / P2-13 / P2-14（功能设计变更，另行排期）、P2-11（无害一次性迁移）、O3（首屏并行化，收益小）。

## 结论速览

- `npm run build`（vue-tsc + vite）✅ 通过；有一个 542 kB 单 chunk 警告（见 O1）。
- 未发现会阻塞使用的致命 BUG，但有 **1 个明确的 UI 渲染 BUG**、**2 个与 AGENTS.md 约定相悖的竞态隐患**、若干安全/健壮性/体验问题。
- 优先建议处理：P0-1、P0-2、P1-1、P1-2、P1-4。

---

## P0 明确 BUG

### P0-1 LibraryView：流派网格会在「歌单」Tab 下重复渲染（模板分支错误）
- 位置：`src/views/LibraryView.vue:352`
- 现象：流派卡片的网格用的是 `v-if albums / v-else-if artists / v-else`（兜底分支），
  而「歌单」网格是后面单独的 `v-if="activeTab === 'playlists'"`（第 381 行）。
  因此切到歌单 Tab 时，**流派网格（v-else）和歌单网格会同时渲染**：只要先访问过流派 Tab（genres 数组有数据），歌单页面上方就会叠出一排过期的流派卡片。
- 复现：音乐库 → 流派（有结果）→ 切到歌单。
- 修复建议：把第 352 行的 `v-else` 改为 `v-else-if="activeTab === 'genres'"`。

### P0-2 AlbumPage / ArtistPage / FnsoCollectionView 缺少 `disposed` 守卫与请求时序守卫
- 位置：`src/views/AlbumPage.vue:71`（load）、`src/views/ArtistPage.vue:61,81`（loadAll/loadSongs）、`src/views/FnosCollectionView.vue:58,79`（load/loadTracks）
- 问题 1（与历史崩溃同源）：AGENTS.md 明确要求异步组件卸载后丢弃响应（`disposed` 守卫，否则与路由切换竞态导致 `parentNode null` 渲染崩溃）。SearchView / DownloadsView / LibraryView / LyricDialog 都实现了，但这三个页面完全没有。
- 问题 2（陈旧响应覆盖）：同组件路由复用（如专辑 A → 专辑 B）时 `watch([plug, id])` 重新触发 load，但旧请求仍在途、无序号守卫，后返回的旧数据会覆盖新数据（B 页 URL 显示 A 专辑内容）。
- 问题 3（FnsoCollectionView 特有）：`loadTracks` 开头 `if (loading.value) return`，若上一个合集的曲目请求还在途，新合集的 `loadTracks(true)` 会被直接吞掉——表现为头部已是新合集、曲目列表却是旧数据或空白，且不会自动重试。
- 修复建议：统一引入请求序号（`const seq = ++loadSeq` 后比对）+ 卸载守卫，与 SearchView 同款写法。

---

## P1 建议尽快处理

### P1-1 sanitize.ts 的 HTML 净化可被未加引号的事件属性绕过
- 位置：`src/lib/sanitize.ts:14-16`
- 正则只匹配带引号的 `on*="..."` / `on*='...'`，`<img src=x onerror=alert(1)>`（无引号写法）会原样进入 `v-html`（AlbumPage.vue:244、ArtistPage.vue:284）；`<iframe>`、`javascript:` 链接也未处理。
- 背景：内容来自自有后端，但后端数据本身是从公开音源抓取的简介，不算可信输入。
- 建议：改用 DOMPurify（或至少补充无引号属性、iframe/object/embed、javascript: href 的过滤）。

### P1-2 PlayerBar：切歌/自动下一首的 Promise 拒绝未捕获
- 位置：`src/components/PlayerBar.vue:60`（onEnded → `player.next()`）、模板 153/167 行（`@click="player.prev()"` / `player.next()`）
- `player.jump()` 内部 `getDownloadUrl` 失败会抛错：QueuePanel 里的 jump 有 catch，但 PlayerBar 的自动切歌和上/下一首按钮都没有。结果是一次取链失败 → unhandled promise rejection，自动播放静默停止且无任何用户提示。
- 顺带：`togglePlay` 在 `player.loading` 期间再点击会重复发起 `jump`（重复取链请求）。
- 建议：统一 catch + toast；loading 期间禁用或防抖。

### P1-3 SettingsDialog 把明文密码渲染在输入框 placeholder 里
- 位置：`src/components/SettingsDialog.vue:63,168`
- `defaultPassword` 直接取 `fileConfig.password` 拼进 placeholder（`默认值：admin`），密码明文出现在屏幕上（ shoulder-surfing / 录屏泄漏）。账号与地址做默认值提示是合理的，密码不应展示。
- 建议：placeholder 改为「默认值：已配置」之类；另外本设备覆盖配置把密码明文写 localStorage（设计取舍，与 P1-4 一并按路线图第 2 期处理）。

### P1-4 config.json 将后端明文账号密码下发给任意访问者（已知取舍，建议提权）
- 位置：`vite.config.ts:33-51`（buildAppConfig）、`docker/generate-config.sh:44-59`
- autoLogin / 403 静默重登机制要求浏览器拿到凭据，因此任何能打开页面的局域网用户在 DevTools 里可直接读到 `MC_API_USERNAME/PASSWORD`（config.json 与网络请求里都有）。路线图第 2 期已计划改「登录框 + 记住 token」，建议按期落实；在那之前至少在文档里显式标注该风险。

### P1-5 SearchView 并发搜索竞态（无请求序号守卫）
- 位置：`src/views/SearchView.vue:106-132`
- `disposed` 只防卸载不防并发：loading 期间仍可触发 `watch(plug)` 重搜与顶部导航 `?q=` watch，多个请求并发时「后发先至」会把旧结果、旧 total、旧 pageIndex 覆盖到新查询上。
- 建议：与 P0-2 同款序号守卫。

### P1-6 docker/generate-config.sh 用 heredoc 拼 JSON，特殊字符密码会生成损坏的 config.json
- 位置：`docker/generate-config.sh:44-59`
- 密码含 `"` 或 `\` 时产物 JSON 直接损坏（.env.example 只有文字提醒，无校验），前端 catch 后退化为空配置，表现为 Docker 部署"莫名连不上"。
- 建议：生成时做 JSON 转义（node 一行脚本或 jq），或在入口脚本里对非法字符直接报错退出。

---

## P2 低危 / 体验问题

| # | 位置 | 问题 | 建议 |
|---|------|------|------|
| P2-1 | `src/api/fnos.ts:87` | fnOS `music-token` Cookie 固定 30 天；`fnos store.logout()` 只清 Cookie 不调服务端注销 | 可接受；如有服务端 logout 接口可补 |
| P2-2 | `src/views/LibraryView.vue:98` | 切 Tab / 翻页失败后 `pageIndex`、`total` 不复位：短暂显示「第 3 / 1 页」这类不一致； genres 搜索仅过滤当前页（注释已声明） | 加载成功后再提交 pageIndex；跨页流派过滤属已知限制 |
| P2-3 | `src/views/FnosCollectionView.vue:94` | 专辑曲目按碟号/曲号排序只对**当前页**生效，专辑超过 50 首跨页时顺序乱 | 小概率；可在拿到全部页后统一排序 |
| P2-4 | `src/components/QualityMenu.vue:56` | 浏览器直链下载用 `a.download`，但跨域 URL 该属性被浏览器忽略 → 文件名不受控、行为与「已打开下载链接」提示不符 | 提示语改中性；或经同源反代转发直链 |
| P2-5 | `src/lib/taskToaster.ts:77` / `DownloadsView.vue:126` | 全局 15s 轮询 + 下载页 5s 轮询，页面在后台标签页时也不停 | 用 `document.visibilitychange` 暂停/降频 |
| P2-6 | `src/stores/player.ts:23` | 播放音量不持久化，每次刷新重置为 1 | 持久化到 localStorage |
| P2-7 | `src/stores/player.ts:105` | 试听固定取**最高音质**（如 FLAC 2000K），流量大 | 试听可与偏好音质解耦（如默认 320K），或加「试听音质」设置 |
| P2-8 | `src/views/DownloadsView.vue:308` | 行内「重试/重新入队」按钮仅由 `acting`（确认框流程）禁用，直接点击可连点重复提交 | 复用 `busy` 态或行级 loading |
| P2-9 | `src/api/http.ts:63` | 请求被取消（AbortController）时会误报「无法连接后端服务」——当前代码尚未用到 abort，属潜在坑 | 错误分类时先判 `axios.isCancel` |
| P2-10 | `src/components/LyricDialog.vue:44` | LRC 时间轴被整体剥离成纯文本，无法逐行同步高亮 | 后续可做同步歌词（曲库 fnOS 与在线源都有时间轴数据） |
| P2-11 | `src/stores/app.ts:53` | 每次连接都全量遍历 localStorage 清理 `sqmusic:` 旧键 | 一次性迁移逻辑，无害但可简化 |
| P2-12 | `src/views/LibraryView.vue:202` | fnOS 登录失败「重试」用 `router.go(0)` 整页刷新 | 改为重新调用 `ensureLogin()` + `load(1)` |
| P2-13 | 全局 | 无键盘快捷键（空格播放/暂停、`/` 聚焦搜索）与 MediaSession 集成（锁屏/蓝牙耳机控制） | 体验增强项 |
| P2-14 | `src/views/SearchView.vue` 等 | 搜索联想/历史面板不支持 ↑↓ 键盘选择 | 可访问性增强 |

---

## P3 优化项（非 BUG）

### O1 构建产物单 chunk 542 kB
`npm run build` 输出单个 `index-*.js` 542 kB（gzip 168 kB）。路由级静态 import 是既定约束（AGENTS.md，曾排查过懒加载渲染异常），**不建议**重新拆路由懒加载；可用 rolldown 的 `output.manualChunks`（vite.config `build.rolldownOptions`）把 vue/pinia/reka-ui/axios 等 vendor 拆分，改善缓存命中与首屏解析。

### O2 nginx 模板缺 gzip 与静态资源缓存策略
- `docker/nginx-default.conf.template` 未开 gzip（官方镜像默认注释掉了 `gzip on`），542 kB JS 以未压缩传输；`/assets/*` 是哈希文件名，可加 `expires 1y; immutable`。
- 两行配置即可显著优化 Docker 部署的加载速度。

### O3 首屏串行等待
`app.connect()` 里 `isLogin → login → loadMeta` 串行；`loadMeta`（getOption/getPlugBrTypeList）可与登录并行发起，减少可感知延迟。量级不大，优先级低。

### O4 危险批量操作的确认文案可带影响范围
「删除成功任务」实际会清空服务器上**全部历史**成功记录（含未在当前筛选里显示的，见 api-test-report 警告）。确认框文案已说明，但可显示当前受影响数量（list total）让用户更有感知。

### O5 依赖与工程
- `package.json` 中 `shadcn-vue` 出现在 dependencies（它是 CLI 工具，产物才是运行时依赖）——移到 devDependencies 更干净，不影响构建。
- `RetriableConfig`（http.ts:45）用 `any` 兜底，可换成 `AxiosRequestConfig & { __retried403?: boolean }` 收紧类型。

---

## 验证记录

- `npm run build`：✅ 通过（3.14s，产物见上）。
- `npm run docs:build`：✅ 通过（VitePress 1.6.4，含死链检查，7.38s）。
- dev 冒烟：Vite 5199 端口启动正常；`/config.json` 虚拟端点正确回显 .env（baseUrl 空、proxyTarget 指向 8096、fnos enabled=false）；`/api/*` 代理转发到不可达后端时无崩溃（前端走「无法连接后端服务」横幅路径）。
- SQ Music 在线接口：❌ 未复测（后端 8096 当日不可达）。恢复后建议重点回归：login/isLogin、searchSong、getDownloadUrl、task/list（均只读）。
- 本机网络备注：本机走系统代理时 curl localhost 会得到 502，测试本地服务需 `--noproxy '*'`（与项目无关，记录防坑）。
