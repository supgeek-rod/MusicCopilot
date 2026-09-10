# 参考仓库提取资料

来源：https://github.com/59799517/simple_sq_music_plus branch `3.0`（2026-09-10 提取）。

- `application-kw.yml` —— 酷我全部端点配置（Spring `kw.*` 配置节，含各接口 URL 模板与占位符）
- `NKwSearchHander.java` —— 酷我插件核心处理器：搜索/歌手/专辑/歌词加密（XOR yeelion + zlib + base64）/直链解析
- `KwSearchType.java` —— 搜索类型枚举（music/artist/album → `ft` 参数）
- `KwConfig.java` —— 配置项清单
- `SearchMusicResult.java` / `MusicInfoResult.java` / `Download2Result.java` —— 响应实体（字段映射参考）

仅作研究留档，版权归原仓库作者（MIT）。
