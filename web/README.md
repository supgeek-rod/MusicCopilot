# MusicCopilot Web 前端

基于 Vue 3 + TypeScript + Vite + shadcn-vue 的音乐搜索与下载 SPA（MusicCopilot monorepo 的前端包，仓库根 [README](../README.md)）。

## 本地开发

```bash
cp .env.example .env   # ⚠️ MC_API_BASE_URL 必填（Vite 把 /api 反代到后端），缺它 dev 启动即失败
npm install
npm run dev            # 默认 http://localhost:5173，端口取 .env 的 MC_WEB_PORT
```

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | Vite 开发服务器（`/api` 反代到 `MC_API_BASE_URL`） |
| `npm run build` | 生成构建信息 + `vue-tsc -b` + 生产构建（含 PWA 资源） |
| `npm run preview` | 本地预览构建产物（同样读取 `MC_*` 变量做反代） |
| `npx shadcn-vue@latest add <组件>` | 添加 UI 组件到 `src/components/ui/` |

## 目录要点

- `src/api/` —— 后端调用收敛层（axios + `{code,msg,data}` 解包），组件内禁止直接 fetch
- `src/stores/` —— Pinia：应用配置与连接状态、播放队列
- `src/views/` `src/components/` —— 页面与业务组件；`src/components/ui/` 为 shadcn-vue 生成件
- `src/lib/` —— 格式化、数据适配（adapter）、富文本净化（DOMPurify）
- `scripts/gen-build-info.mjs` —— 构建前置：生成 `src/build-info.json` 版本指纹
- `Dockerfile` + `docker/` —— 前端镜像（nginx 托管 + `/api` 反代 + 运行时 config.json 生成）

完整功能与实现要点见[文档站功能说明](../docs/features.md)，架构见 [docs/architecture.md](../docs/architecture.md)。
