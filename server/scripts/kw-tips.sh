#!/usr/bin/env bash
# 搜索提示：kw-tips.sh <关键词>
# 关键词先经 node encodeURIComponent 成 ASCII（mingw curl argv 中文会按 GBK 处理）
set -euo pipefail
KEY="${1:?用法: kw-tips.sh <关键词>}"

Q="$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$KEY")"

curl -s --noproxy '*' --max-time 20 \
  "https://kuwo.cn/openapi/v1/www/search/searchKey?key=$Q&httpsStatus=1" \
  -H 'User-Agent: Mozilla/5.0' \
| node -e '
let raw="";process.stdin.on("data",d=>raw+=d).on("end",()=>{
  const j=JSON.parse(raw);
  if(j.code!==200){console.log("error:",JSON.stringify(j));process.exit(1);}
  for(const item of j.data||[]){
    const m=/RELWORD=([^\r\n]*)/.exec(item);
    if(m) console.log(m[1]);
  }
});'
