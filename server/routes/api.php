<?php

use App\Http\Controllers\ConfigController;
use App\Http\Controllers\MusicSearchController;
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
