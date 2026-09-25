const STORAGE_KEY = 'music-copilot:search-history'
const MAX_ITEMS = 10

/** 读取本地搜索历史（最新在前），缺失或损坏时返回空数组 */
export function loadSearchHistory(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const list = raw ? (JSON.parse(raw) as unknown) : null
    if (!Array.isArray(list)) return []
    return list.filter((v): v is string => typeof v === 'string' && v.length > 0)
  } catch {
    return []
  }
}

function persist(list: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // 存储不可用（隐私模式等）时静默放弃，仅保留内存态
  }
}

/** 记录一次搜索：去重后置于最前，超出上限丢弃尾部 */
export function recordSearchHistory(kw: string): string[] {
  const list = [kw, ...loadSearchHistory().filter((v) => v !== kw)].slice(0, MAX_ITEMS)
  persist(list)
  return list
}

/** 删除单条历史 */
export function removeSearchHistory(kw: string): string[] {
  const list = loadSearchHistory().filter((v) => v !== kw)
  persist(list)
  return list
}

/** 清空全部历史 */
export function clearSearchHistory(): string[] {
  persist([])
  return []
}
