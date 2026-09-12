<?php

namespace App\Http\Controllers;

use App\Plugins\Sources\SourceManager;
use App\Services\SqmusicTokenService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * 配置与鉴权接口：/api/config/login|logout|isLogin|getOption|getPlugBrTypeList
 * 契约对齐 SQMusic（sa-token 风格 LoginInfo），两处按「新端点不复制历史瑕疵」修正：
 * isLogin 无论登录与否都返回 200 + data:boolean（SQMusic 无 token 也返回 true）；
 * 凭证错误返回明确的「用户名或密码错误」（SQMusic 行为未实测，信封风格一致）。
 */
class ConfigController extends Controller
{
    public function __construct(
        private readonly SourceManager $sources,
        private readonly SqmusicTokenService $tokens,
    ) {
    }

    /**
     * 登录：body 必须带 device 字段（对齐 SQMusic，缺失报「请填写登录设备类型」）
     *
     * @response status=200 {"code":200,"msg":null,"data":{"tokenName":"sqmusic","tokenValue":"<64位hex>","isLogin":true,"loginId":"admin","loginDevice":"web"}}
     * @response status=200 {"code":500,"msg":"用户名或密码错误","data":null}
     */
    public function login(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'username' => 'required|string',
            'password' => 'required|string',
            'device' => 'required|string|max:32',
        ], [
            'username.required' => '请填写用户名',
            'password.required' => '请填写密码',
            'device.required' => '请填写登录设备类型',
        ]);

        if (! hash_equals((string) config('mc.auth.username'), $validated['username'])
            || ! hash_equals((string) config('mc.auth.password'), $validated['password'])
        ) {
            return response()->json([
                'code' => 500,
                'msg' => '用户名或密码错误',
                'data' => null,
            ]);
        }

        $token = $this->tokens->issue($validated['username'], $validated['device']);

        return response()->json([
            'code' => 200,
            'msg' => null,
            'data' => [
                'tokenName' => config('mc.auth.token_name'),
                'tokenValue' => $token,
                'isLogin' => true,
                'loginId' => $validated['username'],
                'loginDevice' => $validated['device'],
            ],
        ]);
    }

    /**
     * 登录态查询：GET/POST 均可（对齐 SQMusic）；恒返回 200，登录态在 data 布尔值上
     *
     * @response status=200 {"code":200,"msg":null,"data":true}
     */
    public function isLogin(Request $request): JsonResponse
    {
        $token = $request->header((string) config('mc.auth.token_name'));

        return response()->json([
            'code' => 200,
            'msg' => null,
            'data' => $this->tokens->resolve($token) !== null,
        ]);
    }

    /**
     * 注销：撤销当前 token（受鉴权保护）
     *
     * @response status=200 {"code":200,"msg":null,"data":null}
     */
    public function logout(Request $request): JsonResponse
    {
        $this->tokens->revoke($request->header((string) config('mc.auth.token_name')));

        return response()->json([
            'code' => 200,
            'msg' => null,
            'data' => null,
        ]);
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
