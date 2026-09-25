/** 全局快捷键清单：设置页「快捷键」分区与快捷键弹窗共用 */
export interface ShortcutItem {
  /** 按键序列，从左到右为组合键 → 主键 */
  keys: string[]
  action: string
}

export const SHORTCUTS: ShortcutItem[] = [
  { keys: ['Space'], action: '播放 / 暂停' },
  { keys: ['/'], action: '聚焦搜索框' },
  { keys: ['?'], action: '打开快捷键速查' },
  { keys: ['Ctrl', '→'], action: '下一曲' },
  { keys: ['Ctrl', '←'], action: '上一曲' },
  { keys: ['Ctrl', '↑'], action: '音量加大' },
  { keys: ['Ctrl', '↓'], action: '音量减小' },
]
