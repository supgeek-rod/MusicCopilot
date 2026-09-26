<?php

namespace App\Exceptions;

use RuntimeException;

/**
 * API V2 错误契约：真 HTTP 状态码 + {error, message} 错误体。
 * error 为机器可读码（前端可编程分支），message 为人类可读中文文案。
 * 渲染统一在 bootstrap/app.php 的异常处理中完成。
 */
class ApiException extends RuntimeException
{
    public function __construct(
        public readonly string $errorCode,
        string $message,
        public readonly int $status = 400,
    ) {
        parent::__construct($message);
    }

    public static function badRequest(string $message): self
    {
        return new self('bad_request', $message, 400);
    }

    public static function notFound(string $message): self
    {
        return new self('not_found', $message, 404);
    }

    public static function unauthorized(string $message): self
    {
        return new self('unauthorized', $message, 401);
    }

    public static function notConfigured(string $message): self
    {
        return new self('not_configured', $message, 503);
    }

    public static function upstream(string $message): self
    {
        return new self('upstream_error', $message, 502);
    }
}
