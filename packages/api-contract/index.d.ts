export interface paths {
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
}
