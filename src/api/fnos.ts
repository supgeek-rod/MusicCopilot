import axios, { AxiosError } from 'axios'
import { sha256Hex } from '@/lib/sha256'
import type {
  FnosAlbum,
  FnosArtist,
  FnosEnvelope,
  FnosGenre,
  FnosLyricData,
  FnosLoginData,
  FnosPage,
  FnosPlaylist,
  FnosTrack,
  FnosUser,
} from './fnosTypes'
import { ApiError } from './http'

/**
 * fnOS 音乐 API 客户端：经同源 /fnos 反代直连 fnOS 网关（dev 走 Vite proxy，
 * 生产走 nginx / Companion），与 SQ Music 的 http.ts 互相独立 —— 鉴权方式
 * （Cookie music-token）与成功码（code==0）均不同，见 docs/architecture.md 决策 #8。
 */
const FNAS_BASE = '/fnos/music/api/v1'
const TOKEN_COOKIE = 'music-token'
const DEVICE_KEY = 'music-copilot:fnos-device'

/** 由 fnos store 在启动时绑定（与 http.ts 的 httpRuntime 同款解耦模式） */
export const fnosRuntime = {
  /** 会话失效（HTTP 401 或 code==401）时静默重登，成功返回 true */
  relogin: async () => false,
}

const fnosHttp = axios.create({ timeout: 30000 })

type RetriableConfig = Parameters<typeof fnosHttp.request>[0] & { __fnosRetried?: boolean }

type FnosErrorBody = { msg?: string | null }

function normalizeError(error: unknown): ApiError {
  if (axios.isAxiosError<FnosErrorBody>(error)) {
    if (!error.response) {
      return new ApiError('无法连接飞牛音乐服务，请检查 MC_FNOS_BASE_URL 与网络')
    }
    const msg = error.response.data?.msg || `飞牛音乐接口请求失败（HTTP ${error.response.status}）`
    return new ApiError(msg, error.response.status)
  }
  return error instanceof ApiError ? error : new ApiError(String(error))
}

/** 发起请求并解包 fnOS 信封；会话失效自动重登一次后重放原请求 */
async function fnosRequest<T>(config: RetriableConfig): Promise<T> {
  let res
  try {
    res = await fnosHttp.request<FnosEnvelope<T>>(config)
  } catch (error) {
    if (
      axios.isAxiosError(error) &&
      error.response?.status === 401 &&
      !(config as RetriableConfig).__fnosRetried &&
      (await fnosRuntime.relogin())
    ) {
      config.__fnosRetried = true
      return fnosRequest<T>(config)
    }
    throw normalizeError(error)
  }
  const body = res.data
  if (body && typeof body === 'object' && 'code' in body) {
    if (body.code === 0) return body.data
    if (body.code === 401 || /INVALID TOKEN/i.test(body.msg ?? '')) {
      if (!(config as RetriableConfig).__fnosRetried && (await fnosRuntime.relogin())) {
        config.__fnosRetried = true
        return fnosRequest<T>(config)
      }
      throw new ApiError('飞牛音乐登录已失效，自动重新登录失败，请检查 MC_FNOS_* 配置', res.status, body.code)
    }
    throw new ApiError(body.msg || `飞牛音乐接口返回错误（code=${body.code}）`, res.status, body.code)
  }
  return body as unknown as T
}

function get<T>(path: string, params?: Record<string, string | number>): Promise<T> {
  return fnosRequest<T>({ method: 'GET', url: `${FNAS_BASE}${path}`, params })
}

// ── 会话（Cookie 由前端自行维护：登录接口不返回 Set-Cookie）──

export function setFnosTokenCookie(token: string): void {
  document.cookie = `${TOKEN_COOKIE}=${token}; path=/; SameSite=Lax; max-age=${60 * 60 * 24 * 30}`
}

export function clearFnosTokenCookie(): void {
  document.cookie = `${TOKEN_COOKIE}=; path=/; SameSite=Lax; max-age=0`
}

/** 设备 ID：32 位 hex，首次生成后持久化（登录参数，服务端用于会话区分） */
function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY)
  if (!id || !/^[0-9a-f]{32}$/.test(id)) {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    id = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
    localStorage.setItem(DEVICE_KEY, id)
  }
  return id
}

/** 账号密码登录（密码以 SHA-256 hex 提交，与官方前端一致） */
export async function fnosPasswordLogin(username: string, password: string): Promise<FnosLoginData> {
  const data = await fnosRequest<FnosLoginData>({
    method: 'POST',
    url: `${FNAS_BASE}/user/password-login`,
    data: { username, password: sha256Hex(password), deviceId: getDeviceId() },
  })
  setFnosTokenCookie(data.userToken)
  return data
}

/** 校验当前 Cookie 会话是否有效（轻量探测） */
export function fnosMe(): Promise<FnosUser> {
  return get<FnosUser>('/user/me')
}

// ── 曲库浏览 ──

/** sort 实测支持 `createdAt,desc` 等「字段,方向」格式（服务端回显 sort 字段） */
export function getTrackList(page: number, size: number, sort?: string): Promise<FnosPage<FnosTrack>> {
  return get<FnosPage<FnosTrack>>('/track/list', sort ? { page, size, sort } : { page, size })
}

