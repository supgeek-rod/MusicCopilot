import { readdir, stat } from 'node:fs/promises'
import { join, relative, extname } from 'node:path'
import { parseFile } from 'music-metadata'
import type { Db } from './db.js'
import type { Env } from './env.js'

const AUDIO_EXTS = new Set(['.mp3', '.flac', '.m4a', '.mp4', '.ogg', '.opus', '.wav', '.wma', '.ape'])
const BACKUP_DIR = '.mc-backup'

export interface ScanSummary {
  added: number
  updated: number
  skipped: number
  removed: number
  errors: { path: string; message: string }[]
}

/** 递归收集音乐文件（跳过 .mc-backup 与隐藏目录），返回绝对路径列表 */
export async function walkMusicDir(musicDir: string): Promise<string[]> {
  const out: string[] = []

  async function walk(dir: string): Promise<void> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === BACKUP_DIR) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
      } else if (entry.isFile() && AUDIO_EXTS.has(extname(entry.name).toLowerCase())) {
        out.push(full)
      }
    }
  }

  await walk(musicDir)
  return out.sort()
}

/**
 * 文件名混乱判定（路线图口径）：base 不含「歌手 - 标题」分隔符，或只有纯数字/序号开头无正文。
 * 仅基于文件名，标签缺标题不在此分类（已有 missing_artist 等覆盖）。
 */
export function isMessyName(fileName: string): boolean {
  const base = fileName.replace(/\.[^.]+$/, '').trim()
  if (base.includes(' - ') || base.includes(' – ') || base.includes(' — ')) return false
  return true
}

export async function scanLibrary(
  env: Env,
  db: Db,
  onProgress: (done: number, total: number, current: string) => void,
): Promise<ScanSummary> {
  const files = await walkMusicDir(env.musicDir)
  const summary: ScanSummary = { added: 0, updated: 0, skipped: 0, removed: 0, errors: [] }
  const now = Date.now()

  for (let i = 0; i < files.length; i++) {
    const abs = files[i]!
    const rel = relative(env.musicDir, abs).replaceAll('\\', '/')
    onProgress(i, files.length, rel)

    let st
    try {
      st = await stat(abs)
    } catch (e) {
      summary.errors.push({ path: rel, message: String((e as Error).message ?? e) })
      continue
    }

    // 增量：size+mtime 未变且已入库则跳过解析
    const existing = db.getTrackByPath(rel)
    if (
      existing &&
      existing.size_bytes === st.size &&
      Math.abs(existing.mtime_ms - st.mtimeMs) < 1000
    ) {
      summary.skipped++
      continue
    }

    try {
      const md = await parseFile(abs, { duration: true })
      const c = md.common
      const hasLyrics = (c.lyrics ?? []).some((l) => typeof l.text === 'string' && l.text.trim() !== '')
      const before = existing !== null
      db.upsertTrack({
        path: rel,
        fileName: rel.split('/').pop() ?? rel,
        ext: extname(abs).toLowerCase().replace('.', ''),
        sizeBytes: st.size,
        mtimeMs: st.mtimeMs,
        title: c.title?.trim() || null,
        artist: c.artist?.trim() || null,
        album: c.album?.trim() || null,
        albumArtist: c.albumartist?.trim() || null,
        genre: c.genre?.length ? c.genre.join(' / ') : null,
        year: c.year ?? null,
        trackNo: c.track?.no ?? null,
        durationSec: md.format.duration ?? null,
        hasCover: (c.picture?.length ?? 0) > 0,
        hasLyrics,
        messyName: isMessyName(rel.split('/').pop() ?? rel),
        codec: md.format.container ?? null,
        bitrate: md.format.bitrate ? Math.round(md.format.bitrate / 1000) : null,
        sampleRate: md.format.sampleRate ?? null,
      })
      before ? summary.updated++ : summary.added++
    } catch (e) {
      summary.errors.push({ path: rel, message: String((e as Error).message ?? e) })
    }
  }

  onProgress(files.length, files.length, '')
  summary.removed = db.pruneTracks(new Set(files.map((f) => relative(env.musicDir, f).replaceAll('\\', '/'))))
  void now
  return summary
}
