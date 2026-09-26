<?php

namespace App\Http\Controllers\V2;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Resources\V2\DownloadUrlResource;
use App\Http\Resources\V2\LyricResource;
use App\Plugins\Sources\LyricPlugin;
use App\Plugins\Sources\SourceManager;
use App\Plugins\Sources\SourcePlugin;
use Illuminate\Http\Request;
use Throwable;

/**
 * API V2 单曲能力：/api/v2/songs/{id}/lyric、/api/v2/songs/{id}/download-url。
 * 歌词回归标准 JSON 体（旧契约把 LRC 文本放 msg 字段的特例废除）。
 */
class SongController extends Controller
{
    public function __construct(private readonly SourceManager $sources)
    {
    }

    /** 歌词（LRC 文本） */
    public function lyric(Request $request, string $id): LyricResource
    {
        $validated = $request->validate(['plugName' => 'string']);
        $plugName = $validated['plugName'] ?? 'kw';

        if (! $this->sources->has($plugName)) {
            throw ApiException::notFound("音源插件 {$plugName} 未开启");
        }

        $plugin = $this->sources->get($plugName);
        if (! $plugin instanceof LyricPlugin) {
            throw ApiException::badRequest("插件 {$plugName} 不支持歌词");
        }

        try {
            $lyric = $plugin->getLyric($id);
        } catch (Throwable $e) {
            report($e);

            throw ApiException::upstream('歌词获取失败：'.self::errorDetail($e));
        }

        if ($lyric === null || $lyric === '') {
            throw ApiException::notFound('未找到歌词');
        }

        return new LyricResource(['lyric' => $lyric]);
    }

    /** 下载/试听直链解析（⚠️ 酷我直链有大陆 IP 区域限制） */
    public function downloadUrl(Request $request, string $id): DownloadUrlResource
    {
        $validated = $request->validate([
            'brType' => 'required|string',
            'plugName' => 'string',
        ]);

        $plugName = $validated['plugName'] ?? 'kw';
        if (! $this->sources->has($plugName)) {
            throw ApiException::notFound("音源插件 {$plugName} 未开启");
        }

        try {
            $data = $this->sources->get($plugName)->downloadUrl($id, $validated['brType']);
        } catch (Throwable $e) {
            report($e);

            throw ApiException::upstream('直链解析失败：'.self::errorDetail($e));
        }

        return new DownloadUrlResource($data);
    }
}
