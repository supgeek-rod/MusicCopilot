#!/bin/sh
set -e

# 容器内不落 .env，配置全部经 MC_* 环境变量注入（compose env_file）；
# SQLite 库放 /data 卷（DB_DATABASE=/data/database.sqlite 由 compose 注入）
if [ -z "$APP_KEY" ]; then
    # 未提供时自动生成：容器内加密面仅 cookie，auth token 与加密无关，容器重建无碍
    export APP_KEY="base64:$(php -r 'echo base64_encode(random_bytes(32));')"
fi

php artisan migrate --force

exec "$@"
