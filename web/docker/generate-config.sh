#!/bin/sh
# 容器启动时从环境变量生成运行时配置（改配置重启容器即可，无需重建镜像）。
# nginx 官方镜像会在启动阶段执行 /docker-entrypoint.d/ 下的脚本。
set -e

if [ -z "${MC_API_BASE_URL:-}" ]; then
  echo "[mc] 错误：缺少环境变量 MC_API_BASE_URL（后端地址，nginx 将把 /api 反代到该地址）" >&2
  echo "[mc] 仓库自带 compose 部署可省略（默认 http://server:17017 指向 server 容器）；docker run 等场景请用 -e 传入宿主机局域网 IP，如 -e MC_API_BASE_URL=http://192.168.x.x:17017（或自行 --add-host=host.docker.internal:host-gateway 后用该主机名）" >&2
  exit 1
fi

# ── 飞牛（fnOS）音乐库反代（可选）──
# nginx 模板 include /etc/nginx/mc-fnos/*.conf（通配，无文件不报错）；
# 配置了 MC_FNOS_BASE_URL 时按需生成 location 块，剥掉 /fnos 前缀转发到 fnOS 网关
FNOS_ENABLED=false
if [ -n "${MC_FNOS_BASE_URL:-}" ]; then
  FNOS_ENABLED=true
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

# 同源模式：baseUrl 固定空串，浏览器访问容器自身 /api，由 nginx 反代到后端；
# proxyTarget 为信息性字段，把反代目标带给浏览器供设置面板展示
# JSON 转义：密码等环境变量含 " 或 \ 时避免生成损坏的 config.json；
# 控制字符（含换行/Tab）先剔除——sed 无法安全跨行转义，残缺 JSON 会让前端启动失败
json_escape() {
  printf '%s' "$1" | tr -d '\000-\037\177' | sed 's/\\/\\\\/g; s/"/\\"/g'
}
PROXY_TARGET=$(json_escape "${MC_API_BASE_URL}")
FNOS_TARGET=$(json_escape "${MC_FNOS_BASE_URL:-}")
# fnOS 凭据（MC_FNOS_USERNAME/PASSWORD）由 server 容器代持，从不写入浏览器可达的 config.json
cat > /usr/share/nginx/html/config.json <<EOF
{
  "baseUrl": "",
  "proxyTarget": "${PROXY_TARGET}",
  "fnos": {
    "enabled": ${FNOS_ENABLED},
    "proxyTarget": "${FNOS_TARGET}"
  }
}
EOF
echo "[mc] 已生成 config.json（/api 反代目标：${MC_API_BASE_URL}）"
