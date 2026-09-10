import axios, { AxiosError } from 'axios'
import { ApiError } from './http'

/**
 * 刮削工具（/mc）客户端：对接独立 scraper 容器的 /mc/api（标准 HTTP 状态码 + JSON，
 * 干净契约，无 {code,msg,data} 包裹），见 docs/architecture.md 决策 #9/#10 与
 * docs/META_SCRAPER_PLAN.md。鉴权为可选共享 token（x-mc-token 头）。
 */
export const SCRAPER_BASE = '/mc/api'

/** 由页面在挂载时绑定部署级 token（config.json 的 scraper.token，空串 = 不鉴权） */
export const scraperRuntime = {
  token: '',
}

const scraperHttp = axios.create({ timeout: 30000 })

scraperHttp.interceptors.request.use((config) => {
  if (scraperRuntime.token) config.headers.set('x-mc-token', scraperRuntime.token)
  return config
})

type ErrorBody = { error?: string }

function normalizeError(error: unknown): ApiError {
  if (axios.isAxiosError<ErrorBody>(error)) {
    if (!error.response) {
      return new ApiError('无法连接刮削工具，请检查 MC_SCRAPER_BASE_URL 与网络')
    }
    const msg = error.response.data?.error || `刮削工具接口请求失败（HTTP ${error.response.status}）`
    return new ApiError(msg, error.response.status)
  }
  return error instanceof ApiError ? error : new ApiError(String(error))
}

async function request<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, data?: unknown): Promise<T> {
  try {
    // 统一拼 /mc/api 前缀：axios 相对路径会落到页面自身路径，必须显式带基址
    const res = await scraperHttp.request<T>({ method, url: SCRAPER_BASE + url, ...(data !== undefined ? { data } : {}) })
    return res.data
  } catch (error) {
    throw normalizeError(error)
  }
}

// ── 类型（与 scraper/src 契约一致；干净设计：camelCase、标准状态码）──

export interface ScraperStatus {
  version: string
  musicDir: string
  serverUrl: string
  authEnabled: boolean
  config: ScraperConfig
  stats: {
    tracks: number
    missing_cover: number
    missing_lyrics: number
    missing_album: number
    missing_artist: number
    messy_name: number
    suspect_dup: number
    ignored: number
  }
  lastScanAt: number | null
}

export interface ScraperConfig {
  writePolicy: 'fill-missing' | 'overwrite'
  embedCover: boolean
  embedLyrics: boolean
  renameEnabled: boolean
  renameTemplate: string
  backup: boolean
  minScore: number
  matchConcurrency: number
}

export interface ScraperTrack {
  id: number
  path: string
  fileName: string
  ext: string
  title: string | null
  artist: string | null
  album: string | null
  albumArtist: string | null
  genre: string | null
  year: number | null
  trackNo: number | null
  durationSec: number | null
  hasCover: boolean
  hasLyrics: boolean
  messyName: boolean
  codec: string | null
  bitrateKbps: number | null
  sampleRate: number | null
  sizeBytes: number
  mtimeMs: number
}

export type TrackFilter =
  | 'all'
  | 'missing_cover'
  | 'missing_lyrics'
  | 'missing_album'
  | 'missing_artist'
  | 'messy_name'
  | 'suspect_dup'

export interface TrackPage {
  items: ScraperTrack[]
  total: number
  page: number
  pageSize: number
}

export interface ScraperCandidate {
  id: string
  name: string
  artistName: string[]
  albumName: string | null
  albumid: string | null
  pic: string | null
  durationMs: number | null
  plugName: string
  score: number
  level: 'high' | 'medium' | 'low'
}

export interface MatchResultItem {
  trackId: number
  path: string
  query: string
  candidates: ScraperCandidate[]
  error?: string
}

export interface TagChange {
  field: 'title' | 'artist' | 'album' | 'albumArtist' | 'cover' | 'lyrics' | 'rename'
  from: string | null
  to: string
}

export type WriteItemStatus = 'written' | 'would-write' | 'skipped' | 'error'

export interface WriteItemResult {
  trackId: number
  path: string
  status: WriteItemStatus
  message?: string
  renamedTo?: string
  applied?: TagChange[]
}

export interface ScraperJob {
  id: string
  kind: 'scan' | 'match' | 'write'
  status: 'queued' | 'running' | 'done' | 'error'
  params: Record<string, unknown>
  total: number
  done: number
  errorCount: number
  currentFile: string | null
  result?: {
    added?: number
    updated?: number
    skipped?: number
    removed?: number
    errors?: { path?: string; message: string }[]
    results?: MatchResultItem[]
    dryRun?: boolean
    items?: WriteItemResult[]
  }
  errors: { path?: string; message: string }[]
  errorMessage: string | null
  createdAt: number
  updatedAt: number
}

// ── 接口封装 ──

export const scraperApi = {
  getStatus: () => request<ScraperStatus>('GET', '/status'),

  startScan: () => request<{ jobId: string }>('POST', '/scan'),

  listTracks: (params: { filter?: TrackFilter; search?: string; page?: number; pageSize?: number }) =>
    request<TrackPage>(
      'GET',
      `/tracks?filter=${params.filter ?? 'all'}&search=${encodeURIComponent(params.search ?? '')}` +
        `&page=${params.page ?? 1}&pageSize=${params.pageSize ?? 50}`,
    ),

  match: (trackIds: number[]) => request<{ jobId: string }>('POST', '/match', { trackIds }),

  write: (trackIds: number[], dryRun: boolean, selections: Record<string, number> = {}) =>
    request<{ jobId: string }>('POST', '/write', { trackIds, dryRun, selections }),

  listJobs: () => request<{ items: ScraperJob[] }>('GET', '/jobs'),

  getJob: (id: string) => request<ScraperJob>('GET', `/jobs/${id}`),

  getConfig: () => request<ScraperConfig>('GET', '/config'),

  putConfig: (config: ScraperConfig) => request<ScraperConfig>('PUT', '/config', config),

  ignoreAdd: (trackId: number, reason?: string) =>
    request<{ ok: boolean; path: string }>('POST', '/ignore', { trackId, ...(reason ? { reason } : {}) }),

  ignoreRemove: (trackId: number) => request<{ ok: boolean; path: string }>('DELETE', `/ignore/${trackId}`),
}
