<?php

namespace App\Http\Controllers;

use App\Plugins\Sources\SourceManager;
use Illuminate\Http\JsonResponse;

/**
 * 配置接口：/api/config/getOption|getPlugBrTypeList（音源插件元信息）。
 * 认证已移除（2026-09-25）：所有端点公开可访问；原登录 / 登录态 / 注销端点已随
 * SqMusic 契约清理删除（2026-09-26），探活由 /api/healthcheck 承担。
 */
class ConfigController extends Controller
{
    public function __construct(
        private readonly SourceManager $sources,
    ) {
    }

    /**
     * 已注册音源插件清单（前端仅消费 value=kw 的项）
     *
     * @response status=200 {"code":200,"msg":null,"data":[{"label":"酷我音乐","value":"kw"}]}
     */
    public function getOption(): JsonResponse
    {
        $options = [];
        foreach ($this->sources->all() as $plugName => $plugin) {
            $options[] = ['label' => $plugin->label(), 'value' => $plugName];
        }

        return response()->json([
            'code' => 200,
            'msg' => null,
            'data' => $options,
        ]);
    }

    /**
     * 各插件可用音质枚举（前端用 id 作 brType 键、type+bit 拼展示标签）
     *
     * @response status=200 {"code":200,"msg":null,"data":[{"id":"KW_MP3_128","value":"KW_MP3_128","type":"MP3","bit":128,"plugName":"kw","springName":"128kmp3"}]}
     */
    public function getPlugBrTypeList(): JsonResponse
    {
        $list = [];
        foreach ($this->sources->all() as $plugin) {
            foreach ($plugin->brTypeList() as $item) {
                $list[] = $item;
            }
        }

        return response()->json([
            'code' => 200,
            'msg' => null,
            'data' => $list,
        ]);
    }
}
