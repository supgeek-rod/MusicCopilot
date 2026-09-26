export interface paths {
    "/v2/config/options": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 已注册音源插件清单（value 即 plugName） */
        get: operations["config.options"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/config/br-types": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 各插件可用音质枚举（id 即 brType 键） */
        get: operations["config.brTypes"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/downloads": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 任务列表（分页 + 可选状态筛选） */
        get: operations["download.index"];
        put?: never;
        post?: never;
        /** 批量删除某状态的全部任务记录（status=success ⚠️ 清空全部成功记录） */
        delete: operations["download.destroyByStatus"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/downloads/songs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 单曲下载创建：body 为 V2 统一 Song 对象，brType 省略时 worker 自动选最高音质 */
        post: operations["download.storeSong"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/downloads/albums": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 整张专辑下载创建：同步展开曲目（一次上游请求），返回任务数组 */
        post: operations["download.storeAlbum"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/downloads/artists/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 歌手全部专辑下载创建：专辑多（每张一次上游请求），入队异步展开（202） */
        post: operations["download.storeArtist"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/downloads/retries": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 全部失败任务重试 */
        post: operations["download.retryAll"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/downloads/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** 删除单个任务记录（不删已落盘文件；幂等） */
        delete: operations["download.destroy"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/downloads/{id}/refresh": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 重新入队：等待/解析/传输中卡住的任务重新排队（成功/失败走专门动作） */
        post: operations["download.refresh"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/downloads/{id}/retry": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 重试失败任务 */
        post: operations["download.retry"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/fnos/session": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 代登录：无入参凭据（凭据在服务端），仅接收浏览器设备 ID（fnOS 会话区分用） */
        post: operations["fnosSession.store"];
        /** 代登出：仅清浏览器侧会话 Cookie（fnOS 侧 token 自然过期） */
        delete: operations["fnosSession.destroy"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/healthcheck": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["healthcheck"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/search/songs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 搜索单曲 */
        get: operations["search.songs"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/search/artists": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 搜索歌手 */
        get: operations["search.artists"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/search/albums": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 搜索专辑 */
        get: operations["search.albums"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/search/tips": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 搜索联想词 */
        get: operations["search.tips"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/artists/{id}/albums": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 歌手详情 + 全部专辑 */
        get: operations["search.artistAlbums"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/albums/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 专辑详情 + 曲目列表 */
        get: operations["search.albumShow"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/songs/{id}/lyric": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 歌词（LRC 文本） */
        get: operations["song.lyric"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/songs/{id}/download-url": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 下载/试听直链解析（⚠️ 酷我直链有大陆 IP 区域限制） */
        get: operations["song.downloadUrl"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /** AlbumDetailResource */
        AlbumDetailResource: {
            id: number;
            name: string;
            artist: string | null;
            artistId: number | null;
            pic: string | null;
            /** @description 搜索条目带 total；歌手详情条目（mapAlbumDetail 不映射 total）从上游原始行 musiccnt 兜底 */
            trackCount: number | null;
            publishTime: string | null;
            description: string | null;
            plugName: string;
            songs: components["schemas"]["SongResource"][];
        };
        /** AlbumPageResource */
        AlbumPageResource: {
            items: components["schemas"]["AlbumResource"][];
            total: number;
            page: number;
            pageSize: number;
        };
        /** AlbumResource */
        AlbumResource: {
            id: number;
            name: string;
            artist: string | null;
            artistId: number | null;
            pic: string | null;
            /** @description 搜索条目带 total；歌手详情条目（mapAlbumDetail 不映射 total）从上游原始行 musiccnt 兜底 */
            trackCount: number | null;
            publishTime: string | null;
            description: string | null;
            plugName: string;
        };
        /** ArtistDetailResource */
        ArtistDetailResource: {
            id: number;
            name: string;
            alias: string | null;
            photo: string | null;
            description: string | null;
            albums: components["schemas"]["AlbumResource"][];
        };
        /** ArtistPageResource */
        ArtistPageResource: {
            items: components["schemas"]["ArtistResource"][];
            total: number;
            page: number;
            pageSize: number;
        };
        /** ArtistResource */
        ArtistResource: {
            id: number;
            name: string;
            pic: string | null;
            albumCount: number | null;
            plugName: string;
        };
        /** BrTypeResource */
        BrTypeResource: {
            id: string;
            type: string;
            bit: number;
            plugName: string;
        };
        /** DownloadUrlResource */
        DownloadUrlResource: {
            url: string;
            brType: string;
            duration: number | null;
            format: string | null;
        };
        /** LyricResource */
        LyricResource: {
            lyric: string;
        };
        /** PlugOptionResource */
        PlugOptionResource: {
            label: string;
            value: string;
        };
        /** SongPageResource */
        SongPageResource: {
            items: components["schemas"]["SongResource"][];
            total: number;
            page: number;
            pageSize: number;
        };
        /** SongResource */
        SongResource: {
            id: number;
            name: string;
            artists: string[];
            artistIds: number[];
            albumId: number | null;
            albumName: string | null;
            pic: string | null;
            duration: number | null;
            brTypes: string[];
            plugName: string;
            playcnt: number | null;
            trackNo: number | null;
        };
        /** TaskListResource */
        TaskListResource: {
            tasks: components["schemas"]["TaskResource"][];
        };
        /** TaskPageResource */
        TaskPageResource: {
            items: components["schemas"]["TaskResource"][];
            total: number;
            page: number;
            pageSize: number;
        };
        /** TaskResource */
        TaskResource: {
            id: number;
            musicId: number | null;
            plugName: string;
            name: string;
            artist: string | null;
            album: string | null;
            albumId: number | null;
            pic: string | null;
            brType: string | null;
            brTypes: string;
            status: string;
            error: string | null;
            file: string | null;
            musicInfo: string | null;
            downloadedAt: string | null;
            updatedAt: string | null;
        };
    };
    responses: {
        /** @description Validation error */
        ValidationException: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": {
                    /** @description Errors overview. */
                    message: string;
                    /** @description A detailed description of each field that failed validation. */
                    errors: {
                        [key: string]: string[];
                    };
                };
            };
        };
    };
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    "config.options": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Array of `PlugOptionResource` */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PlugOptionResource"][];
                };
            };
        };
    };
    "config.brTypes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Array of `BrTypeResource` */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BrTypeResource"][];
                };
            };
        };
    };
    "download.index": {
        parameters: {
            query?: {
                page?: number;
                pageSize?: number;
                status?: "waiting" | "loading" | "downloading" | "success" | "error" | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description `TaskPageResource` */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TaskPageResource"];
                };
            };
            422: components["responses"]["ValidationException"];
        };
    };
    "download.destroyByStatus": {
        parameters: {
            query: {
                /** @description 字面量内联（勿与常量拼接）：Scramble 静态求值才能把枚举带进 OpenAPI 规范 */
                status: "waiting" | "success" | "error";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        deleted: number;
                    };
                };
            };
            422: components["responses"]["ValidationException"];
        };
    };
    "download.storeSong": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    id: number;
                    name: string;
                    plugName: string;
                    brType?: string | null;
                };
            };
        };
        responses: {
            /** @description `TaskListResource` */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TaskListResource"];
                };
            };
            422: components["responses"]["ValidationException"];
        };
    };
    "download.storeAlbum": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    id: number;
                    plugName: string;
                    bit?: number | null;
                };
            };
        };
        responses: {
            /** @description `TaskListResource` */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TaskListResource"];
                };
            };
            422: components["responses"]["ValidationException"];
        };
    };
    "download.storeArtist": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    plugName: string;
                    bit?: number | null;
                };
            };
        };
        responses: {
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        queued: boolean;
                    };
                };
            };
            422: components["responses"]["ValidationException"];
        };
    };
    "download.retryAll": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        retried: number;
                    };
                };
            };
        };
    };
    "download.destroy": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description No content */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    "download.refresh": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description `TaskResource` */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TaskResource"];
                };
            };
        };
    };
    "download.retry": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description `TaskResource` */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TaskResource"];
                };
            };
        };
    };
    "fnosSession.store": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description 浏览器生成的 32 位 hex 设备 ID（原前端 getDeviceId 同口径） */
                    deviceId: string;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        user: string | null;
                    };
                };
            };
            422: components["responses"]["ValidationException"];
        };
    };
    "fnosSession.destroy": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description No content */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    healthcheck: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @constant */
                        code: 200;
                        msg: null;
                        data: null;
                    };
                };
            };
        };
    };
    "search.songs": {
        parameters: {
            query: {
                keyword: string;
                plugName?: string;
                page?: number;
                pageSize?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description `SongPageResource` */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SongPageResource"];
                };
            };
            422: components["responses"]["ValidationException"];
        };
    };
    "search.artists": {
        parameters: {
            query: {
                keyword: string;
                plugName?: string;
                page?: number;
                pageSize?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description `ArtistPageResource` */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ArtistPageResource"];
                };
            };
            422: components["responses"]["ValidationException"];
        };
    };
    "search.albums": {
        parameters: {
            query: {
                keyword: string;
                plugName?: string;
                page?: number;
                pageSize?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description `AlbumPageResource` */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AlbumPageResource"];
                };
            };
            422: components["responses"]["ValidationException"];
        };
    };
    "search.tips": {
        parameters: {
            query: {
                keyword: string;
                plugName?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            422: components["responses"]["ValidationException"];
        };
    };
    "search.artistAlbums": {
        parameters: {
            query?: {
                plugName?: string;
            };
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description `ArtistDetailResource` */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ArtistDetailResource"];
                };
            };
            422: components["responses"]["ValidationException"];
        };
    };
    "search.albumShow": {
        parameters: {
            query?: {
                plugName?: string;
            };
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description `AlbumDetailResource` */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AlbumDetailResource"];
                };
            };
            422: components["responses"]["ValidationException"];
        };
    };
    "song.lyric": {
        parameters: {
            query?: {
                plugName?: string;
            };
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description `LyricResource` */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LyricResource"];
                };
            };
            422: components["responses"]["ValidationException"];
        };
    };
    "song.downloadUrl": {
        parameters: {
            query: {
                brType: string;
                plugName?: string;
            };
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description `DownloadUrlResource` */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DownloadUrlResource"];
                };
            };
            422: components["responses"]["ValidationException"];
        };
    };
}
