import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'
import { TagLib } from 'taglib-wasm'
import type { AudioFile } from 'taglib-wasm'
import type { ScraperConfig } from './config.js'
import type { CandidateRow, TrackRow } from './db.js'
import { fetchCover, fetchLyric } from './sources.js'
import type { Env } from './env.js'

export interface TagChange {
  field: 'title' | 'artist' | 'album' | 'albumArtist' | 'cover' | 'lyrics' | 'rename'
  from: string | null
  to: string
}

export interface WritePlan {
  trackId: number
  relPath: string
  changes: TagChange[]
  /** 真实执行时才填充的字节内容 */
  cover?: { data: Uint8Array; mimeType: string }
  lyric?: string
  renameTo?: string // 新文件名（含扩展名）
}

const BACKUP_DIR = '.mc-backup'

let taglibInstance: Awaited<ReturnType<typeof TagLib.initialize>> | null = null

async function getTaglib() {
  taglibInstance ??= await TagLib.initialize()
  return taglibInstance
}

/** 模板变量替换 + Windows/NAS 非法字符清理 */
export function renderRenameTemplate(
  template: string,
  values: { artist: string; title: string; album: string; year: string; trackNo: string },
): string {
  const filled = template
    .replaceAll('{artist}', values.artist)
    .replaceAll('{title}', values.title)
    .replaceAll('{album}', values.album)
    .replaceAll('{year}', values.year)
    .replaceAll('{trackNo}', values.trackNo)
    .trim()
  return filled.replace(/[\\/:*?"<>|]/g, ' ').replace(/[.\s]+$/g, '').trim()
}

/**
 * 生成写入计划：fill-missing 只补空缺；overwrite 覆盖标题/歌手/专辑/专辑歌手。
 * dryRun 不做网络下载（封面/歌词仅描述意图），真实执行才拉取字节。
 */
export async function buildPlan(
  env: Env,
  track: TrackRow,
  candidate: CandidateRow,
  config: ScraperConfig,
  dryRun: boolean,
): Promise<WritePlan> {
  const overwrite = config.writePolicy === 'overwrite'
  const changes: TagChange[] = []

  const setField = (field: TagChange['field'], current: string | null, to: string) => {
    const value = to.trim()
    if (value === '') return
    const skip = overwrite ? false : current !== null && current.trim() !== ''
    if (skip) return
    if (current?.trim() === value) return
    changes.push({ field, from: current, to: value })
  }

  setField('title', track.title, candidate.name)
  setField('artist', track.artist, candidate.artistName.join(' / '))
  setField('album', track.album, candidate.albumName ?? '')
  setField('albumArtist', track.album_artist, candidate.artistName[0] ?? '')

  const wantCover = config.embedCover && candidate.pic !== null && (overwrite || track.has_cover === 0)
  if (wantCover && candidate.pic !== null) {
    changes.push({
      field: 'cover',
      from: track.has_cover ? '已有封面' : null,
      to: dryRun ? `将嵌入候选封面（${candidate.pic}）` : '嵌入候选封面',
    })
  }

  const wantLyrics = config.embedLyrics && (overwrite || track.has_lyrics === 0)
  if (wantLyrics) {
    changes.push({
      field: 'lyrics',
      from: track.has_lyrics ? '已有歌词' : null,
      to: dryRun ? `将下载候选歌词（kw id=${candidate.id}）` : '下载并嵌入候选歌词',
    })
  }

  const plan: WritePlan = { trackId: track.id, relPath: track.path, changes }

  if (!dryRun) {
    if (wantCover && candidate.pic !== null) {
      plan.cover = await fetchCover(candidate.pic)
    }
    if (wantLyrics) {
      const lyric = await fetchLyric(env.serverUrl, candidate.id)
      if (lyric !== null) plan.lyric = lyric
      else plan.changes = plan.changes.filter((c) => c.field !== 'lyrics')
    }
  }

  return plan
}

/** 重命名目标名（配置开关 + 冲突检查由调用方完成） */
export function planRename(
  track: TrackRow,
  candidate: CandidateRow,
  config: ScraperConfig,
): string | undefined {
  if (!config.renameEnabled) return undefined
  const overwrite = config.writePolicy === 'overwrite'
  const written = new Map(planTags(track, candidate, overwrite))
  const artist = written.get('artist') ?? track.artist ?? ''
  const title = written.get('title') ?? track.title ?? ''
  if (artist.trim() === '' || title.trim() === '') return undefined
  const base = renderRenameTemplate(config.renameTemplate, {
    artist,
    title,
    album: written.get('album') ?? track.album ?? '',
    year: track.year !== null ? String(track.year) : '',
    trackNo: track.track_no !== null ? String(track.track_no) : '',
  })
  if (base === '' || base === track.file_name.replace(/\.[^.]+$/, '')) return undefined
  return base + extname(track.file_name)
}

/** 计划实际写入的标签值（供重命名取值），返回 field→value */
function planTags(
  track: TrackRow,
  candidate: CandidateRow,
  overwrite: boolean,
): [TagChange['field'], string][] {
  const out: [TagChange['field'], string][] = []
  const pick = (current: string | null, to: string): string =>
    to.trim() !== '' && (overwrite || current === null || current.trim() === '') ? to : current ?? ''
  out.push(['title', pick(track.title, candidate.name)])
  out.push(['artist', pick(track.artist, candidate.artistName.join(' / '))])
  out.push(['album', pick(track.album, candidate.albumName ?? '')])
  return out
}

export interface ApplyResult {
  status: 'written' | 'skipped'
  message?: string
  renamedTo?: string
  applied: TagChange[]
}

/**
 * 执行写入计划：读文件 → taglib 变更 → save → 备份 → 临时文件原子替换。
 * 无可执行变更时返回 skipped。
 */
export async function applyPlan(
  env: Env,
  plan: WritePlan,
  config: ScraperConfig,
): Promise<ApplyResult> {
  const executable = plan.changes.filter((c) => {
    if (c.field === 'rename') return false
    if (c.field === 'cover') return plan.cover !== undefined
    if (c.field === 'lyrics') return plan.lyric !== undefined
    return true
  })
  if (executable.length === 0) {
    return { status: 'skipped', message: '无可执行变更（字段已齐全或候选缺封面/歌词）', applied: [] }
  }

  const absPath = join(env.musicDir, plan.relPath)
  const taglib = await getTaglib()
  const buf = await readFile(absPath)
  const file: AudioFile = await taglib.open(new Uint8Array(buf))
  try {
    const tag = file.tag()
    for (const change of executable) {
      switch (change.field) {
        case 'title':
          tag.setTitle(change.to)
          break
        case 'artist':
          tag.setArtist(change.to)
          break
        case 'album':
          tag.setAlbum(change.to)
          break
        case 'albumArtist':
          file.setProperty('albumArtist', change.to)
          break
        case 'cover':
          if (plan.cover !== undefined) {
            file.setPictures([
              { data: plan.cover.data, mimeType: plan.cover.mimeType, type: 'FrontCover', description: '' },
            ])
          }
          break
        case 'lyrics':
          if (plan.lyric !== undefined) {
            file.setLyrics([{ text: plan.lyric, description: '', language: 'chi' }])
          }
          break
        case 'rename':
          break
      }
    }

    if (!file.save()) {
      throw new Error('taglib save 失败')
    }
    const out = file.getFileBuffer()
    await mkdir(dirname(join(env.musicDir, BACKUP_DIR)), { recursive: true })

    // 备份保留原始字节（按相对路径镜像目录结构），供误写恢复
    if (config.backup) {
      const backupPath = join(env.musicDir, BACKUP_DIR, plan.relPath)
      await mkdir(dirname(backupPath), { recursive: true })
      await copyFile(absPath, backupPath)
    }

    // 同目录临时文件 + rename，避免写一半损坏原文件
    const tmpPath = `${absPath}.mc-tmp`
    await writeFile(tmpPath, out)
    await rename(tmpPath, absPath)
  } finally {
    file.dispose()
  }

  let renamedTo: string | undefined
  if (plan.renameTo !== undefined && config.renameEnabled) {
    const targetAbs = join(dirname(absPath), plan.renameTo)
    try {
      await rename(absPath, targetAbs)
      renamedTo = plan.renameTo
    } catch {
      // 目标已存在等冲突：保留原文件名，重命名跳过不回滚写入
      renamedTo = undefined
    }
  }

  return { status: 'written', applied: executable, ...(renamedTo !== undefined ? { renamedTo } : {}) }
}
