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
