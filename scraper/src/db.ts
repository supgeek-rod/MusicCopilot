import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'

/** tracks 表行（SQLite 布尔以 0/1 存储） */
export interface TrackRow {
  id: number
  path: string // 相对 musicDir 的路径
  file_name: string
  ext: string
  size_bytes: number
  mtime_ms: number
  title: string | null
  artist: string | null
  album: string | null
  album_artist: string | null
  genre: string | null
  year: number | null
  track_no: number | null
  duration_sec: number | null
  has_cover: number
  has_lyrics: number
  messy_name: number
  codec: string | null
  bitrate: number | null
  sample_rate: number | null
  scanned_at: number
}

export interface JobRow {
  id: string
  kind: 'scan' | 'match' | 'write'
  status: 'queued' | 'running' | 'done' | 'error'
  params_json: string | null
  total: number
  done: number
  error_count: number
  current_file: string | null
  result_json: string | null
  error_message: string | null
  created_at: number
  updated_at: number
}

export interface IgnoreRow {
  path: string
  reason: string | null
  created_at: number
}

export interface Db {
  db: DatabaseSync
  metaGet(key: string): string | null
  metaSet(key: string, value: string): void
  upsertTrack(t: TrackUpsert): void
  deleteTrack(path: string): void
  getTrackByPath(path: string): TrackRow | null
  getTrackById(id: number): TrackRow | null
  listTracks(opts: {
    filter: string
    search: string
    page: number
    pageSize: number
  }): { items: TrackRow[]; total: number }
  stats(): Record<string, number>
  pruneTracks(keepPaths: Set<string>): number
  setMatchResult(trackId: number, candidates: unknown, query: string): void
  getMatchResult(trackId: number): { candidates: CandidateRow[]; query: string } | null
  ignoreAdd(path: string, reason: string | null): void
  ignoreRemove(path: string): void
  ignoreList(): IgnoreRow[]
  ignoreHas(path: string): boolean
  saveJob(j: JobRow): void
  getJob(id: string): JobRow | null
  listJobs(limit: number): JobRow[]
}

export interface TrackUpsert {
  path: string
  fileName: string
  ext: string
  sizeBytes: number
  mtimeMs: number
  title: string | null
  artist: string | null
  album: string | null
  albumArtist: string | null
  genre: string | null
  year: number | null
  trackNo: number | null
  durationSec: number | null
  hasCover: boolean
  hasLyrics: boolean
  messyName: boolean
  codec: string | null
  bitrate: number | null
  sampleRate: number | null
}

