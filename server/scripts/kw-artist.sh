#!/usr/bin/env bash
# 歌手信息 / 专辑列表 / 歌手单曲（海外可用）：kw-artist.sh <歌手id> [单曲每页条数]
# 响应体经临时文件传给 node（专辑列表 JSON 可达数百 KB，走 argv 会超长）
set -euo pipefail
ARTISTID="${1:?用法: kw-artist.sh <歌手id> [单曲每页条数]}"
RN="${2:-10}"
UA='User-Agent: kuwo_player/9.1.1.2'
BASE='https://search.kuwo.cn/r.s'
COMMON='alflac=1&show_copyright_off=1&pcmp4=1&encoding=utf8&plat=pc&vipver=MUSIC_9.1.1.2_BCS2&devid=38668888'

D="$(mktemp -d)"
trap 'rm -rf "$D"' EXIT

curl -s --noproxy '*' --max-time 20 "$BASE?stype=artistinfo&encoding=utf8&artistid=$ARTISTID&pcjson=1" -H "$UA" -o "$D/info.json"
curl -s --noproxy '*' --max-time 20 "$BASE?pn=0&rn=10000&artistid=$ARTISTID&stype=albumlist&sortby=1&$COMMON&pcjson=1" -H "$UA" -o "$D/albums.json"
curl -s --noproxy '*' --max-time 20 "$BASE?pn=0&rn=$RN&artistid=$ARTISTID&stype=artist2music&sortby=0&$COMMON&thost=search.kuwo.cn&newver=1&pcjson=1" -H "$UA" -o "$D/songs.json"

node -e '
const fs=require("fs");
const dir=process.argv[1], artistId=process.argv[2];
const j=p=>JSON.parse(fs.readFileSync(p,"utf8"));
const info=j(dir+"/info.json"), albums=j(dir+"/albums.json"), songs=j(dir+"/songs.json");
console.log(JSON.stringify({
  artist:{id:artistId,name:info.name,aartist:info.aartist,albumnum:info.albumnum,country:info.country,birthday:info.birthday},
  albums:(albums.albumlist||[]).map(e=>({albumid:e.albumid,name:e.name,pub:e.pub,musiccnt:e.musiccnt})),
  songsTotal:songs.total,
  songs:(songs.musiclist||[]).map(e=>({id:(e.MUSICRID||"").replace("MUSIC_",""),name:e.NAME,album:e.album,albumId:e.albumId,minfo:e.N_MINFO})),
},null,1));
' "$(cygpath -m "$D" 2>/dev/null || echo "$D")" "$ARTISTID"
