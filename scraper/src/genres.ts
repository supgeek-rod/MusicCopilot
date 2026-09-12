import { fetch as undiciFetch, ProxyAgent, type RequestInit as UndiciRequestInit } from 'undici'
import type { Env } from './env.js'

/**
 * 外部 HTTP（流派源）请求层：可选 HTTP 代理（MC_HTTP_PROXY，如 http://192.168.31.11:7890）。
 * 大陆直连 api.deezer.com / ws.audioscrobbler.com 均不可达，经代理即可用；
 * 未配置代理时走全局 fetch（保持直连语义与单测 mock 能力）。
 */
let proxyAgent: ProxyAgent | null = null

/** 配置外部请求代理（进程级，启动时调用一次）；空串/未调用 = 直连 */
export function configureHttpProxy(proxy: string | undefined | null): void {
  const v = (proxy ?? '').trim()
  proxyAgent = v !== '' ? new ProxyAgent(v) : null
}

function httpFetch(url: string, init?: Omit<UndiciRequestInit, 'dispatcher'>): Promise<Response> {
  if (proxyAgent === null) {
    return fetch(url, init as RequestInit)
  }
  return undiciFetch(url, { ...init, dispatcher: proxyAgent } as UndiciRequestInit) as unknown as Promise<Response>
}

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

/**
 * Deezer 流派名按出口区域本地化（日本出口返回 ポップス 等）。
 * 常见日文流派映射为英文规范名；无映射的非 ASCII 名（无法确认语义）跳过不写。
 */
const DEEZER_JA_GENRE_MAP: Record<string, string> = {
  ポップス: 'Pop',
  ロック: 'Rock',
  'J-ポップ': 'J-Pop',
  ヒップホップ: 'Hip-Hop',
  ダンス: 'Dance',
  エレクトロニック: 'Electronic',
  ジャズ: 'Jazz',
  ブルース: 'Blues',
  フォーク: 'Folk',
  カントリー: 'Country',
  クラシック: 'Classical',
  レゲエ: 'Reggae',
  ラテン: 'Latin',
  サウンドトラック: 'Soundtrack',
  アニメ: 'Anime',
  ワールド: 'World',
}

/** 流派名规范化：本地化映射 → 含非 ASCII 且无映射则返回空（防脏数据） */
export function normalizeGenreName(name: string): string {
  const n = name.trim()
  if (n === '') return ''
  const mapped = DEEZER_JA_GENRE_MAP[n] ?? DEEZER_JA_GENRE_MAP[n.toLowerCase()]
  if (mapped) return mapped
  return /^[\x20-\x7E]+$/.test(n) ? n : ''
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
      const searchRes = await httpFetch(`https://api.deezer.com/search/album?q=${q}&limit=5`, {
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

      const detail = (await httpFetch(`https://api.deezer.com/album/${hit.id}`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }).then((r) => r.json())) as { genres?: { data?: { name?: string }[] } }
      // 按流行度顺序取第一个可规范化流派（本地化名映射/跳过）
      for (const g of detail.genres?.data ?? []) {
        const norm = normalizeGenreName(g.name ?? '')
        if (norm !== '') return norm
      }
      return ''
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
      const res = await httpFetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
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
