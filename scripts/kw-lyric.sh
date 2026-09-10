#!/usr/bin/env bash
# 歌词（newlyric 加密接口；仅 lrcx=1 模式实测有效）：kw-lyric.sh <歌曲id>
# 加密链路：参数 XOR "yeelion" → base64 → GET → 校验 tp=content → 按 \r\n\r\n 分隔 →
#           zlib inflate → base64 解码 → 再 XOR "yeelion" → gb18030 解码
# 注意：user/requester 是魔法值不可改；服务端多节点间歇性返回 TP=ERROR REQUEST
#       （与 UA/重放无关，按时间窗口波动），必须退避重试；Laravel 实现同理 + 结果缓存
set -euo pipefail
ID="${1:?用法: kw-lyric.sh <歌曲id>}"
TMP="$(mktemp)"
# Windows 原生 node 不认 MSYS 的 /tmp 路径，转成 C:/... 混合路径
TMPN="$(cygpath -m "$TMP" 2>/dev/null || echo "$TMP")"
trap 'rm -f "$TMP"' EXIT

QUERY="$(node -e '
const KEY=Buffer.from("yeelion");
const params=Buffer.from("user=12345,web,web,web&requester=localhost&req=1&rid=MUSIC_'+$ID+'&lrcx=1");
const out=Buffer.alloc(params.length);
for(let i=0,j=0;i<params.length;i++,j=(j+1)%KEY.length) out[i]=params[i]^KEY[j];
process.stdout.write(encodeURIComponent(out.toString("base64")));
')"

DECODE_OK=0
for ATTEMPT in 1 2 3; do
  curl -s --noproxy '*' --max-time 20 "http://newlyric.kuwo.cn/newlyric.lrc?$QUERY" -o "$TMP"
  if node -e '
const zlib=require("zlib"),fs=require("fs");
const KEY=Buffer.from("yeelion");
const xor=b=>{const o=Buffer.alloc(b.length);for(let i=0,j=0;i<b.length;i++,j=(j+1)%KEY.length)o[i]=b[i]^KEY[j];return o;};
const buf=fs.readFileSync(process.argv[1]);
if(buf.subarray(0,10).toString()!=="tp=content") process.exit(2);
const idx=buf.indexOf("\r\n\r\n");
const body=zlib.inflateSync(buf.subarray(idx+4));
process.stdout.write(new TextDecoder("gb18030").decode(xor(Buffer.from(body.toString("utf8"),"base64"))));
' "$TMPN"; then
    DECODE_OK=1
    break
  fi
  if [ "$ATTEMPT" != "3" ]; then
    sleep $((ATTEMPT * 2))
  fi
done
[ "$DECODE_OK" = "1" ]
