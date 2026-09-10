# 回归测试报告（2026-09-11）

> 对象：`development` 分支（merge 31f06bb 并入代码审查两批修复后）
> 方式：`npm run build` / `npm run docs:build` 静态验证 + Vite dev 服务器 + 浏览器（真实后端 http://192.168.31.31:8096 与 fnOS 5666 均在线）端到端实测
> 结论：**发现并修复 3 个问题**（1 个 P0 级缺口 + 2 个合并引入的 BUG），全部复验通过后推送。

## 一、回归发现并修复的问题

### 1. P0-1 / P0-2 修复从未合入 development（流程缺口）
- 现象：浏览器实测音乐库「流派 → 歌单」切换时，歌单 Tab 上叠加渲染流派卡片（Blues）——P0-1 当场复现。
- 根因：CODE_REVIEW.md 标注 P0-1/P0-2「已修复」，但修复只存在于 `fix/library-genre-grid`、`fix/detail-views-race-guards` 分支，二者均未并入 development。
- 处理：cherry-pick 两个提交（1096bd9、c8893be）到 development；浏览器复验歌单 Tab 干净、Album/Artist/FnosCollectionView 守卫就位。
- 教训：修复进度标记应注明「已合入的目标分支」，仅提交到侧分支不算闭环。

### 2. 新用户启动即静音（volume=0）—— commit 8fe528b
- 位置：`src/lib/playQueue.ts` `loadVolume()`（development 3509e1f 引入）。
- 根因：`Number(localStorage.getItem(key))` 在键缺失时得到 `Number(null) === 0`，是有限数、不触发回退分支，导致从未调过音量的用户以 0 音量启动（实测 audio.volume === 0，音量按钮显示「取消静音」）。
- 修复：改用 `Number.parseFloat(localStorage.getItem(VOLUME_KEY) ?? '')`——缺失时得到 NaN，正确回退为 1。
- 复验：清除存储后启动 volume=1；设置 0.42 → 刷新 → store 恢复 0.42、localStorage 值一致。
- 备注：audio 元素音量在下次切歌（playSeq watch）时才同步为恢复值，属既有设计，无碍。

### 3. ArtistPage / AlbumPage 启动即崩（TDZ）—— commit 8fe528b
- 现象：`#/artist/kw/336` 空白（仅「暂无歌曲」），控制台 `Unhandled rejection: Cannot access 'artistSeq' before initialization`。
- 根因：cherry-pick P0-2 补丁时，`let disposed/artistSeq/songsSeq` 声明落在 `watch([plug, artistId], loadAll, { immediate: true })` 之后；immediate 回调在 setup 内同步执行，访问未初始化的 let 变量抛 TDZ 错，组件初始化中断。AlbumPage 同构问题（`loadSeq`），FnosCollectionView 顺序正确不受影响。
- 修复：声明块前移至 watch 注册之前（ArtistPage.vue、AlbumPage.vue，附注释防回归）。
- 复验：歌手页完整渲染（周杰伦 / 45 张专辑 / 3600 首歌曲 / 简介）；专辑页（叶惠美 / 11 首）正常，无未捕获异常。
- 备注：vue-tsc 无法发现 TDZ 类运行时错误，属构建通过但运行崩溃的典型，回归测试价值所在。

## 二、回归通过项（浏览器实测）

| 项目 | 结果 |
| --- | --- |
| 启动自动登录（autoLogin） | ✅ 横幅「已连接｜后端：同源」 |
| 首页 hero 搜索 | ✅ 居中布局、空词禁用搜索按钮 |
| 关键词搜索（周杰伦） | ✅ 结果 3600 条、音质徽章/时长/歌手专辑链接齐全、URL 同步 `?q=`、分页（120 页） |
| 搜索并发序号守卫（P1-5） | ✅ 合并后语义完整（seq 比对丢弃过期响应） |
| 试听播放链路 | ✅ getDownloadUrl 200 → audio 加载（readyState 4）→ 播放推进、PlayerBar 状态同步（歌手/专辑页「♪ 播放中」联动） |
| 音量持久化（P2-6 / 3509e1f） | ✅ 修复后 0→1 回退、0.42 往返一致 |
| 设置页密码 placeholder（P1-3） | ✅ 显示「默认值：已配置（留空表示跟随默认）」，无明文泄漏（设置已迁页，修复重落于 SettingsView.vue） |
| 下载任务页 | ✅ 20 行真实任务、状态徽章、分页、批量操作菜单 |
| 音乐库（fnOS） | ✅ 登录、62 项、歌曲/流派/歌单 Tab 切换、P0-1 复验通过 |
| 歌手 / 专辑详情页（P0-2） | ✅ TDZ 修复后完整渲染、请求序号守卫就位 |
| 下载轮询 | ✅ task/list 15s 周期请求正常；`document.hidden` 跳过为代码级验证 |
| 全局错误监听 | ✅ 全程无 error / unhandledrejection（修复后） |
| `npm run build` | ✅ vue-tsc + vite 通过，vendor 拆分生效（最大 chunk 177 kB） |
| `npm run docs:build` | ✅ VitePress 含死链检查通过 |

## 三、测试环境说明（非应用 BUG）

- 播放首次出现「播放失败」toast：为合成点击（element.click）无用户激活触发浏览器自动播放策略所致；真实点击链路（JS click + 页面内触发）验证播放正常。
- Playwright locator 点击在部分控件上因 actionability 检查超时：elementFromPoint 证实无遮挡层，属测试工具命中判定问题；reka-ui 组件（Tabs 等）需 pointerdown 事件激活，自动化需派发完整指针事件序列。
- dev 服务器 5173 端口被既有进程占用，本次回归全部针对新起实例 5174。

## 四、提交清单（development）

- 31f06bb merge: 代码审查修复批次并入 development（P1 两批 + 冲突取舍）
- 1096bd9 fix(library): 修复歌单 Tab 下重复渲染流派网格（cherry-pick P0-1）
- c8893be fix(views): 专辑/歌手/合集页补齐卸载守卫与请求序号（cherry-pick P0-2）
- 8fe528b fix: 回归测试修复——新用户启动静音与详情页 TDZ 崩溃
