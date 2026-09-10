#!/bin/sh
# 容器启动时从环境变量生成运行时配置（改配置重启容器即可，无需重建镜像）。
# nginx 官方镜像会在启动阶段执行 /docker-entrypoint.d/ 下的脚本。
set -e

if [ -z "${MC_API_BASE_URL:-}" ]; then
  echo "[mc] 错误：缺少环境变量 MC_API_BASE_URL（后端地址，nginx 将把 /api 反代到该地址）" >&2
  echo "[mc] Docker / compose 部署请在 .env 中设置，例如 MC_API_BASE_URL=http://192.168.31.31:8096" >&2
  exit 1
fi

case "${MC_AUTO_LOGIN:-true}" in
  false | False | FALSE | 0 | no) AUTO_LOGIN=false ;;
  *) AUTO_LOGIN=true ;;
esac

# ── 飞牛（fnOS）音乐库反代（可选）──
# nginx 模板 include /etc/nginx/mc-fnos/*.conf（通配，无文件不报错）；
# 配置了 MC_FNOS_BASE_URL 时按需生成 location 块，剥掉 /fnos 前缀转发到 fnOS 网关
FNOS_ENABLED=false
FNOS_AUTO_LOGIN=true
if [ -n "${MC_FNOS_BASE_URL:-}" ]; then
  FNOS_ENABLED=true
  case "${MC_FNOS_AUTO_LOGIN:-true}" in
    false | False | FALSE | 0 | no) FNOS_AUTO_LOGIN=false ;;
    *) FNOS_AUTO_LOGIN=true ;;
  esac
  mkdir -p /etc/nginx/mc-fnos
  cat > /etc/nginx/mc-fnos/fnos.conf <<EOF
location /fnos/ {
    proxy_pass ${MC_FNOS_BASE_URL}/;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_read_timeout 300s;
    proxy_buffering off;
}
EOF
  echo "[mc] 已启用 /fnos 反代（目标：${MC_FNOS_BASE_URL}）"
fi

# ── 刮削工具反代（可选）──
# 与 fnOS 同一 include 目录；工具路由自带 /mc 前缀，proxy_pass 不带 URI（保留 /mc）
SCRAPER_ENABLED=false
if [ -n "${MC_SCRAPER_BASE_URL:-}" ]; then
  SCRAPER_ENABLED=true
  mkdir -p /etc/nginx/mc-fnos
  cat > /etc/nginx/mc-fnos/scraper.conf <<EOF
location /mc/ {
    proxy_pass ${MC_SCRAPER_BASE_URL};
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_read_timeout 300s;
    proxy_buffering off;
}
EOF
  echo "[mc] 已启用 /mc 反代（目标：${MC_SCRAPER_BASE_URL}）"
fi

# 同源模式：baseUrl 固定空串，浏览器访问容器自身 /api，由 nginx 反代到后端；
# proxyTarget 为信息性字段，把反代目标带给浏览器供设置面板展示
# JSON 转义：密码等环境变量含 " 或 \ 时避免生成损坏的 config.json
json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}
PROXY_TARGET=$(json_escape "${MC_API_BASE_URL}")
USERNAME=$(json_escape "${MC_API_USERNAME:-}")
PASSWORD=$(json_escape "${MC_API_PASSWORD:-}")
FNOS_TARGET=$(json_escape "${MC_FNOS_BASE_URL:-}")
FNOS_USERNAME=$(json_escape "${MC_FNOS_USERNAME:-}")
FNOS_PASSWORD=$(json_escape "${MC_FNOS_PASSWORD:-}")
SCRAPER_TARGET=$(json_escape "${MC_SCRAPER_BASE_URL:-}")
SCRAPER_TOKEN=$(json_escape "${MC_SCRAPER_TOKEN:-}")
cat > /usr/share/nginx/html/config.json <<EOF
{
  "baseUrl": "",
  "proxyTarget": "${PROXY_TARGET}",
  "username": "${USERNAME}",
  "password": "${PASSWORD}",
  "autoLogin": ${AUTO_LOGIN},
  "fnos": {
    "enabled": ${FNOS_ENABLED},
    "proxyTarget": "${FNOS_TARGET}",
    "username": "${FNOS_USERNAME}",
    "password": "${FNOS_PASSWORD}",
    "autoLogin": ${FNOS_AUTO_LOGIN}
  },
  "scraper": {
    "enabled": ${SCRAPER_ENABLED},
    "proxyTarget": "${SCRAPER_TARGET}",
    "token": "${SCRAPER_TOKEN}"
  }
}
EOF
echo "[mc] 已生成 config.json（/api 反代目标：${MC_API_BASE_URL}）"