export interface CandidateRow {
  id: string
  name: string
  artistName: string[]
  albumName: string | null
  albumid: string | null
  pic: string | null
  durationMs: number | null
  plugName: string
  score: number
  level: 'high' | 'medium' | 'low'
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT UNIQUE NOT NULL,
  file_name TEXT NOT NULL,
  ext TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  mtime_ms INTEGER NOT NULL,
  title TEXT,
  artist TEXT,
  album TEXT,
  album_artist TEXT,
  genre TEXT,
  year INTEGER,
  track_no INTEGER,
  duration_sec REAL,
  has_cover INTEGER NOT NULL DEFAULT 0,
  has_lyrics INTEGER NOT NULL DEFAULT 0,
  messy_name INTEGER NOT NULL DEFAULT 0,
  codec TEXT,
  bitrate INTEGER,
  sample_rate INTEGER,
  scanned_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tracks_title ON tracks(lower(title));
CREATE TABLE IF NOT EXISTS ignore_list (
  path TEXT PRIMARY KEY,
  reason TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  params_json TEXT,
  total INTEGER NOT NULL DEFAULT 0,
  done INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  current_file TEXT,
  result_json TEXT,
  error_message TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS match_results (
  track_id INTEGER PRIMARY KEY,
  query TEXT NOT NULL,
  candidates_json TEXT NOT NULL,
  matched_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`

/** 体检分类过滤 → SQL 条件（忽略清单永远排除；suspect_dup 用自关联） */
const FILTERS: Record<string, string> = {
  all: '1=1',
  missing_cover: 't.has_cover = 0',
  missing_lyrics: 't.has_lyrics = 0',
  missing_album: "(t.album IS NULL OR t.album = '')",
  missing_artist: "(t.artist IS NULL OR t.artist = '')",
  messy_name: 't.messy_name = 1',
  suspect_dup: `EXISTS (
    SELECT 1 FROM tracks d
    WHERE d.id != t.id
      AND lower(COALESCE(t.title, '')) != ''
      AND lower(t.title) = lower(d.title)
      AND COALESCE(lower(t.artist), '') = COALESCE(lower(d.artist), '')
  )`,
}

export function openDb(dbPath: string): Db {
  const db = new DatabaseSync(dbPath)
  db.exec(SCHEMA)

  const stmts = {
    metaGet: db.prepare('SELECT value FROM meta WHERE key = ?'),
    metaSet: db.prepare(
      'INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    ),
    upsertTrack: db.prepare(`
      INSERT INTO tracks(path, file_name, ext, size_bytes, mtime_ms, title, artist, album,
        album_artist, genre, year, track_no, duration_sec, has_cover, has_lyrics, messy_name,
        codec, bitrate, sample_rate, scanned_at)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(path) DO UPDATE SET
        file_name=excluded.file_name, ext=excluded.ext, size_bytes=excluded.size_bytes,
        mtime_ms=excluded.mtime_ms, title=excluded.title, artist=excluded.artist,
        album=excluded.album, album_artist=excluded.album_artist, genre=excluded.genre,
        year=excluded.year, track_no=excluded.track_no, duration_sec=excluded.duration_sec,
        has_cover=excluded.has_cover, has_lyrics=excluded.has_lyrics,
        messy_name=excluded.messy_name, codec=excluded.codec, bitrate=excluded.bitrate,
        sample_rate=excluded.sample_rate, scanned_at=excluded.scanned_at
    `),
    getTrackByPath: db.prepare('SELECT * FROM tracks WHERE path = ?'),
    getTrackById: db.prepare('SELECT * FROM tracks WHERE id = ?'),
    setMatch: db.prepare(`
      INSERT INTO match_results(track_id, query, candidates_json, matched_at)
      VALUES(?, ?, ?, ?)
      ON CONFLICT(track_id) DO UPDATE SET
        query=excluded.query, candidates_json=excluded.candidates_json, matched_at=excluded.matched_at
    `),
    getMatch: db.prepare('SELECT * FROM match_results WHERE track_id = ?'),
    ignoreAdd: db.prepare(
      'INSERT INTO ignore_list(path, reason, created_at) VALUES(?, ?, ?) ON CONFLICT(path) DO UPDATE SET reason=excluded.reason',
    ),
    ignoreRemove: db.prepare('DELETE FROM ignore_list WHERE path = ?'),
    ignoreList: db.prepare('SELECT * FROM ignore_list ORDER BY created_at DESC'),
    ignoreHas: db.prepare('SELECT 1 FROM ignore_list WHERE path = ?'),
    saveJob: db.prepare(`
      INSERT INTO jobs(id, kind, status, params_json, total, done, error_count, current_file,
        result_json, error_message, created_at, updated_at)
      VALUES(@id, @kind, @status, @params_json, @total, @done, @error_count, @current_file,
        @result_json, @error_message, @created_at, @updated_at)
      ON CONFLICT(id) DO UPDATE SET
        status=excluded.status, params_json=excluded.params_json, total=excluded.total,
        done=excluded.done, error_count=excluded.error_count, current_file=excluded.current_file,
        result_json=excluded.result_json, error_message=excluded.error_message,
        updated_at=excluded.updated_at
    `),
    getJob: db.prepare('SELECT * FROM jobs WHERE id = ?'),
    listJobs: db.prepare('SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?'),
  }

  const not = 'AND t.path NOT IN (SELECT path FROM ignore_list)'

  return {
    db,
    metaGet(key) {
      const row = stmts.metaGet.get(key) as { value: string } | undefined
      return row?.value ?? null
    },
    metaSet(key, value) {
      stmts.metaSet.run(key, value)
    },
    upsertTrack(t) {
      stmts.upsertTrack.run(
        t.path, t.fileName, t.ext, t.sizeBytes, t.mtimeMs, t.title, t.artist, t.album,
        t.albumArtist, t.genre, t.year, t.trackNo, t.durationSec, t.hasCover ? 1 : 0,
        t.hasLyrics ? 1 : 0, t.messyName ? 1 : 0, t.codec, t.bitrate, t.sampleRate,
        Date.now(),
      )
    },
    deleteTrack(path) {
      db.prepare('DELETE FROM tracks WHERE path = ?').run(path)
    },
    getTrackByPath(path) {
      return (stmts.getTrackByPath.get(path) as TrackRow | undefined) ?? null
    },
    getTrackById(id) {
      return (stmts.getTrackById.get(id) as TrackRow | undefined) ?? null
    },
    listTracks({ filter, search, page, pageSize }) {
      const cond = FILTERS[filter] ?? FILTERS.all!
      const searchCond = search
        ? 'AND (t.title LIKE ? OR t.artist LIKE ? OR t.file_name LIKE ?)'
        : ''
      const params: (string | number)[] = search
        ? [`%${search}%`, `%${search}%`, `%${search}%`]
        : []
      const totalRow = db.prepare(
        `SELECT COUNT(*) AS n FROM tracks t WHERE (${cond}) ${not} ${searchCond}`,
      ).get(...params) as { n: number }
      const items = db.prepare(
        `SELECT t.* FROM tracks t WHERE (${cond}) ${not} ${searchCond}
         ORDER BY t.path LIMIT ? OFFSET ?`,
      ).all(...params, pageSize, (page - 1) * pageSize) as unknown as TrackRow[]
      return { items, total: totalRow.n }
    },
    stats() {
      const base = db.prepare(
        `SELECT COUNT(*) AS tracks,
          SUM(CASE WHEN has_cover = 0 THEN 1 ELSE 0 END) AS missing_cover,
          SUM(CASE WHEN has_lyrics = 0 THEN 1 ELSE 0 END) AS missing_lyrics,
          SUM(CASE WHEN album IS NULL OR album = '' THEN 1 ELSE 0 END) AS missing_album,
          SUM(CASE WHEN artist IS NULL OR artist = '' THEN 1 ELSE 0 END) AS missing_artist,
          SUM(CASE WHEN messy_name = 1 THEN 1 ELSE 0 END) AS messy_name
        FROM tracks t WHERE t.path NOT IN (SELECT path FROM ignore_list)`,
      ).get() as Record<string, number | null>
      const dup = db.prepare(
        `SELECT COUNT(*) AS n FROM tracks t WHERE (${FILTERS.suspect_dup!}) ${not}`,
      ).get() as { n: number }
      const ignored = db.prepare('SELECT COUNT(*) AS n FROM ignore_list').get() as { n: number }
      return {
        tracks: base.tracks ?? 0,
        missing_cover: base.missing_cover ?? 0,
        missing_lyrics: base.missing_lyrics ?? 0,
        missing_album: base.missing_album ?? 0,
        missing_artist: base.missing_artist ?? 0,
        messy_name: base.messy_name ?? 0,
        suspect_dup: dup.n,
        ignored: ignored.n,
      }
    },
    pruneTracks(keepPaths) {
      const rows = db.prepare('SELECT path FROM tracks').all() as { path: string }[]
      const del = db.prepare('DELETE FROM tracks WHERE path = ?')
      let removed = 0
      for (const { path } of rows) {
        if (!keepPaths.has(path)) {
          del.run(path)
          removed++
        }
      }
      return removed
    },
    setMatchResult(trackId, candidates, query) {
      stmts.setMatch.run(trackId, query, JSON.stringify(candidates), Date.now())
    },
    getMatchResult(trackId) {
      const row = stmts.getMatch.get(trackId) as
        | { candidates_json: string; query: string }
        | undefined
      if (!row) return null
      return { candidates: JSON.parse(row.candidates_json) as CandidateRow[], query: row.query }
    },
    ignoreAdd(path, reason) {
      stmts.ignoreAdd.run(path, reason, Date.now())
    },
    ignoreRemove(path) {
      stmts.ignoreRemove.run(path)
    },
    ignoreList() {
      return stmts.ignoreList.all() as unknown as IgnoreRow[]
    },
    ignoreHas(path) {
      return stmts.ignoreHas.get(path) !== undefined
    },
    saveJob(j) {
      stmts.saveJob.run({ ...j, params_json: j.params_json ?? null })
    },
    getJob(id) {
      return (stmts.getJob.get(id) as JobRow | undefined) ?? null
    },
    listJobs(limit) {
      return stmts.listJobs.all(limit) as unknown as JobRow[]
    },
  }
}

/** SQLite 文件路径（在 dataDir 下） */
export function dbFilePath(dataDir: string): string {
  return join(dataDir, 'scraper.sqlite')
}
