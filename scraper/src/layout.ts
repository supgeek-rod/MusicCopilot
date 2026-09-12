import { basename, dirname, extname, join, resolve, sep } from 'node:path'
import type { Env } from './env.js'

/**
 * 下载文件目录布局：写完标签后按模板移动到「歌手/专辑/文件」两级目录（Navidrome 友好）。
 * 变量：{albumArtist} {album} {artist} {title} {year} {trackNo}；{ext} 自动取实际扩展名不参与模板。
 * 空值变量渲染为空串，最终按段清理非法字符；段为空的模板段（如无专辑时的 {album}/）整体丢弃。
 */
export const DEFAULT_DIR_TEMPLATE = '{albumArtist}/{album}/{title} - {albumArtist}.{ext}'

const ILLEGAL = /[\\/:*?"<>|]/g

export interface LayoutValues {
  albumArtist: string
  album: string
  artist: string
  title: string
  year: string
  trackNo: string
  ext: string
}

/** 模板变量替换 + 逐段清理：返回相对音乐目录的路径（含文件名）；无法得出有效路径时返回 null */
export function renderLayout(
  template: string,
  values: LayoutValues,
): string | null {
  const ext = values.ext.replace(/^\./, '').trim()
  if (ext === '') return null

  const segs = template
    .split('/')
    .map((seg) => {
      let s = seg.replaceAll('{ext}', ext)
      for (const [k, v] of Object.entries(values)) {
        if (k === 'ext') continue
        s = s.replaceAll(`{${k}}`, v)
      }
      // 非法字符→下划线，去首尾空白与结尾点（Windows 目录名限制）
      return s.replace(ILLEGAL, '_').replace(/[.\s]+$/g, '').trim()
    })
    .filter((seg, i, arr) => (i < arr.length - 1 ? seg !== '' : true))

  // 文件名段（最后一段）：扩展名前的空白折叠掉（`Who_ .mp3` → `Who_.mp3`）；
  // 词干只剩分隔符残渣（- _ 空格 点）视为无有效文件名 → null（调用方保持文件原位）
  const file = (segs[segs.length - 1] ?? '').replace(/\s+\./g, '.')
  const stem = file.replace(/\.[^.]+$/, '')
  if (stem.replace(/[-_.\s]/g, '') === '') return null
  segs[segs.length - 1] = file

  return segs.join('/')
}

/** 校验目标路径安全落在音乐目录内且不与源相同；返回绝对路径 */
export function resolveRelocateTarget(
  env: Env,
  sourceAbs: string,
  relTarget: string,
): string {
  const musicRoot = resolve(env.musicDir)
  const target = resolve(join(musicRoot, relTarget))
  if (!target.startsWith(musicRoot + sep)) {
    throw new Error('目标路径越出音乐目录')
  }
  if (resolve(sourceAbs) === target) {
    throw new Error('目标与源相同')
  }
  return target
}

/** 目录名/文件名清理（供调用方做冲突检查等） */
export function sanitizeSeg(seg: string): string {
  return seg.replace(ILLEGAL, '_').replace(/[.\s]+$/g, '').trim()
}

export function parentDirOf(relPath: string): string {
  return dirname(relPath)
}

export function fileNameOf(relPath: string): string {
  return basename(relPath)
}

export function extOf(name: string): string {
  return extname(name)
}
