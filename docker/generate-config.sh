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

# 同源模式：baseUrl 固定空串，浏览器访问容器自身 /api，由 nginx 反代到后端；
# proxyTarget 为信息性字段，把反代目标带给浏览器供设置面板展示
cat > /usr/share/nginx/html/config.json <<EOF
{
  "baseUrl": "",
  "proxyTarget": "${MC_API_BASE_URL}",
  "username": "${MC_USERNAME:-}",
  "password": "${MC_PASSWORD:-}",
  "autoLogin": ${AUTO_LOGIN}
}
EOF
echo "[mc] 已生成 config.json（/api 反代目标：${MC_API_BASE_URL}）"
