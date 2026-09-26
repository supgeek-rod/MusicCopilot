import { request } from './http'
import type {
  AlbumInfo,
  AlbumRecord,
  AlbumSearchPage,
  ArtistInfo,
  ArtistRecord,
  ArtistSearchPage,
  DownloadUrlInfo,
  LyricData,
  SongRecord,
  SongSearchPage,
  TaskList,
} from './types'

export const musicApi = {
  /** 搜索联想词 */
  searchTips: (plugName: string, keyword: string) =>
    request<string[]>({
      url: '/api/v2/search/tips',
      method: 'GET',
      params: { plugName, keyword, _t: Date.now() },
    }),

  /** 搜索单曲（统一分页 {items,total,page,pageSize}） */
  searchSong: (plugName: string, keyword: string, page = 1, pageSize = 30) =>
    request<SongSearchPage>({
      url: '/api/v2/search/songs',
      method: 'GET',
      params: { plugName, keyword, page, pageSize },
    }),

  /** 搜索歌手 */
  searchArtist: (plugName: string, keyword: string, page = 1, pageSize = 20) =>
    request<ArtistSearchPage>({
      url: '/api/v2/search/artists',
      method: 'GET',
      params: { plugName, keyword, page, pageSize },
    }),

  /** 搜索专辑 */
  searchAlbum: (plugName: string, keyword: string, page = 1, pageSize = 20) =>
    request<AlbumSearchPage>({
      url: '/api/v2/search/albums',
      method: 'GET',
      params: { plugName, keyword, page, pageSize },
    }),

  /** 歌手详情（响应自带该歌手全部专辑 albums） */
  artistAlbums: (plugName: string, id: number | string) =>
    request<ArtistInfo>({
      url: `/api/v2/artists/${id}/albums`,
      method: 'GET',
      params: { plugName },
    }),

  /** 专辑详情（响应自带曲目列表 songs，条目与搜索记录同为 SongRecord） */
  albumShow: (plugName: string, id: number | string) =>
    request<AlbumInfo>({
      url: `/api/v2/albums/${id}`,
      method: 'GET',
      params: { plugName },
    }),

  /** LRC 歌词（V2 回归标准 JSON 体 {lyric}） */
  getLyric: async (plugName: string, id: number | string): Promise<string> => {
    const data = await request<LyricData>({
      url: `/api/v2/songs/${id}/lyric`,
      method: 'GET',
      params: { plugName },
    })
    return data?.lyric ?? ''
  },

  /** 获取下载/试听直链（⚠️ 酷我直链有大陆 IP 区域限制） */
  getDownloadUrl: (plugName: string, id: number | string, brType: string) =>
    request<DownloadUrlInfo>({
      url: `/api/v2/songs/${id}/download-url`,
      method: 'GET',
      params: { plugName, brType },
    }),

  /** 创建单曲下载任务：body 为统一 SongRecord，brType 省略时后端自动选最高音质 */
  downloadSong: (song: SongRecord, brType?: string) => {
    const data: Record<string, unknown> = { ...song }
    if (brType) data.brType = brType
    return request<TaskList>({ url: '/api/v2/downloads/songs', method: 'POST', data })
  },

  /** 整张专辑批量下载：bit 为整数码率（如 2000），省略用默认音质；返回创建的任务数组 */
  downloadAlbum: (album: AlbumRecord, bit?: number) => {
    const data: Record<string, unknown> = { ...album }
    if (bit) data.bit = bit
    return request<TaskList>({ url: '/api/v2/downloads/albums', method: 'POST', data })
  },

  /** 下载歌手全部专辑：专辑多，入队异步展开（202），任务在列表中渐进出现 */
  downloadArtistAlbums: (plugName: string, artistId: number | string, bit?: number) =>
    request<{ queued: boolean }>({
      url: `/api/v2/downloads/artists/${artistId}`,
      method: 'POST',
      params: { plugName, ...(bit ? { bit } : {}) },
    }),
}
