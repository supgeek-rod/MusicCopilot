import type { Env } from './env.js'

/**
 * 流派增强（A2）：第三方音乐元数据源抽象。实现方按「专辑 + 歌手」查询流派，
 * 无把握（未命中/网络失败/限流）一律返回空串——调用方跳过写入，绝不硬编。
 * Deezer：无需 API key，限流 50 次/5 秒；华语音乐覆盖差（官方专辑常缺失或用
 * 英文标题），欧美音乐覆盖完好。大陆网络直连不可达时静默跳过。
 */
export interface GenreProvider {
  name: string
  fetchGenre(album: string, artist: string): Promise<string>
}

/** 归一化：小写、去空白与常见标点（含中英文括号引号），用于宽松匹配 */
export function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s（）()【】\[\]{}「」『』·・，,。.：:；;！!？?'"'"""\-–—_/~+*&@#$%^|.]+/gu, '')
}

/** 双向包含或相等（归一化后）即视为同一专辑/歌手 */
export function looseMatch(a: string, b: string): boolean {
  const na = normalizeForMatch(a)
  const nb = normalizeForMatch(b)
  if (na === '' || nb === '') return false
  return na === nb || na.includes(nb) || nb.includes(na)
}

interface DeezerAlbumHit {
  id: number
  title: string
  artist?: { name?: string }
}

// 进程内缓存：同专辑的多次查询（体检批量场景）只打一次上游
const cache = new Map<string, string>()
const TIMEOUT_MS = 8000

export class DeezerGenreProvider implements GenreProvider {
  name = 'deezer'

  async fetchGenre(album: string, artist: string): Promise<string> {
    const albumTrim = album.trim()
    const artistTrim = artist.trim()
    if (albumTrim === '') return ''

    const key = `${albumTrim}|${artistTrim}`.toLowerCase()
    const cached = cache.get(key)
    if (cached !== undefined) return cached

    const genre = await this.query(albumTrim, artistTrim)
    cache.set(key, genre)
    return genre
  }

  private async query(album: string, artist: string): Promise<string> {
    try {
      const q = encodeURIComponent(`${album} ${artist}`.trim())
      const searchRes = await fetch(`https://api.deezer.com/search/album?q=${q}&limit=5`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (!searchRes.ok) return ''
      const search = (await searchRes.json()) as { data?: DeezerAlbumHit[] }
      const hit = (search.data ?? []).find(
        (a) =>
          looseMatch(a.title ?? '', album) &&
          (artist === '' || looseMatch(a.artist?.name ?? '', artist)),
      )
      if (!hit) return ''

      const detail = (await fetch(`https://api.deezer.com/album/${hit.id}`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }).then((r) => r.json())) as { genres?: { data?: { name?: string }[] } }
      const first = (detail.genres?.data ?? []).map((g) => (g.name ?? '').trim()).find((n) => n !== '')
      return first ?? ''
    } catch {
      return ''
    }
  }
}

/** 当前启用的流派提供方（A2 本期仅 Deezer，后续可按 env 扩展 Last.fm 等） */
export function getGenreProvider(_env: Env): GenreProvider | null {
  return new DeezerGenreProvider()
}
