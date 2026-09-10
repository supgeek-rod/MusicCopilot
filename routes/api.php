<?php

use App\Http\Controllers\MusicSearchController;
use Illuminate\Support\Facades\Route;

Route::prefix('music')->group(function () {
    Route::get('searchSong', [MusicSearchController::class, 'searchSong']);
    Route::get('searchArtist', [MusicSearchController::class, 'searchArtist']);
    Route::get('searchAlbum', [MusicSearchController::class, 'searchAlbum']);
});
