#!/usr/bin/env bash
# 直链解析（⚠️ 需大陆出口 IP，海外返回 code:407）：kw-download-url.sh <歌曲id> [br]
# br 取值: 128kmp3 | 192kmp3 | 320kmp3 | 1000kape | 2000kflac
set -euo pipefail
ID="${1:?用法: kw-download-url.sh <歌曲id> [br]}"
BR="${2:-128kmp3}"

RESP="$(curl -s --noproxy '*' --max-time 20 "https://mobi.kuwo.cn/mobi.s?f=web&user=0&source=kwplayer_ar_5.0.0.0_B_jiakong_vh.apk&type=convert_url_with_sign&rid=$ID&br=$BR" -H 'User-Agent: kwplayer_ar_5.0.0.0')"

node -e '
const j=JSON.parse(process.argv[1]);
if(j.code!==200){
  console.error(`解析失败 code=${j.code} msg=${j.msg}`);
  if(j.code===407) console.error("→ 该接口有大陆 IP 区域限制，海外出口不可用（详见 docs/kuwo-api-notes.md §0）");
  process.exit(1);
}
console.log(`bitrate=${j.data.bitrate} format=${j.data.format}`);
console.log(j.data.url);
' "$RESP"
