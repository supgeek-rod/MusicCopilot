// 生成 src/build-info.json（构建前置步骤，见 package.json 的 build 脚本）。
// 必须在同步代码到部署机之前在本机执行：fnOS-Just4fun 的 Docker 构建上下文
// 没有 .git（rsync 排除），容器内无法现场取 git 信息。
// 文件已加入 .gitignore——生成物不入库，dirty 判断（工作区是否有未提交改动）才准确。
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
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
  // 非 git 环境（如直接分发的源码包）——保持降级值
}

const info = { hash, time: new Date().toISOString(), dirty }
writeFileSync(`${root}/src/build-info.json`, `${JSON.stringify(info, null, 2)}\n`)
console.log(`build-info: ${hash}${dirty ? ' (dirty)' : ''} @ ${info.time}`)
