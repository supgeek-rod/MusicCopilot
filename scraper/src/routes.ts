import { access } from 'node:fs/promises'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { loadConfig, saveConfig, scraperConfigSchema, type ScraperConfig } from './config.js'
import type { Db, JobRow, TrackRow } from './db.js'
import { downloadTagSchema } from './downloads.js'
import type { Env } from './env.js'
import { ConflictError, type JobRunner, type JobState } from './jobs.js'

export interface Ctx {
  env: Env
  db: Db
  runner: JobRunner
  version: string
}

function jobDto(job: JobState | JobRow) {
  if ('params' in job) {
    // 运行态（内存）：result/errors 为原生对象
    return {
      id: job.id,
      kind: job.kind,
      status: job.status,
      params: job.params as Record<string, unknown>,
      total: job.total,
      done: job.done,
      errorCount: job.errorCount,
      currentFile: job.currentFile,
      result: job.result,
      errors: job.errors,
      errorMessage: job.errorMessage,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    }
  }
  // 历史快照（SQLite）：JSON 字符串还原
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    params: job.params_json ? (JSON.parse(job.params_json) as Record<string, unknown>) : {},
    total: job.total,
    done: job.done,
    errorCount: job.error_count,
    currentFile: job.current_file,
    result: job.result_json ? (JSON.parse(job.result_json) as unknown) : undefined,
    errors: [] as { path?: string; message: string }[],
    errorMessage: job.error_message,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
  }
}

export function trackDto(t: TrackRow) {
  return {
    id: t.id,
    path: t.path,
    fileName: t.file_name,
    ext: t.ext,
    title: t.title,
    artist: t.artist,
    album: t.album,
    albumArtist: t.album_artist,
    genre: t.genre,
    year: t.year,
    trackNo: t.track_no,
    durationSec: t.duration_sec,
    hasCover: t.has_cover === 1,
    hasLyrics: t.has_lyrics === 1,
    messyName: t.messy_name === 1,
    codec: t.codec,
    bitrateKbps: t.bitrate,
    sampleRate: t.sample_rate,
    sizeBytes: t.size_bytes,
    mtimeMs: t.mtime_ms,
  }
}

const tracksQuerySchema = z.object({
  filter: z
    .enum(['all', 'missing_cover', 'missing_lyrics', 'missing_album', 'missing_artist', 'messy_name', 'suspect_dup'])
    .default('all'),
  search: z.string().default(''),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
})

const matchBodySchema = z.object({
  trackIds: z.array(z.number().int()).min(1).max(500),
})

const writeBodySchema = z.object({
  trackIds: z.array(z.number().int()).min(1).max(500),
  dryRun: z.boolean().default(true),
  /** trackId → 候选下标；缺省用首个达 minScore 的候选 */
  selections: z.record(z.string(), z.number().int().min(0)).default({}),
})

const ignoreBodySchema = z.object({
  trackId: z.number().int(),
  reason: z.string().max(200).optional(),
})

export function registerRoutes(app: FastifyInstance, ctx: Ctx): void {
  const { env, db, runner } = ctx

  app.get('/status', async () => {
    const config = loadConfig(db)
    const lastScan = db.listJobs(50).find((j) => j.kind === 'scan' && j.status === 'done')
    return {
      version: ctx.version,
      musicDir: env.musicDir,
      serverUrl: env.serverUrl,
      authEnabled: env.token !== '',
      config,
      stats: db.stats(),
      lastScanAt: lastScan?.updated_at ?? null,
    }
  })

  app.post('/scan', async (_req, reply) => {
    try {
      await access(env.musicDir)
    } catch {
      return reply.code(400).send({ error: `音乐目录不存在或不可读：${env.musicDir}` })
    }
    try {
      const job = runner.enqueueScan()
      return reply.code(202).send({ jobId: job.id })
    } catch (e) {
      if (e instanceof ConflictError) return reply.code(409).send({ error: e.message })
      throw e
    }
  })

  app.get('/tracks', async (req, reply) => {
    const parsed = tracksQuerySchema.safeParse(req.query)
    if (!parsed.success) return reply.code(400).send({ error: '参数错误', detail: parsed.error.flatten() })
    const { items, total } = db.listTracks(parsed.data)
    return { items: items.map(trackDto), total, page: parsed.data.page, pageSize: parsed.data.pageSize }
  })

  app.post('/match', async (req, reply) => {
    const parsed = matchBodySchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'trackIds 必填（1~500 个）' })
    try {
      const job = runner.enqueueMatch(parsed.data.trackIds)
      return reply.code(202).send({ jobId: job.id })
    } catch (e) {
      if (e instanceof ConflictError) return reply.code(409).send({ error: e.message })
      throw e
    }
  })

  app.post('/write', async (req, reply) => {
    const parsed = writeBodySchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'trackIds 必填；dryRun 默认 true' })
    try {
      const job = runner.enqueueWrite(parsed.data.trackIds, parsed.data.dryRun, parsed.data.selections)
      return reply.code(202).send({ jobId: job.id })
    } catch (e) {
      if (e instanceof ConflictError) return reply.code(409).send({ error: e.message })
      throw e
    }
  })

  // server/ 下载完成推送（M4 自动刮削）：真值元数据 + 音乐目录根文件名，排队后串行写标签
  app.post('/downloads', async (req, reply) => {
    const parsed = downloadTagSchema.safeParse(req.body)
    if (!parsed.success) {
      const detail = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('；')
      return reply.code(400).send({ error: `载荷无效：${detail}` })
    }
    const job = runner.enqueueDownloadTag(parsed.data)
    return reply.code(202).send({ jobId: job.id })
  })

  app.get('/jobs', async () => {
    return { items: db.listJobs(100).map((j) => jobDto(j)) }
  })

  app.get('/jobs/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const mem = runner.get(id)
    if (mem) return jobDto(mem)
    const row = db.getJob(id)
    if (row) return jobDto(row)
    return reply.code(404).send({ error: '任务不存在' })
  })

  app.get('/config', async () => {
    return loadConfig(db)
  })

  app.put('/config', async (req, reply) => {
    const parsed = scraperConfigSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: '配置格式错误', detail: parsed.error.flatten() })
    }
    const saved = saveConfig(db, parsed.data as ScraperConfig)
    return saved
  })

  app.get('/ignore', async () => {
    return { items: db.ignoreList() }
  })

  app.post('/ignore', async (req, reply) => {
    const parsed = ignoreBodySchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'trackId 必填' })
    const track = db.getTrackById(parsed.data.trackId)
    if (!track) return reply.code(404).send({ error: '曲目不存在' })
    db.ignoreAdd(track.path, parsed.data.reason ?? null)
    return { ok: true, path: track.path }
  })

  app.delete('/ignore/:trackId', async (req, reply) => {
    const trackId = Number((req.params as { trackId: string }).trackId)
    if (!Number.isInteger(trackId)) return reply.code(400).send({ error: 'trackId 必须是整数' })
    const track = db.getTrackById(trackId)
    if (!track) return reply.code(404).send({ error: '曲目不存在' })
    db.ignoreRemove(track.path)
    return { ok: true, path: track.path }
  })
}
