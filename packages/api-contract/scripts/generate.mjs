// 从 MusicCopilotServer 的 OpenAPI 规范生成契约类型（index.d.ts）。
// 规范来源优先级：
//   1. 环境变量 MC_API_SPEC（文件路径或 http(s) URL）
//   2. 同级目录的 MusicCopilotServer/openapi.json（后端仓库根，scramble:export 产物）
//   3. 本地运行中的后端 http://127.0.0.1:8097/docs/api.json
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import openapiTS, { astToString } from 'openapi-typescript'

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(pkgDir, '../..')
const siblingSpec = resolve(repoRoot, 'server/openapi.json')
const fallbackUrl = 'http://127.0.0.1:8097/docs/api.json'

async function loadSpec() {
  const source = process.env.MC_API_SPEC
  if (source && /^https?:\/\//.test(source)) {
    const res = await fetch(source)
    if (!res.ok) throw new Error(`拉取规范失败: ${res.status} ${source}`)
    return res.json()
  }
  const path = source ?? (existsSync(siblingSpec) ? siblingSpec : null)
  if (path) {
    console.log(`规范来源: ${path}`)
    return JSON.parse(await readFile(path, 'utf8'))
  }
  console.log(`规范来源: ${fallbackUrl}`)
  const res = await fetch(fallbackUrl)
  if (!res.ok) throw new Error(`拉取规范失败: ${res.status}（后端未启动？先在 laravel/ 下 php artisan serve）`)
  return res.json()
}

const spec = await loadSpec()
const ast = await openapiTS(spec)
const out = resolve(pkgDir, 'index.d.ts')
await writeFile(out, astToString(ast))
console.log(`已生成 ${out}（openapi ${spec.openapi}，${Object.keys(spec.paths ?? {}).length} 个端点）`)
