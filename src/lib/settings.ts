const STORAGE_KEY = 'musiccopilot:download-quality'

/** 常见音质档位（后端音质枚举接口不可用时兜底；解析按码率匹配，与音源命名无关） */
export const FALLBACK_QUALITY_OPTIONS = [
  { id: 'FLAC_2000', label: '无损 FLAC 2000K' },
  { id: 'FLAC_1000', label: '无损 FLAC 1000K' },
  { id: 'MP3_320', label: '320K MP3' },
  { id: 'MP3_128', label: '128K MP3' },
]

/** 读取偏好的下载音质（brType），未设置或存储不可用时返回空串（表示自动选最高音质） */
export function loadDownloadQuality(): string {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return typeof v === 'string' ? v : ''
  } catch {
    return ''
  }
}

/** 保存偏好的下载音质（brType），存储不可用时静默放弃 */
export function saveDownloadQuality(brType: string) {
  try {
    if (brType) localStorage.setItem(STORAGE_KEY, brType)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // 仅保留内存态
  }
}
