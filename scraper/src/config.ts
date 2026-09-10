import { z } from 'zod'
import type { Db } from './db.js'

/**
 * 刮削行为配置：持久化在 SQLite meta 表（经 Web 后台修改），env 只提供部署级参数。
 * fill-missing 仅补空缺字段；overwrite 用候选整组覆盖（更激进，UI 默认前者）。
 */
export const scraperConfigSchema = z.object({
  writePolicy: z.enum(['fill-missing', 'overwrite']).default('fill-missing'),
  embedCover: z.boolean().default(true),
  embedLyrics: z.boolean().default(true),
  renameEnabled: z.boolean().default(false),
  renameTemplate: z.string().default('{artist} - {title}'),
  backup: z.boolean().default(true),
  /** 自动选候选的置信度下限；无歌手参照的查询封顶 0.75，默认 0.8 保证脏数据需人工确认 */
  minScore: z.number().min(0).max(1).default(0.8),
  matchConcurrency: z.number().int().min(1).max(8).default(3),
})

export type ScraperConfig = z.infer<typeof scraperConfigSchema>

const DEFAULTS = scraperConfigSchema.parse({})

const CONFIG_KEY = 'config'

export function loadConfig(db: Db): ScraperConfig {
  const raw = db.metaGet(CONFIG_KEY)
  if (raw === null) return { ...DEFAULTS }
  const parsed = scraperConfigSchema.safeParse(JSON.parse(raw))
  return parsed.success ? { ...DEFAULTS, ...parsed.data } : { ...DEFAULTS }
}

export function saveConfig(db: Db, config: ScraperConfig): ScraperConfig {
  const parsed = scraperConfigSchema.parse(config)
  db.metaSet(CONFIG_KEY, JSON.stringify(parsed))
  return parsed
}
