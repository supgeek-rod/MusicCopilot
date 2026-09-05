# AGENTS.md

## 项目说明

本项目围绕 **SQ Music**（simple_sq_music_plus，自部署音乐下载与管理服务）开展工作。

- 服务地址: http://192.168.31.170:8096 （账号 admin / admin）
- 官方接口文档: https://59799517.github.io/simple_sq_music_plus/#/README

## 必读记忆

**调用该服务接口前，必须先阅读 [`docs/api-test-report.md`](docs/api-test-report.md)**。

其中记录了 2026-09-05 的全量接口实测结果，关键结论：

1. **官方文档的参数名普遍过时**（如 `platform`→实际 `plugName`、`keywords`→`keyword`、
   `currentPage`→`pageIndex`、`/api/version`→`/api/config/version`），按文档调用会得到 500。
2. 登录必须带 `device:"web"` 字段；鉴权请求头名为 `sqmusic`。
3. `GET /api/task/delSuccessTask` 会清空服务器全部历史下载记录，**禁止随意调用**；
   `downloadSong`、`downloadAlbum` 等会产生真实下载任务/文件，测试后需用 `POST /api/task/del` 清理。
4. 酷狗插件(kg)未开启、qqvip 未开启且 cookie 失效——相关接口当前不可用属预期状态。
