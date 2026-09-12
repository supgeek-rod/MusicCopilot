import { randomUUID } from 'node:crypto'
import { join, resolve } from 'node:path'
import type { ScraperConfig } from './config.js'
import type { Db, JobRow, TrackRow } from './db.js'
import { buildDownloadPlan, fetchAlbumContext, resolveDownloadTarget, type DownloadTagPayload } from './downloads.js'
import type { Env } from './env.js'
import { getGenreProvider } from './genres.js'
import { matchTrack, type MatchResult } from './matcher.js'
import { relocateDownload } from './relocate.js'
import { scanLibrary, isMessyName } from './scanner.js'
import { reportPath } from './sources.js'
import { applyPlan, buildPlan, planRename } from './writer.js'

/** 绝对路径 → 相对音乐目录的 posix 风格路径 */
function relOfAbs(env: Env, abs: string): string {
  const root = resolve(env.musicDir)
  const full = resolve(abs)
  return full.startsWith(root) ? full.slice(root.length + 1).split('\\').join('/') : abs
}

export type JobKind = 'scan' | 'match' | 'write' | 'download-tag'
export type JobStatus = 'queued' | 'running' | 'done' | 'error'

export interface JobState {
  id: string
  kind: JobKind
  status: JobStatus
  params: Record<string, unknown>
  total: number
  done: number
  errorCount: number
  currentFile: string | null
  result: unknown
  errors: { path?: string; message: string }[]
  errorMessage: string | null
  createdAt: number
  updatedAt: number
}

export interface WriteItemResult {
  trackId: number
  path: string
  status: 'written' | 'would-write' | 'skipped' | 'error'
  message?: string
  renamedTo?: string
  applied?: { field: string; from: string | null; to: string }[]
}

const PERSIST_INTERVAL = 5

/**
 * 内存任务队列：同一时间只跑一个任务（扫描/写文件都是重 IO，串行避免竞态）。
 * 任务快照落 SQLite（jobs 表），重启后历史可查；运行态以内存为准。
 */
export class JobRunner {
  private jobs = new Map<string, JobState>()
  private queue: string[] = []
  private processing = false

  constructor(
    private env: Env,
    private db: Db,
    private getConfig: () => ScraperConfig,
  ) {}

  /** 有任务在跑或排队中 */
  busy(): boolean {
    return this.processing || this.queue.length > 0
  }

  activeOfKind(kind: JobKind): JobState | undefined {
    for (const id of this.queue) {
      const job = this.jobs.get(id)
      if (job && job.kind === kind) return job
    }
    if (this.processing) {
      for (const job of this.jobs.values()) {
        if (job.kind === kind && (job.status === 'running' || job.status === 'queued')) return job
      }
    }
    return undefined
  }

  get(id: string): JobState | null {
    return this.jobs.get(id) ?? null
  }

  private persist(job: JobState): void {
    const row: JobRow = {
      id: job.id,
      kind: job.kind,
      status: job.status,
      params_json: JSON.stringify(job.params),
      total: job.total,
      done: job.done,
      error_count: job.errorCount,
      current_file: job.currentFile,
      result_json: job.result === undefined ? null : JSON.stringify(job.result),
      error_message: job.errorMessage,
      created_at: job.createdAt,
      updated_at: job.updatedAt,
    }
    this.db.saveJob(row)
  }

