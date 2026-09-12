import assert from 'node:assert/strict'
import { test } from 'node:test'
import { looseMatch, normalizeForMatch, ChainGenreProvider, LastFmGenreProvider } from '../dist/genres.js'

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

function withFetch(mock) {
  const real = globalThis.fetch
  globalThis.fetch = mock
  return () => { globalThis.fetch = real }
}

test('Last.fm：解析 tags + 黑名单过滤 + 单元素对象陷阱', async () => {
  const provider = new LastFmGenreProvider('test-key')
  let requested = ''
  const restore = withFetch(async (input) => {
    requested = String(input)
    return new Response(JSON.stringify({
      album: { name: '叶惠美', artist: '周杰伦', tags: { tag: [
        { name: 'seen live' },
        { name: 'favourites' },
        { name: 'mandopop' },
        { name: 'C-Pop' },
      ] } },
    }), { headers: { 'content-type': 'application/json' } })
  })
  try {
    const g = await provider.fetchGenre('叶惠美', '周杰伦')
    assert.equal(g, 'mandopop')
    assert.ok(requested.includes('autocorrect=1'))
    assert.ok(requested.includes('api_key=test-key'))
  } finally { restore() }
})

test('Last.fm：单元素 tag 是对象不是数组', async () => {
  const provider = new LastFmGenreProvider('k')
  const restore = withFetch(async () => new Response(JSON.stringify({
    album: { tags: { tag: { name: 'rock' } } },
  }), { headers: { 'content-type': 'application/json' } }))
  try {
    assert.equal(await provider.fetchGenre('X', 'Y'), 'rock')
  } finally { restore() }
})

test('Last.fm：错误体（无效 key/未知专辑）→ 空串', async () => {
  const provider = new LastFmGenreProvider('k')
  const restore = withFetch(async () => new Response(JSON.stringify({ error: 10, message: 'Invalid API key' }), { headers: { 'content-type': 'application/json' } }))
  try {
    assert.equal(await provider.fetchGenre('X', 'Y'), '')
  } finally { restore() }
})

test('Last.fm：空 key 直接跳过（不发请求）', async () => {
  const provider = new LastFmGenreProvider('')
  let called = false
  const restore = withFetch(async () => { called = true; return new Response('{}') })
  try {
    assert.equal(await provider.fetchGenre('X', 'Y'), '')
    assert.equal(called, false)
  } finally { restore() }
})

test('链式：Last.fm 未命中 → 退 Deezer', async () => {
  const restore = withFetch(async (input) => {
    const url = String(input instanceof URL ? input : input?.url ?? input)
    if (url.includes('audioscrobbler.com')) {
      return new Response(JSON.stringify({ album: { tags: { tag: [] } } }), { headers: { 'content-type': 'application/json' } })
    }
    if (url.includes('api.deezer.com/search/album')) {
      return new Response(JSON.stringify({ data: [{ id: 7, title: '叶惠美', artist: { name: '周杰伦' } }] }), { headers: { 'content-type': 'application/json' } })
    }
    if (url.includes('api.deezer.com/album/')) {
      return new Response(JSON.stringify({ genres: { data: [{ name: 'Mandopop' }] } }), { headers: { 'content-type': 'application/json' } })
    }
    return new Response('{}')
  })
  try {
    const chain = new ChainGenreProvider([new LastFmGenreProvider('k'), { name: 'deezer', fetchGenre: async () => 'Mandopop' }])
    assert.equal(await chain.fetchGenre('叶惠美', '周杰伦'), 'Mandopop')
  } finally { restore() }
})

test('链式：全部落空 → 空串', async () => {
  const chain = new ChainGenreProvider([
    { name: 'a', fetchGenre: async () => '' },
    { name: 'b', fetchGenre: async () => '' },
  ])
  assert.equal(await chain.fetchGenre('X', 'Y'), '')
})

test('链式：provider 抛错不中断链', async () => {
  const chain = new ChainGenreProvider([
    { name: 'boom', fetchGenre: async () => { throw new Error('boom') } },
    { name: 'ok', fetchGenre: async () => 'Jazz' },
  ])
  assert.equal(await chain.fetchGenre('X', 'Y'), 'Jazz')
})
