# MusicCopilot

基于 **Vue 3 + TypeScript + Vite + shadcn-vue** 的音乐搜索与下载 Web 客户端，对接 [Simple SQ Music Plus](https://github.com/59799517/simple_sq_music_plus) 的 HTTP 接口。

## 功能

- **歌曲搜索**：音源插件切换（酷我 / QQ / 网易云 / 酷狗…，以后端启用列表为准）、搜索联想词、分页、音质标签展示
- **在线试听**：底部迷你播放条，流式播放高音质直链
- **歌词查看**：弹窗展示 LRC 歌词
- **歌曲下载**：
  - 加入**服务器下载队列**（可选音质，默认最高，任务进度在「下载任务」页查看，支持重试 / 删除 / 批量操作）
  - **浏览器直链下载**（选音质后由浏览器保存到本机）
- **深色模式**、任务列表 5 秒轮询自动刷新

## 快速开始

```bash
npm install
npm run dev        # 开发，默认 http://localhost:5173
npm run build      # 构建产物输出到 dist/
npm run preview    # 本地预览构建产物
```

## 后端配置（无需重新构建）

编辑 `public/config.json`（构建后位于 `dist/config.json`，同样可直接修改）：

```json
{
  "baseUrl": "http://192.168.31.170:8096",
  "devProxyTarget": "http://192.168.31.170:8096",
  "username": "admin",
  "password": "admin",
  "autoLogin": true
}
```

| 字段 | 说明 |
| --- | --- |
| `baseUrl` | 后端地址；**留空 `""` 表示同源**（见下方跨域说明） |
| `devProxyTarget` | 仅开发环境生效：`npm run dev` 的 vite 代理转发目标 |
| `username` / `password` | 登录账号密码，启动时自动登录（token 失效也会自动重登） |
| `autoLogin` | 是否自动登录 |

> 注意：配置文件以明文保存密码，请仅在内网可信环境使用。

### 跨域（CORS）说明

- **开发**：默认请求直接发往 `baseUrl`。若后端未开启 CORS，把 `baseUrl` 改为 `""`（空串），请求将走同源路径 `/api` 由 vite 代理转发到 `devProxyTarget`。
- **生产**：若后端未开启 CORS，需将 `dist/` 部署在与后端同源的服务上（例如由 Simple SQ Music Plus 的 Web 容器或同级 nginx 反代托管，并把 `baseUrl` 留空）。

## 目录结构

```
public/config.json     # 运行时配置（后端地址 / 账号）
src/api/               # 接口封装（axios + 统一响应解包 + 403 自动重登）
src/stores/            # Pinia：应用配置登录态 / 播放器
src/views/             # 搜索页、下载任务页
src/components/        # 歌曲列表、下载音质菜单、播放条、歌词弹窗等
src/components/ui/     # shadcn-vue 生成的本地 UI 组件
```
