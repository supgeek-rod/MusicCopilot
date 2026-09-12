import assert from 'node:assert/strict'
import { test } from 'node:test'
import { looseMatch, normalizeForMatch } from '../dist/genres.js'

test('归一化：大小写/空格/标点全折叠', () => {
  assert.equal(normalizeForMatch("November's Chopin"), 'novemberschopin')
  assert.equal(normalizeForMatch('  Abbey Road (Remastered) '), 'abbeyroadremastered')
  assert.equal(normalizeForMatch('周杰伦 Jay Chou'), '周杰伦jaychou')
})

test('匹配：相等', () => {
  assert.equal(looseMatch('叶惠美', '叶惠美'), true)
  assert.equal(looseMatch('Abbey Road', 'abbey road'), true)
})

test('匹配：双向包含', () => {
  // Deezer 常见：标题带后缀
  assert.equal(looseMatch('Abbey Road (Remastered 2009)', 'Abbey Road'), true)
  assert.equal(looseMatch('East of Eden', 'East of Eden (Deluxe Edition)'), true)
})

test('不匹配：不同专辑', () => {
  assert.equal(looseMatch('叶惠美', '八度空间'), false)
  // 翻唱者专辑名相同但歌手不同 → 歌手比对拦截
  assert.equal(looseMatch('叶惠美', '叶惠美'), true) // 专辑名相同时本函数只比一个维度
})

test('空串：不匹配（防御）', () => {
  assert.equal(looseMatch('', 'anything'), false)
  assert.equal(looseMatch('anything', ''), false)
})
