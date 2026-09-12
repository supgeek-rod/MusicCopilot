import { z } from 'zod'

/**
 * 音源后端（Laravel server/）客户端：搜索与歌词代理。
 * 契约对齐 SQMusic：{code, msg, data}，code===200 成功（见 docs/api-test-report.md）。
 * 工具不自带音源解析——音源插件收敛在 server/（架构决策 #2/#3）。
 */

const envelopeSchema = z.object({
  code: z.number(),
  msg: z.unknown().optional(),
  data: z.unknown().optional(),
})

export const songRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  artistName: z.array(z.string()).default([]),
  albumName: z.string().nullable().optional(),
  albumid: z.string().nullable().optional(),
  pic: z.string().nullable().optional(),
  duration: z.string().optional(),
  plugName: z.string().default('kw'),
})

export type SongRecord = z.infer<typeof songRecordSchema>

/**
 * 音源后端鉴权（server/ M1 起要求 sqmusic 请求头，缺失/失效返回 HTTP 403）。
 * 凭证经 MC_SERVER_USERNAME / MC_SERVER_PASSWORD 注入；两者为空时不鉴权，
 * 兼容未开启鉴权的后端。token 缓存进程内，收到 403 时重登一次并重试。
 */
let authConfig: { username: string; password: string } = { username: '', password: '' }
let cachedToken: string | null = null

export function configureServerAuth(username: string, password: string): void {
  authConfig = { username, password }
}

async function login(serverUrl: string): Promise<void> {
  const res = await fetch(serverUrl + '/api/config/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...authConfig, device: 'web' }),
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) {
    throw new Error(`音源后端登录 HTTP ${res.status}`)
  }
  const body = envelopeSchema.parse(await res.json())
  const data = body.data as { tokenValue?: unknown } | null
  if (body.code !== 200 || typeof data?.tokenValue !== 'string' || data.tokenValue === '') {
    const msg = typeof body.msg === 'string' ? body.msg : `code=${body.code}`
    throw new Error(`音源后端登录失败：${msg}`)
  }
  cachedToken = data.tokenValue
}

export async function requestJson(url: string, init?: RequestInit): Promise<unknown> {
  const send = (token: string | null): Promise<Response> =>
    fetch(url, {
      ...init,
      headers: { ...init?.headers, ...(token ? { sqmusic: token } : {}) },
      signal: AbortSignal.timeout(20_000),
    })

  let res = await send(cachedToken)
  if (res.status === 403 && authConfig.username !== '') {
    await login(new URL(url).origin)
    res = await send(cachedToken)
  }
  if (!res.ok) {
    throw new Error(`音源后端 HTTP ${res.status}`)
  }
  const body = envelopeSchema.parse(await res.json())
  if (body.code !== 200) {
    throw new Error(typeof body.msg === 'string' && body.msg ? body.msg : `音源后端 code=${body.code}`)
  }
  return body.data
}

/** 搜索单曲（SQMusic 契约 GET /api/music/searchSong） */
export async function searchSong(serverUrl: string, keyword: string, pageSize = 10): Promise<SongRecord[]> {
  const url =
    `${serverUrl}/api/music/searchSong?keyword=${encodeURIComponent(keyword)}` +
    `&plugName=kw&pageIndex=1&pageSize=${pageSize}`
  const data = await requestJson(url) as { records?: unknown[] } | null
  const records = data?.records ?? []
  const out: SongRecord[] = []
  for (const r of records) {
    const parsed = songRecordSchema.safeParse(r)
    if (parsed.success) out.push(parsed.data)
  }
  return out
}

/** 歌词（POST /api/music/getLyric，LRC 文本在 data）；无歌词/接口失败返回 null，不中断写入 */
export async function fetchLyric(serverUrl: string, songId: string): Promise<string | null> {
  try {
    const data = await requestJson(serverUrl + '/api/music/getLyric', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: songId, plugName: 'kw' }),
    })
    if (typeof data === 'string' && data.trim() !== '') return data
  } catch {
    // 多数是「未找到歌词」：候选本身没有歌词，跳过歌词嵌入即可
  }
  return null
}

const MAX_COVER_BYTES = 10 * 1024 * 1024

/** 下载候选封面（嵌入用），非图片或超过 10MB 视为失败 */
export async function fetchCover(url: string): Promise<{ data: Uint8Array; mimeType: string }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  if (!res.ok) {
    throw new Error(`封面下载 HTTP ${res.status}`)
  }
  const mime = (res.headers.get('content-type') ?? '').split(';')[0]!.trim()
  if (!mime.startsWith('image/')) {
    throw new Error(`封面响应非图片：${mime || '未知'}`)
  }
  const buf = new Uint8Array(await res.arrayBuffer())
  if (buf.byteLength > MAX_COVER_BYTES) {
    throw new Error('封面超过 10MB，跳过嵌入')
  }
  return { data: buf, mimeType: mime }
}

/**
 * 目录重排后把新路径回写给 server（下载任务记录的 downloadFile 保持可用）。
 * 内部端点：POST /api/internal/download-task/path {taskId, path}，best-effort 调用。
 */
export async function reportPath(serverUrl: string, taskId: number, relPath: string): Promise<void> {
  const res = await fetch(serverUrl + '/api/internal/download-task/path', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId, path: relPath }),
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) {
    throw new Error(`路径回写 HTTP ${res.status}`)
  }
  const body = envelopeSchema.parse(await res.json())
  if (body.code !== 200) {
    throw new Error(typeof body.msg === 'string' && body.msg ? body.msg : `路径回写 code=${body.code}`)
  }
}
