import { stat } from 'node:fs/promises'
import { basename, join, resolve, sep } from 'node:path'
import { parseFile } from 'music-metadata'
import { z } from 'zod'
import type { ScraperConfig } from './config.js'
import type { Env } from './env.js'
import { fetchCover, fetchLyric } from './sources.js'
import type { TagChange, WritePlan } from './writer.js'

/**
 * server/ 下载完成通知（第 5 期 M4 决策：HTTP 推送 + 真值元数据）。
 * 服务端持有下载歌曲的事实元数据（不走体检页的模糊匹配），文件按平铺目录
 * 落在音乐库根（MC_DOWNLOAD_DIR 卷映射 == scraper 的 MC_MUSIC_DIR），
 * 故载荷只带 fileName，由本工具在自己音乐目录下定位文件。
 */
export const downloadTagSchema = z.object({
  /** 服务端落盘的文件名（仅文件名，不含路径） */
  fileName: z.string().min(1),
  plugName: z.string().default('kw'),
  /** 音源歌曲 id（歌词拉取用） */
  musicId: z.string().min(1),
  name: z.string().min(1),
  artist: z.string().nullable().optional(),
  album: z.string().nullable().optional(),
  /** 候选封面地址（嵌入用，10MB 上限同体检） */
  coverUrl: z.string().url().nullable().optional(),
})

export type DownloadTagPayload = z.infer<typeof downloadTagSchema>

/** 解析并校验目标文件：仅允许音乐目录根下的直接文件名（拒绝路径穿越） */
export async function resolveDownloadTarget(env: Env, fileName: string): Promise<string> {
  if (fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
    throw new Error('fileName 仅允许文件名，不接受路径')
  }

  const musicRoot = resolve(env.musicDir)
  const abs = resolve(join(musicRoot, fileName))
  if (!abs.startsWith(musicRoot + sep)) {
    throw new Error('目标文件越出音乐目录')
  }

  const st = await stat(abs).catch(() => null)
  if (st === null || !st.isFile()) {
    throw new Error('目标文件不存在')
  }

  return abs
}

interface CurrentMeta {
  title: string | null
  artist: string | null
  album: string | null
  albumArtist: string | null
  hasCover: boolean
  hasLyrics: boolean
}

async function readCurrentMeta(abs: string): Promise<CurrentMeta> {
  const md = await parseFile(abs, { duration: false })
  const c = md.common
  return {
    title: c.title?.trim() || null,
    artist: c.artist?.trim() || null,
    album: c.album?.trim() || null,
    albumArtist: c.albumartist?.trim() || null,
    hasCover: (c.picture ?? []).length > 0,
    hasLyrics: (c.lyrics ?? []).some((l) => typeof l.text === 'string' && l.text.trim() !== ''),
  }
}

/**
 * 下载文件真值写标签计划：标题/歌手/专辑/专辑歌手按服务端下发元数据**覆盖**写入
 * （区别于体检页 fill-missing——刚下载的文件元数据是事实而非猜测，上游错值也应纠正）；
 * 封面/歌词按配置嵌入（已有则不重复嵌），拉取失败降级跳过不阻断标签写入。
 * 备份沿用 config.backup（写坏可从 .mc-backup 恢复）。
 */
export async function buildDownloadPlan(
  env: Env,
  abs: string,
  payload: DownloadTagPayload,
  config: ScraperConfig,
): Promise<WritePlan> {
  const meta = await readCurrentMeta(abs)
  const changes: TagChange[] = []

  const set = (field: TagChange['field'], current: string | null, to: string | null | undefined): void => {
    const value = (to ?? '').trim()
    if (value === '' || current === value) return
    changes.push({ field, from: current, to: value })
  }
  set('title', meta.title, payload.name)
  set('artist', meta.artist, payload.artist)
  set('album', meta.album, payload.album)
  set('albumArtist', meta.albumArtist, payload.artist)

  const plan: WritePlan = { trackId: 0, relPath: basename(resolve(join(env.musicDir, payload.fileName))), changes }

  if (config.embedCover && payload.coverUrl) {
    try {
      plan.cover = await fetchCover(payload.coverUrl)
      changes.push({ field: 'cover', from: meta.hasCover ? '已有封面' : null, to: '嵌入下载封面' })
    } catch {
      // 封面拉取失败不阻断标签写入（体检页可后续补）
    }
  }

  if (config.embedLyrics) {
    const lyric = await fetchLyric(env.serverUrl, payload.musicId)
    if (lyric !== null) {
      plan.lyric = lyric
      changes.push({ field: 'lyrics', from: meta.hasLyrics ? '已有歌词' : null, to: '嵌入下载歌词' })
    }
  }

  return plan
}