  private enqueue(kind: JobKind, params: Record<string, unknown>, allowQueued = false): JobState {
    if (!allowQueued) {
      // 单例任务（scan/match/write）：同一时刻只允许一个，避免重复扫描/写入竞态
      const existing = this.activeOfKind(kind)
      if (existing) throw new ConflictError(`${kind} 任务正在进行中（${existing.id}）`)
    }

    const job: JobState = {
      id: randomUUID(),
      kind,
      status: 'queued',
      params,
      total: 0,
      done: 0,
      errorCount: 0,
      currentFile: null,
      result: undefined,
      errors: [],
      errorMessage: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    this.jobs.set(job.id, job)
    this.queue.push(job.id)
    this.persist(job)
    void this.drain()
    return job
  }

  private async drain(): Promise<void> {
    if (this.processing) return
    this.processing = true
    try {
      while (this.queue.length > 0) {
        const id = this.queue.shift()!
        const job = this.jobs.get(id)
        if (!job) continue
        job.status = 'running'
        job.updatedAt = Date.now()
        this.persist(job)
        try {
          switch (job.kind) {
            case 'scan':
              await this.runScan(job)
              break
            case 'match':
              await this.runMatch(job)
              break
            case 'write':
              await this.runWrite(job)
              break
            case 'download-tag':
              await this.runDownloadTag(job)
              break
          }
          job.status = 'done'
        } catch (e) {
          job.status = 'error'
          job.errorMessage = String((e as Error).message ?? e)
        }
        job.currentFile = null
        job.updatedAt = Date.now()
        this.persist(job)
      }
    } finally {
      this.processing = false
    }
  }

  private touch(job: JobState, done: number, current: string | null): void {
    job.done = done
    job.currentFile = current
    job.updatedAt = Date.now()
    if (done % PERSIST_INTERVAL === 0 || current === null) this.persist(job)
  }

  private async runScan(job: JobState): Promise<void> {
    const summary = await scanLibrary(this.env, this.db, (done, total, current) => {
      job.total = total
      this.touch(job, done, current === '' ? null : current)
    })
    job.result = summary
    job.errors = summary.errors
    job.errorCount = summary.errors.length
  }

  private async runMatch(job: JobState): Promise<void> {
    const trackIds = (job.params.trackIds as number[]) ?? []
    job.total = trackIds.length
    const results: MatchResult[] = []
    const concurrency = this.getConfig().matchConcurrency
    let cursor = 0

    const worker = async (): Promise<void> => {
      while (cursor < trackIds.length) {
        const trackId = trackIds[cursor++]!
        const track = this.db.getTrackById(trackId)
        if (!track) {
          results.push({ trackId, path: '', query: '', candidates: [], error: '曲目不存在（可能已被重新扫描移除）' })
        } else {
          const result = await matchTrack(this.env, track)
          if (result.candidates.length > 0) {
            this.db.setMatchResult(trackId, result.candidates, result.query)
          }
          results.push(result)
        }
        this.touch(job, results.length, track ? track.path : String(trackId))
      }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, trackIds.length) }, worker))
    job.result = { results }
    job.errors = results.filter((r) => r.error !== undefined).map((r) => ({ path: r.path, message: r.error! }))
    job.errorCount = job.errors.length
  }

  private async runWrite(job: JobState): Promise<void> {
    const trackIds = (job.params.trackIds as number[]) ?? []
    const dryRun = (job.params.dryRun as boolean) ?? false
    const selections = (job.params.selections as Record<string, number>) ?? {}
    const config = this.getConfig()
    job.total = trackIds.length

    const items: WriteItemResult[] = []
    for (const trackId of trackIds) {
      const track = this.db.getTrackById(trackId)
      if (!track) {
        items.push({ trackId, path: '', status: 'error', message: '曲目不存在' })
        this.touch(job, items.length, null)
        continue
      }

      try {
        const stored = this.db.getMatchResult(trackId)
        if (!stored || stored.candidates.length === 0) {
          items.push({ trackId, path: track.path, status: 'skipped', message: '无匹配结果，请先执行匹配' })
          this.touch(job, items.length, track.path)
          continue
        }

        const selIndex = selections[String(trackId)]
        const candidate =
          selIndex !== undefined
            ? stored.candidates[selIndex]
            : (stored.candidates.find((c) => c.score >= config.minScore) ?? undefined)
        if (!candidate) {
          items.push({
            trackId,
            path: track.path,
            status: 'skipped',
            message: selIndex !== undefined ? '指定候选不存在' : `无置信度 ≥ ${config.minScore} 的候选`,
          })
          this.touch(job, items.length, track.path)
          continue
        }

        const renameTo = planRename(track, candidate, config)
        // 流派补全（A2）：fill-missing 且文件无流派时查第三方源；dryRun 也预览意图
        let genreHint: string | undefined
        if (config.genreEnabled && config.writePolicy !== 'overwrite' && (track.genre ?? '').trim() === '') {
          const provider = getGenreProvider(this.env)
          if (provider) {
            genreHint = await provider.fetchGenre(track.album ?? candidate.albumName ?? '', track.artist ?? candidate.artistName[0] ?? '')
          }
        }
        const plan = await buildPlan(this.env, track, candidate, config, dryRun, genreHint)
        if (renameTo !== undefined) {
          plan.changes.push({ field: 'rename', from: track.file_name, to: renameTo })
          plan.renameTo = renameTo
        }

        if (dryRun) {
          items.push({ trackId, path: track.path, status: 'would-write', applied: plan.changes })
          this.touch(job, items.length, track.path)
          continue
        }

        const result = await applyPlan(this.env, plan, config)
        if (result.status === 'written') {
          this.updateTrackAfterWrite(track, plan, result.renamedTo)
        }
        items.push({
          trackId,
          path: track.path,
          status: result.status,
          message: result.message,
          renamedTo: result.renamedTo,
          applied: result.applied,
        })
      } catch (e) {
        const message = String((e as Error).message ?? e)
        items.push({ trackId, path: track.path, status: 'error', message })
        job.errorCount++
      }
      this.touch(job, items.length, track.path)
    }

    job.result = { dryRun, items }
    job.errors = items
      .filter((i) => i.status === 'error')
      .map((i) => ({ path: i.path, message: i.message ?? '未知错误' }))
  }

  /** 写入成功后同步 SQLite 行（标签/封面/歌词标志、可能的改名） */
  private updateTrackAfterWrite(
    track: TrackRow,
    plan: { changes: { field: string; to: string }[] },
    renamedTo?: string,
  ): void {
    const changeOf = (field: string): string | undefined =>
      plan.changes.find((c) => c.field === field)?.to
    const title = changeOf('title') ?? track.title
    const artist = changeOf('artist') ?? track.artist
    const album = changeOf('album') ?? track.album
    const albumArtist = changeOf('albumArtist') ?? track.album_artist
    const hasCover = plan.changes.some((c) => c.field === 'cover') ? 1 : track.has_cover
    const hasLyrics = plan.changes.some((c) => c.field === 'lyrics') ? 1 : track.has_lyrics
    const newPath = renamedTo ?? track.path
    const fileName = renamedTo ?? track.file_name
    this.db.upsertTrack({
      path: newPath,
      fileName,
      ext: track.ext,
      sizeBytes: track.size_bytes,
      mtimeMs: track.mtime_ms,
      title,
      artist,
      album,
      albumArtist,
      genre: track.genre,
      year: track.year,
      trackNo: track.track_no,
      durationSec: track.duration_sec,
      hasCover: hasCover === 1,
      hasLyrics: hasLyrics === 1,
      messyName: isMessyName(fileName),
      codec: track.codec,
      bitrate: track.bitrate,
      sampleRate: track.sample_rate,
    })
    if (renamedTo !== undefined && newPath !== track.path) {
      this.db.deleteTrack(track.path)
    }
  }

  /** 下载完成自动刮削（server/ 推送通知）：单文件真值写标签，可多个排队串行执行 */
  private async runDownloadTag(job: JobState): Promise<void> {
    const payload = job.params as unknown as DownloadTagPayload
    job.total = 1
    this.touch(job, 0, payload.fileName)

    const abs = await resolveDownloadTarget(this.env, payload.fileName)
    // 专辑上下文先取（目录布局与年份/音轨号写入共用）；失败降级为部分值
    const ctx = await fetchAlbumContext(this.env, payload)
    // 流派（A2）：第三方源查询，fill 语义；失败静默
    let genreHint: string | undefined
    if (this.getConfig().genreEnabled) {
      const provider = getGenreProvider(this.env)
      if (provider) {
        genreHint = await provider.fetchGenre(payload.album ?? '', payload.artist ?? '')
      }
    }
    const plan = await buildDownloadPlan(this.env, abs, payload, this.getConfig(), ctx, genreHint)
    const result = await applyPlan(this.env, plan, this.getConfig())

    // 标签写好后按目录模板重排（Navidrome 友好）；失败保持原位，不回滚已写入的标签
    let finalRel = relOfAbs(this.env, abs)
    let relocateError: string | undefined
    let moved = false
    if (result.status === 'written' || result.status === 'skipped') {
      const artistOf = plan.changes.find((c) => c.field === 'artist')?.to ?? payload.artist ?? ''
      const values = {
        albumArtist: ctx.albumArtist || artistOf,
        album: ctx.album || payload.album || '',
        artist: artistOf,
        title: plan.changes.find((c) => c.field === 'title')?.to ?? payload.name,
        year: ctx.year,
        trackNo: ctx.trackNo,
        ext: '',
      }
      const rel = await relocateDownload(this.env, finalRel, this.getConfig().dirTemplate, values)
      finalRel = rel.relPath
      relocateError = rel.error
      moved = rel.moved
    }

    // 新路径回写 server 任务记录（best-effort，失败不影响本地结果）
    if (moved && payload.taskId) {
      await reportPath(this.env.serverUrl, payload.taskId, finalRel).catch(() => undefined)
    }

    job.result = {
      fileName: payload.fileName,
      ...result,
      relocatedTo: moved ? finalRel : undefined,
      relocateError,
    }
    this.touch(job, 1, null)
  }

  enqueueScan(): JobState {
    return this.enqueue('scan', {})
  }

  enqueueMatch(trackIds: number[]): JobState {
    return this.enqueue('match', { trackIds })
  }

  enqueueWrite(trackIds: number[], dryRun: boolean, selections: Record<string, number>): JobState {
    return this.enqueue('write', { trackIds, dryRun, selections })
  }

  enqueueDownloadTag(payload: DownloadTagPayload): JobState {
    return this.enqueue('download-tag', payload as unknown as Record<string, unknown>, true)
  }
}

export class ConflictError extends Error {}
