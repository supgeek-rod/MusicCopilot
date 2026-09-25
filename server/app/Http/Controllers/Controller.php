<?php

namespace App\Http\Controllers;

use Throwable;

abstract class Controller
{
    /**
     * 回给客户端的异常详情：业务链路抛出的 RuntimeException 消息可控可读（如
     * 「酷我直链接口 HTTP 503」「上游返回 code=407（大陆 IP 区域限制）」），原样保留；
     * 其余意外异常可能携带上游 URL 与本地路径，一律收敛为固定文案（详情走 report 日志）。
     */
    protected static function errorDetail(Throwable $e): string
    {
        return $e instanceof \RuntimeException ? $e->getMessage() : '内部错误，请稍后重试';
    }
}

