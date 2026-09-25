<?php

use App\Http\Controllers\ConfigController;
use App\Http\Controllers\DownloadController;
use App\Http\Controllers\HealthcheckController;
use App\Http\Controllers\MusicSearchController;
use App\Http\Controllers\TaskController;
use Illuminate\Support\Facades\Route;

// 认证已移除（2026-09-25）：所有端点公开可访问，无需任何凭证或请求头；
// 原登录 / 登录态 / 注销端点已随 SqMusic 契约清理删除（2026-09-26）。
// 探活：Docker healthcheck、运维探测与前端连接探测统一走 /api/healthcheck。
Route::get('healthcheck', HealthcheckController::class);

Route::prefix('config')->group(function () {
    Route::get('getOption', [ConfigController::class, 'getOption']);
    Route::get('getPlugBrTypeList', [ConfigController::class, 'getPlugBrTypeList']);
});

Route::prefix('music')->group(function () {
    Route::get('searchSong', [MusicSearchController::class, 'searchSong']);
    Route::get('searchArtist', [MusicSearchController::class, 'searchArtist']);
    Route::get('searchAlbum', [MusicSearchController::class, 'searchAlbum']);
    Route::get('searchTips', [MusicSearchController::class, 'searchTips']);
    Route::get('artistAlbumById', [MusicSearchController::class, 'artistAlbumById']);
    Route::get('albumInfoById', [MusicSearchController::class, 'albumInfoById']);
    Route::post('getLyric', [MusicSearchController::class, 'getLyric']);
    Route::post('getDownloadUrl', [MusicSearchController::class, 'getDownloadUrl']);
});

Route::prefix('download')->group(function () {
    Route::post('downloadSong', [DownloadController::class, 'downloadSong']);
    Route::post('downloadAlbum', [DownloadController::class, 'downloadAlbum']);
    Route::post('downloadArtistAlbum', [DownloadController::class, 'downloadArtistAlbum']);
});

// fnOS 音乐库代持登录：凭据仅存服务端，token 经 HttpOnly Cookie 下发（见 FnosAuthController）
Route::prefix('fnos')->group(function () {
    Route::post('login', [\App\Http\Controllers\FnosAuthController::class, 'login']);
    Route::post('logout', [\App\Http\Controllers\FnosAuthController::class, 'logout']);
});

Route::prefix('task')->group(function () {
    Route::post('list', [TaskController::class, 'list']);
    Route::post('del', [TaskController::class, 'del']);
    Route::post('refreshTask', [TaskController::class, 'refreshTask']);
    Route::post('errorTaskRetry', [TaskController::class, 'errorTaskRetry']);
    // 批量破坏性操作一律 POST：GET 型可被任意网页 <img src> 静默触发（drive-by），
    // 如 <img src="http://NAS/task/delSuccessTask"> 即清空全部成功记录
    Route::post('againTask', [TaskController::class, 'againTask']);
    Route::post('delErrorTask', [TaskController::class, 'delErrorTask']);
    Route::post('delSuccessTask', [TaskController::class, 'delSuccessTask']);
    Route::post('delWaitingTask', [TaskController::class, 'delWaitingTask']);
});
