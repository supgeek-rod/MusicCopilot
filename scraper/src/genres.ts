import type { Env } from './env.js'

/**
 * 流派增强（A2）：第三方音乐元数据源抽象。实现方按「专辑 + 歌手」查询流派，
 * 无把握（未命中/网络失败/限流）一律返回空串——调用方跳过写入，绝不硬编。
 *
 * 已知源特性（2026-09 实测）：
 * - Deezer：无需 key，限流 50/5s；欧美覆盖完好，华语官方专辑常缺失
 * - Last.fm：需免费 API key（MC_LASTFM_API_KEY），限流 5/s；tags 为用户打标，
 *   华语覆盖较好，但混有非流派 tag（seen live 等）需黑名单过滤
 * - api.deezer.com / ws.audioscrobbler.com 大陆直连均不可达——不可达时静默跳过
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

// 进程内缓存：同专辑的多次查询（体检批量场景）只打一次上游。
// 归属各 provider 实例（不同源、不同 key 的缓存互不污染），key 一律小写。
const TIMEOUT_MS = 8000

function cached(map: Map<string, string>, key: string, query: () => Promise<string>): Promise<string> {
  const k = key.toLowerCase()
  const hit = map.get(k)
  if (hit !== undefined) return Promise.resolve(hit)
  return query().then((genre) => {
    map.set(k, genre)
    return genre
  })
}

/** Last.fm 的 tags 混有大量非流派打标，命中黑名单的跳过 */
const LASTFM_NON_GENRE_TAGS = new Set([
  'seen live', 'seen in concert', 'favorites', 'favourites', 'favorite', 'favourite',
  'loved', 'love at first listen', 'albums i own', 'owned', 'check out', 'genius',
  'legend', 'awesome', 'amazing', 'best of', 'guilty pleasure', 'chill', 'relax',
  'sleep', 'workout', 'rainy day', 'summer', 'sad', 'happy', 'mellow',
])

/** 单元素时 lastfm 把 tag 数组序列化成对象——统一为数组 */
function asArray<T>(v: T[] | T | undefined): T[] {
  if (v === undefined || v === null) return []
  return Array.isArray(v) ? v : [v]
}

export class DeezerGenreProvider implements GenreProvider {
  name = 'deezer'

  private cache = new Map<string, string>()

  async fetchGenre(album: string, artist: string): Promise<string> {
    const albumTrim = album.trim()
    const artistTrim = artist.trim()
    if (albumTrim === '') return ''
    return cached(this.cache, `deezer|${albumTrim}|${artistTrim}`, () => this.query(albumTrim, artistTrim))
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

interface DeezerAlbumHit {
  id: number
  title: string
  artist?: { name?: string }
}

export class LastFmGenreProvider implements GenreProvider {
  name = 'lastfm'

  private cache = new Map<string, string>()

  constructor(private readonly apiKey: string) {}

  async fetchGenre(album: string, artist: string): Promise<string> {
    const albumTrim = album.trim()
    const artistTrim = artist.trim()
    if (albumTrim === '' || artistTrim === '' || this.apiKey === '') return ''
    return cached(this.cache, `lastfm|${albumTrim}|${artistTrim}`, () => this.query(albumTrim, artistTrim))
  }

  private async query(album: string, artist: string): Promise<string> {
    try {
      const url =
        `https://ws.audioscrobbler.com/2.0/?method=album.getinfo` +
        `&api_key=${encodeURIComponent(this.apiKey)}` +
        `&artist=${encodeURIComponent(artist)}&album=${encodeURIComponent(album)}` +
        `&format=json&autocorrect=1`
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
      if (!res.ok) return ''
      const body = (await res.json()) as { error?: number; album?: { tags?: { tag?: unknown } } }
      if (body.error !== undefined || !body.album) return '' // key 无效/未知专辑

      const tags = asArray(body.album.tags?.tag as { name?: string } | { name?: string }[])
      const hit = tags
        .map((t) => (t?.name ?? '').trim())
        .find((n) => n !== '' && !LASTFM_NON_GENRE_TAGS.has(n.toLowerCase()))
      return hit ?? ''
    } catch {
      return ''
    }
  }
}

/**
 * 按顺序查询的流派提供链：第一个返回非空的结果生效（Last.fm tag 质量优先，
 * 未配置 key 或未命中时退 Deezer）。全部落空返回空串。
 */
export class ChainGenreProvider implements GenreProvider {
  name = 'chain'
  constructor(private readonly providers: GenreProvider[]) {}

  async fetchGenre(album: string, artist: string): Promise<string> {
    for (const p of this.providers) {
      const genre = await p.fetchGenre(album, artist).catch(() => '')
      if (genre !== '') return genre
    }
    return ''
  }
}

/** 组装当前启用的流派提供链（env 决定：未配置 Last.fm key 时仅 Deezer） */
export function getGenreProvider(env: Env): GenreProvider | null {
  const providers: GenreProvider[] = []
  if (env.lastfmApiKey !== '') providers.push(new LastFmGenreProvider(env.lastfmApiKey))
  providers.push(new DeezerGenreProvider())
  return new ChainGenreProvider(providers)
}
