# 元数据增强工作报告（目录模板 / A1 / A2）

> 2026-09-13 · 分支 `feature/selfhost-download` · 对应看板 [SELFHOST_DOWNLOAD_PLAN.md](./SELFHOST_DOWNLOAD_PLAN.md) M4 之后的增量增强（D1/D3）

按四项任务依次执行，每项完成并自测通过后独立提交，全部已推送到 `feature/selfhost-download`。

| # | 任务名 | 是否完成 | 备注信息 |
| --- | --- | --- | --- |
| 1 | **下载目录配置模板** | ✅ 完成 | 提交 `de8eb8b` + `eb8e9d4`。`dirTemplate` 默认 `{albumArtist}/{album}/{title} - {albumArtist}.{ext}`，支持 `{albumArtist} {album} {artist} {title} {year} {trackNo}` 变量、空串关闭；scraper 写标签后按模板 relocate（防越界/同名序号/同内容去重/空目录清理），移动后经 server 新增内部端点 `POST /api/internal/download-task/path` 回写任务路径。端到端真机验证：`周杰伦/叶惠美/晴天 - 周杰伦.mp3` + 回写成功 |
| 2 | **A1 元数据增强（年份 + 音轨号）** | ✅ 完成 | 提交 `b95d1a2`。server 专辑曲目结构化输出 `trackNo`（酷我 track 字段）；scraper 真值覆盖写入 `setYear`/`setTrack`。端到端验证：晴天标签 `year=2003`、`track=3` 准确写入。顺带修复 `fetchAlbumContext` 裸 fetch 无鉴权头被 server 403 静默降级的隐藏 bug（改走 `requestJson` 自动登录） |
| 3 | **A2 流派——Deezer** | ✅ 完成 | 提交 `aab3108`。`GenreProvider` 抽象 + `DeezerGenreProvider`（search/album 归一化双维度匹配、进程内缓存、失败静默）+ fill 语义（文件已有流派不覆盖——第三方推断非真值；初版误用覆盖语义，边界验证时抓出并修正）。**实测限制**：api.deezer.com 大陆直连不可达（静默跳过）；华语官方专辑覆盖极差（《叶惠美》官方版未收录、常为翻唱/英文标题），欧美音乐完好 |
| 4 | **A2 流派——Last.fm** | ✅ 完成 | 提交 `1aeadeb`。链式 `ChainGenreProvider`（Last.fm 优先 → Deezer 兜底），`album.getinfo + autocorrect`，tags 黑名单过滤非流派打标（seen live 等），单元素 tag 对象陷阱与错误体防御；顺带修复跨实例缓存污染。**启用需申请免费 API key**（last.fm/api/account/create）填入 NAS `.env` 的 `MC_LASTFM_API_KEY`；大陆直连同样不可达，需代理出口 |

## 质量底线

- server：`php artisan test` **53/53 全绿**（新增内部端点 3 例、trackNo 断言）
- scraper：tsc 0 错误；单测 **17/17 全绿**（目录布局渲染 5、归一化匹配/Last.fm 解析/链式行为 12）
- 每项均有真实端到端或 mock 全链路验证（Deezer/Last.fm 因网络不可达采用 mock 真实结构验证写入链路）

## 遗留待办

1. `feature/selfhost-download` 合并回 `development`——目录模板/A1/A2 需随新镜像重新部署才生效；合并后 NAS `.env` 的 `MC_SCRAPER_IMAGE_TAG` 改回 `development`
2. D2 存量文件批量目录整理（体检页操作，先 dry-run 预览）
3. scraper 容器代理出口支持（两流派源在大陆可用的前提；可先给 compose 注入 `HTTP_PROXY` 并让 node fetch 走 `NODE_USE_ENV_PROXY`，Node 24 支持）
4. 体检页（存量文件）的年份/音轨号补全受限于酷我搜索不含这两字段，需 matcher 增加专辑详情回查后放开
