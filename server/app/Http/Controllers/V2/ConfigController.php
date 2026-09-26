<?php

namespace App\Http\Controllers\V2;

use App\Http\Controllers\Controller;
use App\Http\Resources\V2\BrTypeResource;
use App\Http\Resources\V2\PlugOptionResource;
use App\Plugins\Sources\SourceManager;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * API V2 音源配置：/api/v2/config/options、/api/v2/config/br-types。
 */
class ConfigController extends Controller
{
    public function __construct(private readonly SourceManager $sources)
    {
    }

    /** 已注册音源插件清单（value 即 plugName） */
    public function options(): AnonymousResourceCollection
    {
        $options = collect($this->sources->all())
            ->map(fn ($plugin, $name) => ['label' => $plugin->label(), 'value' => $name])
            ->values();

        return PlugOptionResource::collection($options);
    }

    /** 各插件可用音质枚举（id 即 brType 键） */
    public function brTypes(): AnonymousResourceCollection
    {
        $list = collect($this->sources->all())
            ->flatMap(fn ($plugin) => $plugin->brTypeList())
            ->values();

        return BrTypeResource::collection($list);
    }
}
