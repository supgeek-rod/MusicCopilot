#!/usr/bin/env bash
# 解析直链并下载文件（⚠️ 解析需大陆出口，下载不限区域）：kw-download.sh <歌曲id> [br] [输出文件]
set -euo pipefail
ID="${1:?用法: kw-download.sh <歌曲id> [br] [输出文件]}"
BR="${2:-128kmp3}"
OUT="${3:-}"

DIR="$(cd "$(dirname "$0")" && pwd)"
URL="$("$DIR/kw-download-url.sh" "$ID" "$BR" | tail -1)"

if [ -z "$OUT" ]; then
  EXT="${BR##*k}"; EXT="${EXT/mp3/mp3}"; EXT="${EXT/flac/flac}"; EXT="${EXT/ape/ape}"
  case "$BR" in *flac) EXT=flac;; *ape) EXT=ape;; *) EXT=mp3;; esac
  OUT="${ID}_${BR}.${EXT}"
fi

curl -s --noproxy '*' --max-time 300 "$URL" -o "$OUT"
echo "已下载: $OUT ($(wc -c < "$OUT") 字节)"
head -c 4 "$OUT" | od -c | head -1
