<?php

namespace App\Plugins\Sources;

use App\Plugins\Sources\Kuwo\KuwoPlugin;
use InvalidArgumentException;

/**
 * 音源插件注册表：按 plugName 路由到具体插件。
 * 新增音源时在构造函数注册实现即可，控制器与契约不变。
 */
class SourceManager
{
    /** @var array<string, SourcePlugin> */
    private array $plugins;

    public function __construct(KuwoPlugin $kuwo)
    {
        $this->plugins = [
            $kuwo->plugName() => $kuwo,
        ];
    }

    public function has(string $plugName): bool
    {
        return isset($this->plugins[$plugName]);
    }

    public function get(string $plugName): SourcePlugin
    {
        if (! $this->has($plugName)) {
            throw new InvalidArgumentException("音源插件 {$plugName} 未注册");
        }

        return $this->plugins[$plugName];
    }
}
