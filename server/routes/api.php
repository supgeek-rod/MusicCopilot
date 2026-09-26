<?php

use App\Http\Controllers\HealthcheckController;
use App\Http\Controllers\V2\ConfigController;
use App\Http\Controllers\V2\DownloadController;
use App\Http\Controllers\V2\FnosSessionController;
use App\Http\Controllers\V2\SearchController;
use App\Http\Controllers\V2\SongController;
use Illuminate\Support\Facades\Route;

// 认证已移除（2026-09-25）：所有端点公开可访问，无需任何凭证或请求头。
// API V2（2026-09-26）：清理版契约——REST 语义、真 HTTP 状态码、整数类型、
// 统一分页 {items,total,page,pageSize}、错误体 {error,message}（见 ApiException）；
// 旧 /api/music|download|task|config|fnos 信封端点已整体删除。
// 探活：Docker healthcheck、运维探测与前端连接探测统一走 /api/healthcheck（历史信封形态保留）。
Route::get('healthcheck', HealthcheckController::class);

Route::prefix('v2')->group(function () {
    Route::get('config/options', [ConfigController::class, 'options']);
    Route::get('config/br-types', [ConfigController::class, 'brTypes']);

    Route::get('search/songs', [SearchController::class, 'songs']);
    Route::get('search/artists', [SearchController::class, 'artists']);
    Route::get('search/albums', [SearchController::class, 'albums']);
    Route::get('search/tips', [SearchController::class, 'tips']);

    Route::get('artists/{id}/albums', [SearchController::class, 'artistAlbums'])->whereNumber('id');
    Route::get('albums/{id}', [SearchController::class, 'albumShow'])->whereNumber('id');
    Route::get('songs/{id}/lyric', [SongController::class, 'lyric'])->whereNumber('id');
    Route::get('songs/{id}/download-url', [SongController::class, 'downloadUrl'])->whereNumber('id');

    // 下载任务：创建走三个子资源端点，任务操作收敛在 /downloads/{id}；
    // 批量重试为 POST /downloads/retries，批量删除为 DELETE /downloads?status=
    Route::get('downloads', [DownloadController::class, 'index']);
    Route::post('downloads/songs', [DownloadController::class, 'storeSong']);
    Route::post('downloads/albums', [DownloadController::class, 'storeAlbum']);
    Route::post('downloads/artists/{id}', [DownloadController::class, 'storeArtist'])->whereNumber('id');
    Route::post('downloads/retries', [DownloadController::class, 'retryAll']);
    Route::delete('downloads', [DownloadController::class, 'destroyByStatus']);
    Route::delete('downloads/{id}', [DownloadController::class, 'destroy'])->whereNumber('id');
    Route::post('downloads/{id}/refresh', [DownloadController::class, 'refresh'])->whereNumber('id');
    Route::post('downloads/{id}/retry', [DownloadController::class, 'retry'])->whereNumber('id');

    // fnOS 音乐库代持会话（凭据在服务端，token 经 HttpOnly Cookie 下发）
    Route::post('fnos/session', [FnosSessionController::class, 'store']);
    Route::delete('fnos/session', [FnosSessionController::class, 'destroy']);
});
