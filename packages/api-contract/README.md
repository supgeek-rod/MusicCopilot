# @musiccopilot/api-contract

前后端 API 契约类型包（对应架构文档 `packages/api-contract` 规划）。
类型由 **MusicCopilotServer**（Laravel 后端，Scramble 自动生成的 OpenAPI 3.1 规范）生成，**勿手改 `index.d.ts`**。

## 契约策略（2026-09-11 定，2026-09-26 更新）

- 过渡期（已结束）：接口契约曾与第三方 SQMusic 后端对齐（`{code,msg,data}` 信封、字符串数字等
  历史瑕疵），保证前端零改动切换；**2026-09-26 契约清理完成**，鉴权相关端点与类型已删除；
- 现存契约仍保留历史瑕疵（信封、字符串数字），后续以 `/v2` 前缀出清理版契约
  （真 HTTP 状态码、整数类型、camelCase 统一），前端基于本包生成的类型机械化重写 `src/api/*`。

## 重新生成

```bash
cd packages/api-contract
npm install       # 首次
npm run gen       # 读仓库内 server/openapi.json（或运行中的后端），生成 index.d.ts
```

规范来源优先级：`MC_API_SPEC` 环境变量 → 仓库内 `server/openapi.json` → `http://127.0.0.1:17017/docs/api.json`。

## 使用方式

```ts
import type { paths, components } from '@musiccopilot/api-contract'
```

> 尚未接入 tsconfig paths 与前端 `src/api/*`（待第 5 期切换时一并接管）；
> 当前 `src/api/types.ts` 仍是前端运行时的手写类型。
