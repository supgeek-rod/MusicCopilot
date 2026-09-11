export interface paths {
    "/config/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 登录：body 必须带 device 字段（对齐 SQMusic，缺失报「请填写登录设备类型」） */
        post: operations["config.login"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/config/isLogin": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 登录态查询：GET/POST 均可（对齐 SQMusic）；恒返回 200，登录态在 data 布尔值上 */
        get: operations["config.isLogin_1"];
        put?: never;
        /** 登录态查询：GET/POST 均可（对齐 SQMusic）；恒返回 200，登录态在 data 布尔值上 */
        post: operations["config.isLogin_2"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/config/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 注销：撤销当前 token（受鉴权保护） */
        post: operations["config.logout"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/config/getOption": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 已注册音源插件清单（前端仅消费 value=kw 的项） */
        get: operations["config.getOption"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/config/getPlugBrTypeList": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 各插件可用音质枚举（前端用 id 作 brType 键、type+bit 拼展示标签） */
        get: operations["config.getPlugBrTypeList"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/music/searchSong": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 搜索单曲（酷我：search.kuwo.cn/r.s ft=music） */
        get: operations["musicSearch.searchSong"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/music/searchArtist": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 搜索歌手（酷我：r.s ft=artist） */
        get: operations["musicSearch.searchArtist"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/music/searchAlbum": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 搜索专辑（酷我：r.s ft=album） */
        get: operations["musicSearch.searchAlbum"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/music/searchTips": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 搜索联想词（酷我 openapi searchKey，RELWORD 提取） */
        get: operations["musicSearch.searchTips"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/music/artistAlbumById": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 歌手详情 + 全部专辑（酷我 r.s artistinfo + albumlist 聚合） */
        get: operations["musicSearch.artistAlbumById"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/music/albumInfoById": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 专辑详情 + 曲目列表（酷我 r.s albuminfo） */
        get: operations["musicSearch.albumInfoById"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/music/getLyric": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 歌词（酷我加密歌词接口 newlyric）
         *     契约对齐 SQMusic 的 POST /api/music/getLyric，但按「新端点不复制历史瑕疵」
         *     把 LRC 文本放 data（SQMusic 放 msg，前端 music.ts getLyric 两种均兼容）。
         */
        post: operations["musicSearch.getLyric"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/music/getDownloadUrl": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 获取下载/试听直链（酷我 mobi convert_url_with_sign，⚠️ 大陆 IP 区域限制）
         *     契约对齐 SQMusic：POST，body 带 plugName/id/brType，brTypes（完整歌曲对象）兼容接收但不参与解析
         */
        post: operations["musicSearch.getDownloadUrl"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: never;
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
    "config.login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    username: string;
                    password: string;
                    device: string;
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
                        /** @constant */
                        code: 200;
                        msg: null;
                        data: {
                            tokenName: string;
                            tokenValue: string;
                            isLogin: boolean;
                            loginId: string;
                            loginDevice: string;
                        };
                    } | {
                        /** @constant */
                        code: 500;
                        /** @constant */
                        msg: "用户名或密码错误";
                        data: null;
                    };
                };
            };
            422: components["responses"]["ValidationException"];
        };
    };
    "config.isLogin_1": {
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
                        data: boolean;
                    };
                };
            };
        };
    };
    "config.isLogin_2": {
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
                        data: boolean;
                    };
                };
            };
        };
    };
    "config.logout": {
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
    "config.getOption": {
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
                        data: {
                            label: string;
                            value: string;
                        }[];
                    };
                };
            };
        };
    };
    "config.getPlugBrTypeList": {
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
                        data: string[];
                    };
                };
            };
        };
    };
    "musicSearch.searchSong": {
        parameters: {
            query: {
                keyword: string;
                plugName?: string;
                pageIndex?: number;
                pageSize?: number;
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
                        /** @constant */
                        code: 200;
                        msg: null;
                        data: {
                            records: string;
                            searchTotal: string;
                            searchIndex: string | 1;
                            searchSize: string | 30;
                            searchKeyWork: string;
                            plugName: string | "kw";
                        };
                    } | {
                        /** @constant */
                        code: 500;
                        msg: string;
                        data: null;
                    } | {
                        /** @constant */
                        code: 500;
                        /** @constant */
                        msg: "keyword 不能为空";
                        data: null;
                    };
                };
            };
            422: components["responses"]["ValidationException"];
        };
    };
    "musicSearch.searchArtist": {
        parameters: {
            query: {
                keyword: string;
                plugName?: string;
                pageIndex?: number;
                pageSize?: number;
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
                        /** @constant */
                        code: 200;
                        msg: null;
                        data: {
                            records: string;
                            searchTotal: string;
                            searchIndex: string | 1;
                            searchSize: string | 30;
                            searchKeyWork: string;
                            plugName: string | "kw";
                        };
                    } | {
                        /** @constant */
                        code: 500;
                        msg: string;
                        data: null;
                    } | {
                        /** @constant */
                        code: 500;
                        /** @constant */
                        msg: "keyword 不能为空";
                        data: null;
                    };
                };
            };
            422: components["responses"]["ValidationException"];
        };
    };
    "musicSearch.searchAlbum": {
        parameters: {
            query: {
                keyword: string;
                plugName?: string;
                pageIndex?: number;
                pageSize?: number;
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
                        /** @constant */
                        code: 200;
                        msg: null;
                        data: {
                            records: string;
                            searchTotal: string;
                            searchIndex: string | 1;
                            searchSize: string | 30;
                            searchKeyWork: string;
                            plugName: string | "kw";
                        };
                    } | {
                        /** @constant */
                        code: 500;
                        msg: string;
                        data: null;
                    } | {
                        /** @constant */
                        code: 500;
                        /** @constant */
                        msg: "keyword 不能为空";
                        data: null;
                    };
                };
            };
            422: components["responses"]["ValidationException"];
        };
    };
    "musicSearch.searchTips": {
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
                    "application/json": Record<string, never>;
                };
            };
            422: components["responses"]["ValidationException"];
        };
    };
    "musicSearch.artistAlbumById": {
        parameters: {
            query: {
                id: string;
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
                    "application/json": Record<string, never>;
                };
            };
            422: components["responses"]["ValidationException"];
        };
    };
    "musicSearch.albumInfoById": {
        parameters: {
            query: {
                id: string;
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
                    "application/json": Record<string, never>;
                };
            };
            422: components["responses"]["ValidationException"];
        };
    };
    "musicSearch.getLyric": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    id: string;
                    plugName?: string;
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
                        /** @constant */
                        code: 200;
                        msg: null;
                        data: string;
                    } | {
                        /** @constant */
                        code: 500;
                        /** @constant */
                        msg: "未找到歌词";
                        data: null;
                    } | {
                        /** @constant */
                        code: 500;
                        msg: string;
                        data: null;
                    };
                };
            };
            422: components["responses"]["ValidationException"];
        };
    };
    "musicSearch.getDownloadUrl": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    id: string;
                    brType: string;
                    plugName?: string;
                    brTypes?: string[];
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            422: components["responses"]["ValidationException"];
        };
    };
}
