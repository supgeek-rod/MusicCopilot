#!/usr/bin/env bash
# 专辑详情（含曲目，海外可用）：kw-album.sh <专辑id> [rn]
set -euo pipefail
ALBUMID="${1:?用法: kw-album.sh <专辑id> [rn]}"
RN="${2:-100}"
curl -s --noproxy '*' --max-time 20 "https://search.kuwo.cn/r.s?pn=0&rn=$RN&albumid=$ALBUMID&stype=albuminfo&show_copyright_off=1&alflac=1&pcmp4=1&encoding=utf8&plat=pc&vipver=MUSIC_9.1.1.2_BCS2&devid=38668888&newver=1&pcjson=1" \
  -H 'User-Agent: kuwo_player/9.1.1.2' \
| node -e '
let raw="";process.stdin.on("data",d=>raw+=d).on("end",()=>{
  const j=JSON.parse(raw);
  console.log(JSON.stringify({
    album:{albumid:j.albumid,name:j.name,artist:j.artist,artistid:j.artistid,pub:j.pub,songnum:j.songnum,company:j.company,lang:j.lang,info:(j.info||"").slice(0,120)},
    musiclist:(j.musiclist||[]).map(e=>({id:(e.MUSICRID||e.musicrid||"").toString().replace("MUSIC_",""),name:e.NAME||e.name,track:e.track||e.TRACK,minfo:e.N_MINFO})),
  },null,1));
});'
