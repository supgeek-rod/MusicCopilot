import { stat } from 'node:fs/promises'
import { basename, join, resolve, sep } from 'node:path'
import { parseFile } from 'music-metadata'
import { z } from 'zod'
import type { ScraperConfig } from './config.js'
import type { Env } from './env.js'
import { fetchCover, fetchLyric, requestJson } from './sources.js'
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
  /** 服务端下载任务 id（目录重排后回写新路径用，可缺省） */
  taskId: z.number().int().positive().nullable().optional(),
})

export type DownloadTagPayload = z.infer<typeof downloadTagSchema>

/** 专辑上下文（目录布局需要）：来自 server albumInfoById，查不到时逐项可缺省 */
export interface AlbumContext {
  albumArtist: string
  album: string
  year: string
  trackNo: string
}

const albumInfoShape = z.object({
  albumArtist: z.string().nullable().optional(),
  albumName: z.string().nullable().optional(),
  albumTime: z.string().nullable().optional(),
  musics: z
    .array(
      z.object({
        id: z.string(),
        musicName: z.string().nullable().optional(),
        trackNo: z.number().nullable().optional(),
      }),
    )
    .nullable()
    .optional(),
})

/**
 * 回查 server 专辑详情补齐目录布局所需上下文（albumArtist/year/trackNo）。
 * 失败（无专辑 id / 上游异常）返回尽力而为的部分值，调用方据此降级平铺。
 */
export async function fetchAlbumContext(
  env: Env,
  payload: DownloadTagPayload,
): Promise<AlbumContext> {
  const empty: AlbumContext = {
    albumArtist: payload.artist ?? '',
    album: payload.album ?? '',
    year: '',
    trackNo: '',
  }

  // 无专辑信息（散歌）：无从回查
  if (!payload.album) return empty

  try {
    // 先按歌名搜专辑，再取专辑详情定位音轨号（server 契约两步）；
    // 走 requestJson（带 sqmusic 鉴权 + 403 自动登录），裸 fetch 会被 403 静默降级
    const kw = encodeURIComponent(`${payload.album} ${payload.artist ?? ''}`.trim())
    const search = (await requestJson(
      `${env.serverUrl}/api/music/searchAlbum?plugName=${payload.plugName}&keyword=${kw}&pageIndex=1&pageSize=5`,
    )) as { records?: { albumid?: string }[] } | null
    const albumId = search?.records?.[0]?.albumid
    if (!albumId) return empty

    const info = albumInfoShape.parse(
      (await requestJson(
        `${env.serverUrl}/api/music/albumInfoById?plugName=${payload.plugName}&id=${encodeURIComponent(albumId)}`,
      )) ?? {},
    )

    // 音轨号：优先用 server 结构化输出的 trackNo（酷我 track 字段），缺失退列表序号
    const musics = info.musics ?? []
    const idx = musics.findIndex((m) => m.id === payload.musicId)
    const hitTrack = idx >= 0 ? (musics[idx]?.trackNo ?? null) : null
    const trackNo =
      hitTrack !== null && hitTrack > 0 ? String(hitTrack) : idx >= 0 ? String(idx + 1) : ''

    const year = (info.albumTime ?? '').slice(0, 4)
    return {
      albumArtist: (info.albumArtist ?? '').trim() || empty.albumArtist,
      album: (info.albumName ?? '').trim() || empty.album,
      year,
      trackNo,
    }
  } catch {
    return empty
  }
}

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
  year: string | null
  trackNo: string | null
  genre: string | null
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
    year: c.year != null && c.year > 0 ? String(c.year) : null,
    trackNo: c.track?.no != null && c.track.no > 0 ? String(c.track.no) : null,
    genre: c.genre?.find((g) => g.trim() !== '')?.trim() || null,
    hasCover: (c.picture ?? []).length > 0,
    hasLyrics: (c.lyrics ?? []).some((l) => typeof l.text === 'string' && l.text.trim() !== ''),
  }
}

/**
 * 下载文件真值写标签计划：标题/歌手/专辑/专辑歌手/年份/音轨号按**覆盖**写入
 * （区别于体检页 fill-missing——刚下载的文件元数据是事实而非猜测，上游错值也应纠正）；
 * 年份/音轨号来自专辑上下文回查（ctx，可缺省——缺省项跳过不写）；
 * 流派来自第三方源（Deezer 等，fill 语义：文件已有流派不覆盖）；
 * 封面/歌词按配置嵌入（已有则不重复嵌），拉取失败降级跳过不阻断标签写入。
 * 备份沿用 config.backup（写坏可从 .mc-backup 恢复）。
 */
export async function buildDownloadPlan(
  env: Env,
  abs: string,
  payload: DownloadTagPayload,
  config: ScraperConfig,
  ctx?: AlbumContext,
  genreHint?: string,
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
  if (ctx) {
    set('year', meta.year, ctx.year)
    set('trackNo', meta.trackNo, ctx.trackNo)
  }
  // 流派：第三方推断非真值，fill 语义——文件已有流派（不论值是什么）一律不覆盖
  const genre = (genreHint ?? '').trim()
  if (genre !== '' && (meta.genre ?? '') === '') {
    changes.push({ field: 'genre', from: null, to: genre })
  }

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
