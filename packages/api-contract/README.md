# @musiccopilot/api-contract

前后端 API 契约类型包（对应架构文档 `packages/api-contract` 规划）。
类型由 **MusicCopilotServer**（Laravel 后端，Scramble 自动生成的 OpenAPI 3.1 规范）生成，**勿手改 `index.d.ts`**。

## 契约策略（2026-09-11 定）

- 过渡期（第 5 期 SQMusic 下线前）：线上的接口契约**保持与 SQMusic 对齐**（含 `{code,msg,data}` 信封、
  字符串数字等历史瑕疵），保证前端零改动切换与双后端对照验证；
- **新端点**（鉴权/歌词/直链/任务）设计时不再复制 SQMusic 瑕疵，干净命名与类型直接进规范；
- SQMusic 退役后：以 `/v2` 前缀出清理版契约（真 HTTP 状态码、整数类型、camelCase 统一），
  前端基于本包生成的类型机械化重写 `src/api/*`。

## 重新生成

```bash
cd packages/api-contract
npm install       # 首次
npm run gen       # 读 ../..//MusicCopilotServer/openapi.json（或运行中的后端），生成 index.d.ts
```

规范来源优先级：`MC_API_SPEC` 环境变量 → 同级 `MusicCopilotServer/openapi.json` → `http://127.0.0.1:8097/docs/api.json`。

## 使用方式

```ts
import type { paths, components } from '@musiccopilot/api-contract'
```

> 尚未接入 tsconfig paths 与前端 `src/api/*`（待第 5 期切换时一并接管）；
> 当前 `src/api/types.ts` 仍是前端运行时的手写类型。
