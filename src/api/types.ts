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

/** public/config.json 运行时配置 */
export interface AppConfig {
  baseUrl?: string
  devProxyTarget?: string
  username?: string
  password?: string
  autoLogin?: boolean
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
