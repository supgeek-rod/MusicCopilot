/** 后端统一响应包裹 */
export interface ApiResponse<T> {
  code: number
  msg: string | null
  data: T
}

/** 登录接口返回（sa-token 风格） */
export interface LoginInfo {
  tokenName: string
  tokenValue: string
  isLogin?: boolean
  loginId?: unknown
  loginDevice?: string | null
}

/** 音源插件选项（getOption） */
export interface PlugOption {
  label: string
  value: string
}

/** 音质枚举项（getPlugBrTypeList） */
export interface BrTypeInfo {
  id?: string
  value?: string
  type?: string
  bit?: number | string
  plugName?: string
  springName?: string
}

/** 搜索单曲返回的歌曲记录 */
export interface SongRecord {
  id: string
  name: string
  artistName: string[]
  artistids?: string[]
  pic?: string | null
  albumName?: string | null
  albumid?: string | null
  lyric?: string | null
  lyricId?: string | null
  plugName: string
  duration?: string | number | null
  brTypes?: string[]
  dataInfo?: Record<string, unknown>
}

/** searchSong 分页响应 */
export interface SongSearchPage {
  searchKeyWork?: string
  searchIndex?: number
  searchSize?: number
  searchTotal?: number
  records: SongRecord[]
}

/** getDownloadUrl 返回 */
export interface DownloadUrlInfo {
  url: string
  brType: string
  size?: number
  duration?: number
  format?: string
}

export type TaskStatus = 'waiting' | 'downloading' | 'loading' | 'success' | 'error' | (string & {})

/** 下载任务记录（task/list） */
export interface TaskInfo {
  id: number | string
  downloadGid?: string | null
  downloadTime?: string | null
  downloadFile?: string | null
  downloadMusicId?: string | null
  downloadPlugName?: string | null
  downloadBrType?: string | null
  downloadMusicname?: string | null
  downloadArtistname?: string | null
  downloadAlbumname?: string | null
  downloadMsg?: string | null
  /** 入队时的原始歌曲信息（JSON 字符串，各插件结构不同；kw 含 MINFO 音质清单可估大小） */
  downloadMusicInfo?: string | null
  downloadStatus: TaskStatus
  springName?: string | null
  audioBook?: string | null
  downloadUpdateTime?: string | null
  rewriteMp3tag?: string | null
  downloadBits?: string | null
  downloadBrTypes?: string[] | null
}

/** task/list 分页响应（MyBatis-Plus 风格） */
export interface TaskPage {
  records: TaskInfo[]
  total: number
  size: number
  current: number
  pages: number
}

/** fnOS 音乐库接入配置（config.json 的 fnos 字段，MC_FNOS_* 变量生成） */
export interface FnosAppConfig {
  /** 是否启用音乐库入口（取决于是否配置了 MC_FNOS_BASE_URL） */
  enabled?: boolean
  username?: string
  password?: string
  autoLogin?: boolean
  /** 信息性字段：/fnos 反代目标地址，仅供展示，应用行为不读取 */
  proxyTarget?: string
}

/** 刮削工具接入配置（config.json 的 scraper 字段，MC_SCRAPER_* 变量生成） */
export interface ScraperAppConfig {
  /** 是否启用「音乐库体检」入口（取决于是否配置了 MC_SCRAPER_BASE_URL） */
  enabled?: boolean
  /** 非空时请求带 x-mc-token 头 */
  token?: string
  /** 信息性字段：/mc 反代目标地址，仅供展示，应用行为不读取 */
  proxyTarget?: string
}

/** 应用运行时配置（dev 由 Vite 从 .env 生成；生产为运行时 config.json 文件） */
export interface AppConfig {
  baseUrl?: string
  username?: string
  password?: string
  autoLogin?: boolean
  /** 信息性字段：服务端转发层（Vite / nginx）使用的后端地址，仅供设置面板展示，应用行为不读取 */
  proxyTarget?: string
  /** fnOS 音乐库接入配置（可选：未配置 MC_FNOS_BASE_URL 时无此块） */
  fnos?: FnosAppConfig
  /** 刮削工具接入配置（可选：未配置 MC_SCRAPER_BASE_URL 时无此块） */
  scraper?: ScraperAppConfig
}

/** 搜索歌手返回的记录 */
export interface ArtistRecord {
  artistName: string
  artistid: string
  pic?: string | null
  plugName: string
  /** 专辑数量（字符串数字） */
  total?: string | null
  dataInfo?: Record<string, unknown>
}

/** searchArtist 分页响应 */
export interface ArtistSearchPage {
  records: ArtistRecord[]
  searchTotal?: number
  searchIndex?: number
  searchSize?: number
}

/** searchAlbum 返回的专辑记录（downloadAlbum 使用此结构） */
export interface AlbumRecord {
  albumName: string
  albumid: string
  artistName?: string | null
  artistid?: string | null
  pic?: string | null
  plugName: string
  total?: number | string | null
  dataInfo?: Record<string, unknown>
}

/** searchAlbum 分页响应 */
export interface AlbumSearchPage {
  records: AlbumRecord[]
  searchTotal?: number
  searchIndex?: number
  searchSize?: number
}

/** 歌手详情（artistAlbumById），albums 为该歌手全部专辑 */
export interface ArtistInfo {
  id: string
  musicArtistsName: string
  musicArtistsSex?: string | null
  musicArtistsPhoto?: string | null
  musicArtistsDescribe?: string | null
  musicArtistsAlias?: string | null
  /** 详情风格专辑记录，结构与 AlbumRecord 不同，需适配 */
  albums?: AlbumDetailRecord[] | null
}

/** 专辑详情风格的专辑记录（artistAlbumById.albums 元素） */
export interface AlbumDetailRecord {
  albumId: string
  albumName: string
  albumTime?: string | null
  albumDescribe?: string | null
  albumArtist?: string | null
  albumArtistId?: string | null
  albumImg?: string | null
  dataInfo?: Record<string, unknown>
  /** 结构同 AlbumSong，但实测恒为空数组——歌手页曲目需逐专辑调 albumInfoById 获取 */
  musics?: AlbumSong[] | null
}

/** 专辑详情（albumInfoById），musics 为专辑内曲目 */
export interface AlbumInfo {
  albumId: string
  albumName: string
  albumTime?: string | null
  albumDescribe?: string | null
  albumArtist?: string | null
  albumArtistId?: string | null
  albumImg?: string | null
  dataInfo?: Record<string, unknown>
  musics?: AlbumSong[] | null
}

/** 专辑详情返回的曲目结构（字段命名与搜索接口不同，需适配为 SongRecord） */
export interface AlbumSong {
  id: string
  musicName: string
  musicArtists?: string[] | null
  musicAlbum?: string | null
  musicImage?: string | null
  /** 秒 */
  musicDuration?: number | null
  bits?: string[] | null
  plugName: string
  albumId?: string | null
  artistsIds?: string[] | null
  dataInfo?: Record<string, unknown>
}
