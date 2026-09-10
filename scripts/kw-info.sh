#!/usr/bin/env bash
# 歌曲详情 + 可用音质清单（musicpay 接口，海外可用）：kw-info.sh <歌曲id>
set -euo pipefail
ID="${1:?用法: kw-info.sh <歌曲id>}"
curl -s --noproxy '*' --max-time 20 "http://musicpay.kuwo.cn/music.pay?newver=2&uid=0&sid=&android_id=76a84aed3ff799de&from=ar&deviceid=76a84aed3ff799de&ver=11.1.9.1&src=kwplayer_ar_11.1.9.1_kwtest.apk&appuid=2752816366&allpay=1&notrace=0&oaid=bbcdcf642ce70f13&op=query&action=play&signver=new&filter=no&apiversion=2&local=0&quality=H&preload=0&ids=$ID" \
  -H 'User-Agent: kwplayer_ar_11.1.9.1_kwtest.apk' \
| node -e '
let raw="";process.stdin.on("data",d=>raw+=d).on("end",()=>{
  const j=JSON.parse(raw);
  if(j.errorcode!==0||!j.songs||!j.songs.length){console.log("error:",JSON.stringify(j).slice(0,300));process.exit(1);}
  const s=j.songs[0];
  console.log(JSON.stringify({id:s.id,name:s.name,artist:s.artist,artistid:s.artistid,album:s.album,albumid:s.albumid,duration:s.duration,minfo:s.MINFO},null,1));
});'
