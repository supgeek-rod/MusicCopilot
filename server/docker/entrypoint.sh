#!/bin/sh
set -e

# 容器内不落 .env，配置全部经 MC_* 环境变量注入（compose env_file）；
# SQLite 库放 /data 卷（DB_DATABASE=/data/database.sqlite 由 compose 注入）
if [ -z "$APP_KEY" ]; then
    # 未提供时自动生成：容器内加密面仅 cookie，auth token 与加密无关，容器重建无碍
    export APP_KEY="base64:$(php -r 'echo base64_encode(random_bytes(32));')"
fi

php artisan migrate --force

# ── 队列 worker（与 API 同容器分进程）──
# worker 由本进程（PID 1）直接派生并 wait 监管：意外退出 1s 后重新拉起（自愈）；
# TERM/INT（docker stop）时转发给 worker 与 API，等当前下载收尾（.part → rename）
# 后自然退出，收尾窗口由 compose stop_grace_period 兜底。
stop=""
serve_pid=""
worker_child=""

on_term() {
    trap - TERM INT
    stop=1
    kill -TERM "$serve_pid" 2>/dev/null
    if [ -n "$worker_child" ]; then
        kill -TERM "$worker_child" 2>/dev/null
    fi
}

trap on_term TERM INT

"$@" &
serve_pid=$!

while [ -z "$stop" ]; do
    php artisan queue:work --tries=1 --timeout=3600 &
    worker_child=$!
    wait "$worker_child" || true
    if [ -z "$stop" ]; then
        sleep 1
    fi
done

# TERM 后等 worker 收尾当前任务再退（PID 1 退出即容器终止）
wait "$worker_child" 2>/dev/null || true
exit 0
