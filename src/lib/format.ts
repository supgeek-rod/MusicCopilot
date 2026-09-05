import type { BrTypeInfo } from '@/api/types'

/** 毫秒时长 → m:ss */
export function formatDuration(ms?: string | number | null): string {
  const n = Number(ms)
  if (!Number.isFinite(n) || n <= 0) return '--:--'
  return formatSeconds(Math.round(n / 1000))
}

/** 秒 → m:ss */
export function formatSeconds(sec?: number | null): string {
  if (!Number.isFinite(sec) || sec! <= 0) return '0:00'
  const total = Math.round(sec!)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function formatSize(bytes?: number | null): string {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n <= 0) return ''
  if (n >= 1024 * 1024 * 1024) return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${n} B`
}

/**
 * 估算下载任务文件大小（零请求）：解析任务自带 downloadMusicInfo 里的音质清单。
 * kw 源的 MINFO 形如 "level:ff,bitrate:2000,format:flac,size:25.35Mb;..."（Mb 实为 MB），
 * 按 brType 尾部码率匹配，格式相同时优先；其他音源结构不同，解析不出返回 null。
 */
export function taskSizeBytes(brType?: string | null, musicInfo?: string | null): number | null {
  if (!brType || !musicInfo) return null
  const { bit, codec } = parseBrType(brType)
  if (!bit) return null
  let info: { MINFO?: unknown; N_MINFO?: unknown }
  try {
    info = JSON.parse(musicInfo)
  } catch {
    return null
  }
  const minfo = [info.MINFO, info.N_MINFO].find(
    (v) => typeof v === 'string' && v,
  ) as string | undefined
  if (!minfo) return null
  const entries = minfo.split(';').map((seg) => {
    const fields: Record<string, string> = {}
    for (const pair of seg.split(',')) {
      const idx = pair.indexOf(':')
      if (idx > 0) fields[pair.slice(0, idx).trim().toLowerCase()] = pair.slice(idx + 1).trim()
    }
    return fields
  })
  const matched = entries.filter((f) => Number(f.bitrate) === bit)
  const hit = matched.find((f) => f.format?.toLowerCase() === codec.toLowerCase()) ?? matched[0]
  const m = hit?.size?.match(/^([\d.]+)\s*([KMG]?)B?$/i)
  if (!m) return null
  const unit: Record<string, number> = { '': 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3 }
  const n = Number(m[1]) * (unit[m[2].toUpperCase()] ?? 1)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** 解析 brType 字符串，如 KW_FLAC_2000 / QQ_Flac_2000 → { codec: 'FLAC', bit: 2000 } */
export function parseBrType(brType: string): { codec: string; bit: number } {
  const parts = String(brType ?? '')
    .split('_')
    .filter(Boolean)
  let bit = 0
  if (parts.length > 1) {
    const last = Number(parts[parts.length - 1])
    if (Number.isFinite(last)) {
      bit = last
      parts.pop()
    }
  }
  const codec = (parts[parts.length - 1] ?? String(brType ?? '')).toUpperCase()
  return { codec, bit }
}

export function brBit(brType: string): number {
  return parseBrType(brType).bit
}

/** 音质从高到低排序 */
export function sortBrTypes(list: string[]): string[] {
  return [...list].sort((a, b) => brBit(b) - brBit(a))
}

/**
 * 按偏好音质解析实际下载音质：
 * 偏好为空取最高；偏好可用则原样返回；不同音源同码率命名不同，视为同档可用；
 * 否则先降档（低于偏好的最近一档）、再升档（高于偏好的最近一档），仍无则取最高。
 * brTypes 为空时返回空串（由后端自动选择）。
 */
export function resolveBrType(preferred: string, brTypes: string[]): string {
  const sorted = sortBrTypes(brTypes)
  if (!sorted.length) return ''
  if (!preferred) return sorted[0]
  if (sorted.includes(preferred)) return preferred
  const bit = brBit(preferred)
  const sameBit = sorted.find((bt) => brBit(bt) === bit)
  if (sameBit) return sameBit
  const lower = sorted.filter((bt) => brBit(bt) < bit)
  if (lower.length) return lower[0]
  const higher = sorted.filter((bt) => brBit(bt) > bit)
  if (higher.length) return higher[higher.length - 1]
  return sorted[0]
}

const LOSSLESS = ['FLAC', 'APE', 'ALAC', 'HIRES', 'HI_RES', 'HR', 'DSF', 'MASTER', 'ATMOS', 'JYMASTER']

export function qualityTier(brType: string): 'lossless' | 'high' | 'standard' {
  const { codec, bit } = parseBrType(brType)
  if (LOSSLESS.some((k) => codec.includes(k))) return 'lossless'
  if (bit >= 320) return 'high'
  return 'standard'
}

/** 音质展示标签：优先用后端音质枚举表里的 type/bit，否则本地解析 */
export function brTypeLabel(brType: string, list?: BrTypeInfo[]): string {
  const hit = list?.find(
    (i) => String(i.id ?? '').toUpperCase() === String(brType).toUpperCase(),
  )
  const { codec, bit } = parseBrType(brType)
  if (hit?.type) {
    const bitNum = Number(hit.bit ?? bit)
    return bitNum ? `${hit.type} ${bitNum}K` : hit.type
  }
  return bit ? `${codec} ${bit}K` : codec
}
