/**
 * fnOS 音乐应用（trim_music）接口类型。
 * 实测口径见 docs/FNOS_LIBRARY_PLAN.md §3；社区逆向来源：
 * fn-music-bridge（github.com/qianlipp/fn-music-bridge）、FeiNiuMusic（github.com/kuilei0926/FeiNiuMusic）。
 */

/** fnOS 统一响应包裹：code==0 成功（区别于 SQ Music 的 200） */
export interface FnosEnvelope<T> {
  code: number
  msg: string | null
  data: T
}

/** password-login 响应（token 需前端自行写入 music-token Cookie） */
export interface FnosLoginData {
  userToken: string
  user: {
    guid: string
    name: string
    role: string
    lastAccessedAt?: number | null
    createdAt?: number | null
    updatedAt?: number | null
  }
}

export interface FnosUser {
  guid: string
  name: string
  role: string
}

/** 音频规格（部分格式如 DSF 列表接口可能缺省，需 /track/metadata 单查） */
export interface FnosAudioSpec {
  bitDepth?: number | null
  sampleRate?: number | null
  channel?: number | null
  bitrate?: number | null
  codec?: string | null
  container?: string | null
  /** 毫秒 */
  duration?: number | null
  format?: string | null
  path?: string | null
  size?: number | null
}

export interface FnosAlbumRef {
  guid: string
  name: string
  coverId?: string | null
  releaseDate?: string | null
}

export interface FnosArtistRef {
  guid: string
  name: string
  coverId?: string | null
}

/** 曲目（列表/搜索/歌单详情通用结构） */
export interface FnosTrack {
  guid: string
  title: string
  coverId?: string | null
  year?: number | string | null
  discNo?: number | string | null
  trackNo?: number | string | null
  isrc?: string | null
  /** 毫秒 */
  duration?: number | null
  isCue?: boolean | number | string | null
  createdAt?: number | null
  updatedAt?: number | null
  album?: FnosAlbumRef | null
  artists?: FnosArtistRef[] | null
  genres?: { guid: string; name: string }[] | null
  isFavorite?: boolean | number | string | null
  hasLyric?: boolean | number | string | null
  audioSpec?: FnosAudioSpec | null
}

export interface FnosAlbum {
  guid: string
  name: string
  coverId?: string | null
  releaseDate?: string | null
  barcode?: string | null
  /** 服务端可能返回字符串数字 */
  trackCount?: number | string | null
  artists?: FnosArtistRef[] | null
}

export interface FnosArtist {
  guid: string
  name: string
  coverId?: string | null
  trackCount?: number | string | null
  albumCount?: number | string | null
}

export interface FnosGenre {
  guid: string
  name: string
  coverId?: string | null
  trackCount?: number | string | null
}

export interface FnosPlaylist {
  guid: string
  name: string
  coverId?: string | null
  /** 服务端可能返回字符串数字 */
  trackCount?: number | string | null
  createdAt?: number | null
  updatedAt?: number | null
}

/** 列表分页统一结构 */
export interface FnosPage<T> {
  list: T[]
  total: number
  sort?: string
}

export interface FnosLyricItem {
  guid: string
  /** LRC 文本 */
  content: string
  source?: number | string | null
}

export interface FnosLyricData {
  list: FnosLyricItem[]
  preferred?: string | null
}
