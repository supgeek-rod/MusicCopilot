import type { CandidateRow } from './db.js'
import type { TrackRow } from './db.js'
import { searchSong, type SongRecord } from './sources.js'
import type { Env } from './env.js'

export interface MatchWant {
  title: string
  artist: string | null
  album: string | null
}

export interface MatchResult {
  trackId: number
  path: string
  query: string
  candidates: CandidateRow[]
  error?: string
}

/**
 * 文件名解析出「歌手 - 标题」：剥序号前缀后按常见破折号切分。
 * 「01. A - B.mp3」「A - B」→ {artist, title}；无分隔符 → 仅 title。
 */
export function parseFileName(fileName: string): MatchWant {
  const base = fileName.replace(/\.[^.]+$/, '').trim()
  const stripped = base.replace(/^\d{1,4}[\s._-]+/, '').trim()
  const m = stripped.match(/^(.+?)\s+[-–—]\s+(.+)$/)
  if (m) {
    return { title: m[2]!.trim(), artist: m[1]!.trim() || null, album: null }
  }
  return { title: stripped, artist: null, album: null }
}

/** 归一化：去空白/大小写/常见标点，用于中英文标题粗相似度 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[\s'"“”‘’·、,.。:：;；!！?？()（）\[\]【】<>《》\-–—_~*&/\\|]/g, '')
}

function bigrams(s: string): Set<string> {
  const set = new Set<string>()
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2))
  if (s.length === 1) set.add(s)
  return set
}

/** Dice 系数（bigram），0~1；任一为空串返回 0 */
function similarity(a: string, b: string): number {
  const na = normalize(a)
  const nb = normalize(b)
  if (na === '' || nb === '') return 0
  if (na === nb) return 1
  const ba = bigrams(na)
  const bb = bigrams(nb)
  let inter = 0
  for (const g of ba) if (bb.has(g)) inter++
  return (2 * inter) / (ba.size + bb.size)
}

function scoreRecord(record: SongRecord, want: MatchWant): number {
  const titleSim = similarity(record.name, want.title)
  const artistSim = want.artist
    ? Math.max(0, ...record.artistName.map((a) => similarity(a, want.artist!)))
    : 0.5 // 无参照时中性
  const albumSim = want.album && record.albumName ? similarity(record.albumName, want.album) : null
  const albumBonus = albumSim === null ? 0 : albumSim >= 0.9 ? 0.1 : 0
  const score = titleSim * 0.6 + artistSim * 0.3 + albumBonus
  return Math.round(Math.min(1, score) * 100) / 100
}

function scoreLevel(score: number): CandidateRow['level'] {
  // 0.8 起才算高置信：无歌手参照的查询封顶 0.75（0.6 标题 + 0.15 不确定性），
  // 保证「文件名不可解析且无标签」的文件不会被自动写入，必须人工选择候选
  return score >= 0.8 ? 'high' : score >= 0.55 ? 'medium' : 'low'
}

function toCandidate(record: SongRecord, want: MatchWant): CandidateRow {
  const score = scoreRecord(record, want)
  return {
    id: record.id,
    name: record.name,
    artistName: record.artistName,
    albumName: record.albumName ?? null,
    albumid: record.albumid ?? null,
    pic: record.pic ?? null,
    durationMs: record.duration ? Number(record.duration) || null : null,
    plugName: record.plugName,
    score,
    level: scoreLevel(score),
  }
}

/**
 * 匹配单首：文件名解析 + 现有标签融合出查询词，调 server/ 搜索并打分排序。
 * 标签完整度优先于文件名（标签缺失才靠文件名猜）。
 */
export async function matchTrack(env: Env, track: TrackRow): Promise<MatchResult> {
  const fromName = parseFileName(track.file_name)
  const want: MatchWant = {
    title: track.title?.trim() || fromName.title,
    artist: track.artist?.trim() || fromName.artist,
    album: track.album?.trim() || null,
  }

  const query = want.artist ? `${want.artist} ${want.title}` : want.title
  const candidates: CandidateRow[] = []
  let error: string | undefined

  try {
    const records = await searchSong(env.serverUrl, query, 10)
    for (const record of records) {
      candidates.push(toCandidate(record, want))
    }
    candidates.sort((a, b) => b.score - a.score)
  } catch (e) {
    error = String((e as Error).message ?? e)
  }

  return { trackId: track.id, path: track.path, query, candidates, ...(error ? { error } : {}) }
}
