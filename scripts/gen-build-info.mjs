// 生成 src/build-info.json（构建前置步骤，见 package.json 的 build 脚本）。
// 必须在同步代码到部署机之前在本机执行：fnOS-Just4fun 的 Docker 构建上下文
// 没有 .git（rsync 排除），容器内无法现场取 git 信息。
// 文件已加入 .gitignore——生成物不入库，dirty 判断（工作区是否有未提交改动）才准确。
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

function git(args) {
  return execSync(`git ${args}`, { cwd: root, encoding: 'utf-8' }).trim()
}

let hash = 'dev'
let dirty = false
try {
  hash = git('rev-parse --short HEAD')
  dirty = git('status --porcelain').length > 0
} catch {
  // 非 git 环境（Docker 构建上下文没有 .git）：保留部署机本机预生成的文件不覆盖，
  // 否则版本检测会静默降级 dev（部署流程：本机生成 → 同步 → NAS 构建，见
  // docs/SELFHOST_DOWNLOAD_PLAN.md M5 部署记录）
  const existing = `${root}/src/build-info.json`
  if (existsSync(existing)) {
    const prev = JSON.parse(readFileSync(existing, 'utf-8'))
    console.log(`build-info: 保留已有 ${prev.hash} @ ${prev.time}（非 git 环境不覆盖）`)
    process.exit(0)
  }
}

const info = { hash, time: new Date().toISOString(), dirty }
writeFileSync(`${root}/src/build-info.json`, `${JSON.stringify(info, null, 2)}\n`)
console.log(`build-info: ${hash}${dirty ? ' (dirty)' : ''} @ ${info.time}`)