export function getAlbumList(page: number, size: number): Promise<FnosPage<FnosAlbum>> {
  return get<FnosPage<FnosAlbum>>('/album/list', { page, size })
}

export function getArtistList(page: number, size: number): Promise<FnosPage<FnosArtist>> {
  return get<FnosPage<FnosArtist>>('/artist/list', { page, size })
}

export function getGenreList(page: number, size: number): Promise<FnosPage<FnosGenre>> {
  return get<FnosPage<FnosGenre>>('/genre/list', { page, size })
}

// ── 详情（列表页二级跳转用）──

export function getAlbumDetail(guid: string): Promise<FnosAlbum> {
  return get<FnosAlbum>('/album/detail', { guid })
}

export function getArtistDetail(guid: string): Promise<FnosArtist> {
  return get<FnosArtist>('/artist/detail', { guid })
}

export function getGenreDetail(guid: string): Promise<FnosGenre> {
  return get<FnosGenre>('/genre/detail', { guid })
}

export function getPlaylistDetail(guid: string): Promise<FnosPlaylist> {
  return get<FnosPlaylist>('/playlist/detail', { guid })
}

/** 歌手的专辑列表 */
export function getAlbumsByArtist(artistGuid: string, page: number, size: number): Promise<FnosPage<FnosAlbum>> {
  return get<FnosPage<FnosAlbum>>('/album/artist-detail/list', { artistGUID: artistGuid, page, size })
}

export function getTracksByAlbum(albumGuid: string, page: number, size: number): Promise<FnosPage<FnosTrack>> {
  return get<FnosPage<FnosTrack>>('/track/album-detail/list', { albumGUID: albumGuid, page, size })
}

export function getTracksByArtist(artistGuid: string, page: number, size: number): Promise<FnosPage<FnosTrack>> {
  return get<FnosPage<FnosTrack>>('/track/artist-detail/list', { artistGUID: artistGuid, page, size })
}

export function getTracksByGenre(genreGuid: string, page: number, size: number): Promise<FnosPage<FnosTrack>> {
  return get<FnosPage<FnosTrack>>('/track/genre-detail/list', { genreGUID: genreGuid, page, size })
}

export function getTracksByPlaylist(playlistGuid: string, page: number, size: number): Promise<FnosPage<FnosTrack>> {
  return get<FnosPage<FnosTrack>>('/track/playlist-detail/list', { playlistGUID: playlistGuid, page, size })
}

// ── 库内搜索 ──

export function searchTracks(q: string, page: number, size: number): Promise<FnosPage<FnosTrack>> {
  return get<FnosPage<FnosTrack>>('/search/track', { q, page, size })
}

export function searchAlbums(q: string, page: number, size: number): Promise<FnosPage<FnosAlbum>> {
  return get<FnosPage<FnosAlbum>>('/search/album', { q, page, size })
}

export function searchArtists(q: string, page: number, size: number): Promise<FnosPage<FnosArtist>> {
  return get<FnosPage<FnosArtist>>('/search/artist', { q, page, size })
}

export function searchPlaylists(q: string, page: number, size: number): Promise<FnosPage<FnosPlaylist>> {
  return get<FnosPage<FnosPlaylist>>('/search/playlist', { q, page, size })
}

// ── 歌单 ──

export function getPlaylists(page: number, size: number): Promise<FnosPage<FnosPlaylist>> {
  return get<FnosPage<FnosPlaylist>>('/playlist/list', { page, size })
}

// ── 随机取样（「随便听听」）──

function shuffle<T>(list: T[]): T[] {
  const arr = [...list]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/** 从曲库随机取样：小库整库取回洗牌，大库随机页采样（避免全量拉取） */
export async function getRandomTracks(limit: number): Promise<FnosTrack[]> {
  const head = await get<FnosPage<FnosTrack>>('/track/list', { page: 1, size: 1 })
  const total = head.total ?? 0
  if (!total) return []
  if (total <= 200) {
    const all = await get<FnosPage<FnosTrack>>('/track/list', { page: 1, size: 200 })
    return shuffle(all.list ?? []).slice(0, limit)
  }
  const pages = Math.ceil(total / limit)
  const data = await get<FnosPage<FnosTrack>>('/track/list', {
    page: Math.floor(Math.random() * pages) + 1,
    size: limit,
  })
  return shuffle(data.list ?? [])
}

// ── 歌词 ──

/** 歌词：返回 preferred 指向的 LRC 内容，无歌词返回空串 */
export async function getLyric(trackGuid: string): Promise<string> {
  const data = await get<FnosLyricData>('/lyric/list', { trackGUID: trackGuid })
  if (!data.list?.length) return ''
  const preferred = data.list.find((l) => l.guid === data.preferred)
  return (preferred ?? data.list[0]).content ?? ''
}

// ── 媒体直链（相对路径，经同源反代自动携带 music-token Cookie）──

export function fnosStreamUrl(trackGuid: string): string {
  return `${FNAS_BASE}/track/stream?guid=${encodeURIComponent(trackGuid)}`
}

export function fnosCoverUrl(coverId?: string | null, size = 300): string | null {
  if (!coverId) return null
  return `${FNAS_BASE}/static/cover?coverId=${encodeURIComponent(coverId)}&size=${size}`
}
