# @musiccopilot/api-contract

前后端 API 契约类型包（对应架构文档 `packages/api-contract` 规划）。
类型由 **MusicCopilotServer**（Laravel 后端，Scramble 自动生成的 OpenAPI 3.1 规范）生成，**勿手改 `index.d.ts`**。

## 契约策略（2026-09-11 定，2026-09-26 V2 落地）

- 过渡期（已结束）：接口契约曾与第三方 SQMusic 后端对齐（`{code,msg,data}` 信封、字符串数字等
  历史瑕疵），保证前端零改动切换；
- **2026-09-26 API V2 已落地**：`/api/v2/*` 清理版契约（REST 语义、真 HTTP 状态码、整数类型、
  camelCase 统一、分页 `{items,total,page,pageSize}`），旧信封端点已删除，前端 `web/src/api/types.ts`
  已改为从本包生成类型派生（tsconfig paths 接入）。

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

// 常用：直接取 components.schemas 下的 Resource 形态
type Song = components['schemas']['SongResource']
```

> 后端响应结构定义在 `server/app/Http/Resources/V2/` 资源类（Scramble 精确推断进
> components.schemas）；改字段先改资源层，再 `npm run gen`，前端类型随之更新。
