#!/usr/bin/env bash
# 酷我搜索：kw-search.sh <关键词> [music|artist|album] [pn 从0开始] [rn 每页条数]
# HTTP 全部走 curl；node 做 URL 编码与 JSON 美化
# 坑1：Windows mingw curl 会把 argv 里的中文按 GBK 处理（--data-urlencode 传中文会坏，
#      @file 形式参数甚至会被整个丢弃），所以关键词先经 node encodeURIComponent 成 ASCII 再拼 URL
# 坑2：--noproxy 直连（酷我是大陆服务；走海外代理会导致搜索相关性变差、直链 407）
set -euo pipefail
KEY="${1:?用法: kw-search.sh <关键词> [music|artist|album] [pn] [rn]}"
TYPE="${2:-music}"
PN="${3:-0}"
RN="${4:-10}"

Q="$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$KEY")"

curl -s --noproxy '*' --max-time 20 \
  "http://search.kuwo.cn/r.s?client=kt&encoding=utf8&rformat=json&mobi=1&vipver=1&pn=$PN&rn=$RN&correct=1&all=$Q&ft=$TYPE" \
  -H 'User-Agent: kuwo_player/9.1.1.2' \
| node -e '
let raw="";process.stdin.on("data",d=>raw+=d).on("end",()=>{
  const j=JSON.parse(raw); const type=process.argv[1];
  console.log(`total=${j.TOTAL ?? "?"}`);
  const rows=[];
  if(type==="album"){
    for(const e of j.albumlist||[]) rows.push({albumid:e.albumid,name:e.name,artist:e.artist,artistid:e.artistid,pub:e.pub,musiccnt:e.musiccnt});
  }else if(type==="artist"){
    for(const e of j.abslist||[]) rows.push({artistid:e.ARTISTID,name:e.ARTIST,albumnum:e.ALBUMNUM});
  }else{
    for(const e of j.abslist||[]) rows.push({id:(e.MUSICRID||"").replace("MUSIC_",""),name:e.NAME,artist:e.ARTIST,album:e.ALBUM,albumid:e.ALBUMID,duration:e.DURATION,minfo:e.N_MINFO});
  }
  console.log(JSON.stringify(rows,null,1));
});' "$TYPE"
