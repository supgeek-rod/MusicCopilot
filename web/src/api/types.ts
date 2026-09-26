/**
 * 前端接口类型：全部由 packages/api-contract 的生成类型派生（API V2 契约，
 * openapi-typescript 从 server/openapi.json 生成，勿手改其 index.d.ts）。
 * 字段即后端响应形态——整数就是 number、分页统一 {items,total,page,pageSize}、
 * 搜索条目与专辑曲目为同一 SongRecord（V2 起 adapter 不再需要形态适配）。
 *
 * 生成物更新：cd packages/api-contract && npm run gen
 */
import type { components } from '@musiccopilot/api-contract'

type Schemas = components['schemas']

/** 音源插件选项（/v2/config/options） */
export type PlugOption = Schemas['PlugOptionResource']

/** 音质枚举项（/v2/config/br-types） */
export type BrTypeInfo = Schemas['BrTypeResource']

/**
 * 统一歌曲形态（搜索条目 = 专辑曲目 = 下载创建入参）。
 * id/artistIds/albumId 放宽为 number | string：在线音源（kw）为整数，
 * fnOS 本地曲目用 guid 字符串，二者共用 SongRecord 走播放队列/列表组件；
 * playcnt/trackNo 为在线源热度/曲目序（fnOS 记录缺省）。
 */
export type SongRecord = Omit<
  Schemas['SongResource'],
  'id' | 'artistIds' | 'albumId' | 'playcnt' | 'trackNo'
> & {
  id: number | string
  artistIds: Array<number | string>
  albumId?: number | string | null
  playcnt?: number | null
  trackNo?: number | null
}

/** 歌手搜索记录（/v2/search/artists） */
export type ArtistRecord = Schemas['ArtistResource']

/** 专辑搜索记录（/v2/search/albums；整张专辑下载创建入参） */
export type AlbumRecord = Schemas['AlbumResource']

/** 歌手详情 + 全部专辑（/v2/artists/{id}/albums） */
export type ArtistInfo = Schemas['ArtistDetailResource']

/** 专辑详情 + 曲目（/v2/albums/{id}；songs 为统一 SongRecord） */
export type AlbumInfo = Schemas['AlbumDetailResource']

/** 直链解析结果（/v2/songs/{id}/download-url；duration 统一毫秒） */
export type DownloadUrlInfo = Schemas['DownloadUrlResource']

/** 歌词响应体（/v2/songs/{id}/lyric） */
export type LyricData = Schemas['LyricResource']

/** 下载任务记录（/v2/downloads） */
export type TaskInfo = Schemas['TaskResource']

export type TaskStatus = TaskInfo['status']

/** 统一分页形态 {items, total, page, pageSize} */
export type SongSearchPage = Schemas['SongPageResource']
export type ArtistSearchPage = Schemas['ArtistPageResource']
export type AlbumSearchPage = Schemas['AlbumPageResource']
export type TaskPage = Schemas['TaskPageResource']

/** 下载创建结果（单曲 1 项 / 整张专辑 N 项） */
export type TaskList = Schemas['TaskListResource']

/** fnOS 音乐库接入配置（config.json 的 fnos 字段，MC_FNOS_* 变量生成） */
export interface FnosAppConfig {
  /** 是否启用音乐库入口（取决于是否配置了 MC_FNOS_BASE_URL） */
  enabled?: boolean
  /** 信息性字段：/fnos 反代目标地址，仅供展示，应用行为不读取 */
  proxyTarget?: string
}

/** 应用运行时配置（dev 由 Vite 从 .env 生成；生产为运行时 config.json 文件） */
export interface AppConfig {
  baseUrl?: string
  /** 信息性字段：服务端转发层（Vite / nginx）使用的后端地址，仅供设置面板展示，应用行为不读取 */
  proxyTarget?: string
  /** fnOS 音乐库接入配置（可选：未配置 MC_FNOS_BASE_URL 时无此块） */
  fnos?: FnosAppConfig
}

/** /api/healthcheck 响应：唯一保留历史 {code,msg,data} 信封的端点（探活消费方不变） */
export interface HealthcheckBody {
  code: number
  msg: string | null
  data: null
}
