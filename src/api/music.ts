import { http, request } from './http'
import type {
  AlbumInfo,
  AlbumRecord,
  AlbumSearchPage,
  AlbumSong,
  ArtistInfo,
  ArtistRecord,
  ArtistSearchPage,
  DownloadUrlInfo,
  SongRecord,
  SongSearchPage,
} from './types'

export const musicApi = {
  /** 搜索联想词 */
  searchTips: (plugName: string, keyword: string) =>
    request<string[]>({
      url: '/api/music/searchTips',
      method: 'GET',
      params: { plugName, keyword, _t: Date.now() },
    }),

  /** 搜索单曲（分页） */
  searchSong: (plugName: string, keyword: string, pageIndex = 1, pageSize = 30) =>
    request<SongSearchPage>({
      url: '/api/music/searchSong',
      method: 'GET',
      params: { plugName, keyword, pageIndex, pageSize },
    }),

  /** 搜索歌手（分页） */
  searchArtist: (plugName: string, keyword: string, pageIndex = 1, pageSize = 20) =>
    request<ArtistSearchPage>({
      url: '/api/music/searchArtist',
      method: 'GET',
      params: { plugName, keyword, pageIndex, pageSize },
    }),

  /** 搜索专辑（分页） */
  searchAlbum: (plugName: string, keyword: string, pageIndex = 1, pageSize = 20) =>
    request<AlbumSearchPage>({
      url: '/api/music/searchAlbum',
      method: 'GET',
      params: { plugName, keyword, pageIndex, pageSize },
    }),

  /** 歌手详情（响应自带该歌手全部专辑 albums） */
  artistAlbumById: (plugName: string, id: string) =>
    request<ArtistInfo>({
      url: '/api/music/artistAlbumById',
      method: 'GET',
      params: { plugName, id },
    }),

  /** 专辑详情（响应自带曲目列表 musics） */
  albumInfoById: (plugName: string, id: string) =>
    request<AlbumInfo>({
      url: '/api/music/albumInfoById',
      method: 'GET',
      params: { plugName, id },
    }),

  /**
   * LRC 歌词。该接口不遵循统一包裹：文本在 msg 字段返回，这里做兼容处理。
   */
  getLyric: async (plugName: string, id: string) => {
    const res = await http.request<unknown>({
      url: '/api/music/getLyric',
      method: 'POST',
      data: { plugName, id },
    })
    // http.request 返回 AxiosResponse，真正的响应体在 data 上
    const body = (res as { data?: unknown }).data ?? res
    if (typeof body === 'string') return body
    const obj = body as { code?: number; msg?: unknown; data?: unknown }
    if (typeof obj?.data === 'string') return obj.data
    if (typeof obj?.msg === 'string') return obj.msg
    return ''
  },

  /** 获取下载/试听直链；brTypes 必传歌曲记录里的音质列表，否则后端解析码率失败 */
  getDownloadUrl: (plugName: string, id: string, brType: string, brTypes: string[] = []) =>
    request<DownloadUrlInfo>({
      url: '/api/music/getDownloadUrl',
      method: 'POST',
      data: { plugName, id, brType, brTypes },
    }),

  /** 创建服务端下载任务：传搜索返回的完整歌曲记录，brType 省略时后端自动选最高音质 */
  downloadSong: (song: SongRecord, brType?: string) => {
    const data: Record<string, unknown> = { ...song }
    if (brType) data.brType = brType
    return request<unknown>({ url: '/api/download/downloadSong', method: 'POST', data })
  },

  /** 整张专辑批量下载：传专辑记录，bit 为整数码率（如 2000），省略用默认音质 */
  downloadAlbum: (album: AlbumRecord, bit?: number) => {
    const data: Record<string, unknown> = { ...album }
    if (bit) data.bit = bit
    return request<unknown>({ url: '/api/download/downloadAlbum', method: 'POST', data })
  },

  /** 下载歌手全部专辑 */
  downloadArtistAlbum: (artist: ArtistRecord, bit?: number) => {
    const data: Record<string, unknown> = { ...artist }
    if (bit) data.bit = bit
    return request<unknown>({ url: '/api/download/downloadArtistAlbum', method: 'POST', data })
  },
}
