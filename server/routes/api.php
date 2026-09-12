<?php

use App\Http\Controllers\ConfigController;
use App\Http\Controllers\DownloadController;
use App\Http\Controllers\InternalController;
use App\Http\Controllers\MusicSearchController;
use App\Http\Controllers\TaskController;
use Illuminate\Support\Facades\Route;

// 鉴权契约对齐 SQMusic：除 login / isLogin 外一律要求 sqmusic 请求头，
// 缺失或无效返回 HTTP 403（前端 http.ts 据此自动重登并重试）。
Route::prefix('config')->group(function () {
    Route::post('login', [ConfigController::class, 'login']);
    // 前端用 GET，SQMusic 两种都支持
    Route::get('isLogin', [ConfigController::class, 'isLogin']);
    Route::post('isLogin', [ConfigController::class, 'isLogin']);

    Route::middleware('sqmusic.auth')->group(function () {
        Route::post('logout', [ConfigController::class, 'logout']);
        Route::get('getOption', [ConfigController::class, 'getOption']);
        Route::get('getPlugBrTypeList', [ConfigController::class, 'getPlugBrTypeList']);
    });
});

Route::middleware('sqmusic.auth')->prefix('music')->group(function () {
    Route::get('searchSong', [MusicSearchController::class, 'searchSong']);
    Route::get('searchArtist', [MusicSearchController::class, 'searchArtist']);
    Route::get('searchAlbum', [MusicSearchController::class, 'searchAlbum']);
    Route::get('searchTips', [MusicSearchController::class, 'searchTips']);
    Route::get('artistAlbumById', [MusicSearchController::class, 'artistAlbumById']);
    Route::get('albumInfoById', [MusicSearchController::class, 'albumInfoById']);
    Route::post('getLyric', [MusicSearchController::class, 'getLyric']);
    Route::post('getDownloadUrl', [MusicSearchController::class, 'getDownloadUrl']);
});

Route::middleware('sqmusic.auth')->prefix('download')->group(function () {
    Route::post('downloadSong', [DownloadController::class, 'downloadSong']);
    Route::post('downloadAlbum', [DownloadController::class, 'downloadAlbum']);
    Route::post('downloadArtistAlbum', [DownloadController::class, 'downloadArtistAlbum']);
});

Route::middleware('sqmusic.auth')->prefix('task')->group(function () {
    Route::post('list', [TaskController::class, 'list']);
    Route::post('del', [TaskController::class, 'del']);
    Route::post('refreshTask', [TaskController::class, 'refreshTask']);
    Route::post('errorTaskRetry', [TaskController::class, 'errorTaskRetry']);
    Route::get('againTask', [TaskController::class, 'againTask']);
    Route::get('delErrorTask', [TaskController::class, 'delErrorTask']);
    Route::get('delSuccessTask', [TaskController::class, 'delSuccessTask']);
    Route::get('delWaitingTask', [TaskController::class, 'delWaitingTask']);
});

// 容器间内部端点（scraper → server），不走 sqmusic 鉴权；仅应在 compose 内网暴露
Route::prefix('internal')->group(function () {
    Route::post('download-task/path', [InternalController::class, 'updateDownloadTaskPath']);
});
