import { mkdir, readdir, rename, rmdir, stat, unlink } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'
import type { Env } from './env.js'
import { renderLayout, resolveRelocateTarget, type LayoutValues } from './layout.js'

export interface RelocateResult {
  /** relocate 后相对音乐目录的路径；未启用模板或渲染失败时与源相同 */
  relPath: string
  moved: boolean
  /** 移动失败的原因（文件保持原位，不影响已写入的标签） */
  error?: string
}

/**
 * 按 dirTemplate 把已写好标签的文件移动到「歌手/专辑/」两级目录。
 * 设计约束：
 * - 模板为空 = 关闭，原位不动
 * - 渲染失败 / 越界 / 与源相同 → 保持原位并带 error（不抛，标签已写好是主成果）
 * - 目标冲突：同名字节级不同 → 追加序号（"(2)"）防覆盖
 * - 移动后清理源目录（若空），避免留一层空壳
 */
export async function relocateDownload(
  env: Env,
  sourceRel: string,
  template: string,
  values: LayoutValues,
): Promise<RelocateResult> {
  const templateTrimmed = template.trim()
  if (templateTrimmed === '') {
    return { relPath: sourceRel, moved: false }
  }

  try {
    const ext = extname(sourceRel)
    const relTarget = renderLayout(templateTrimmed, { ...values, ext })
    if (!relTarget) {
      return { relPath: sourceRel, moved: false, error: '目录模板渲染结果为空' }
    }

    const targetAbs = resolveRelocateTarget(env, join(env.musicDir, sourceRel), relTarget)
    await mkdir(dirname(targetAbs), { recursive: true })

    // 冲突检查：存在同名文件且内容不同 → 追加序号；内容相同视为重复下载，保留现有并删源
    let finalAbs = targetAbs
    let n = 2
    while (true) {
      const existing = await stat(finalAbs).catch(() => null)
      if (!existing) break
      const same = existing.size === (await stat(join(env.musicDir, sourceRel))).size
      if (same) {
        await rmSafe(join(env.musicDir, sourceRel))
        return { relPath: relOf(env, finalAbs), moved: true, error: '目标已存在同内容文件，丢弃源（重复下载）' }
      }
      finalAbs = targetAbs.replace(/(\.[^.]+)$/, ` (${n})$1`)
      n++
    }

    await rename(join(env.musicDir, sourceRel), finalAbs)
    await cleanEmptyDirs(env, dirname(join(env.musicDir, sourceRel)))

    return { relPath: relOf(env, finalAbs), moved: true }
  } catch (e) {
    return { relPath: sourceRel, moved: false, error: String((e as Error).message ?? e) }
  }
}

function relOf(env: Env, abs: string): string {
  const root = env.musicDir
  const full = abs.startsWith(root) ? abs.slice(root.length) : abs
  return full.replace(/^[\\/]/, '').split('\\').join('/')
}

async function rmSafe(path: string): Promise<void> {
  await unlink(path).catch(() => undefined)
}

/** 自底向上删除空目录（直到音乐目录根），保持根本身不删 */
async function cleanEmptyDirs(env: Env, dir: string): Promise<void> {
  const root = env.musicDir.endsWith('\\') || env.musicDir.endsWith('/') ? env.musicDir.slice(0, -1) : env.musicDir
  let cur = dir
  while (cur.startsWith(root) && cur !== root) {
    const entries = await readdir(cur).catch(() => null)
    if (entries === null || entries.length > 0) break
    await rmdir(cur).catch(() => undefined)
    cur = dirname(cur)
  }
}
