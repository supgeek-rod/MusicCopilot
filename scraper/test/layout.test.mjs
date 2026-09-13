import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderLayout } from '../dist/layout.js'

test('默认模板：完整上下文', () => {
  const p = renderLayout('{albumArtist}/{album}/{title} - {albumArtist}.{ext}', {
    albumArtist: '周杰伦',
    album: '叶惠美',
    artist: '周杰伦',
    title: '晴天',
    year: '2003',
    trackNo: '3',
    ext: '.flac',
  })
  assert.equal(p, '周杰伦/叶惠美/晴天 - 周杰伦.flac')
})

test('空专辑段：中间段整体丢弃，不留空目录', () => {
  const p = renderLayout('{albumArtist}/{album}/{title} - {albumArtist}.{ext}', {
    albumArtist: '周杰伦',
    album: '',
    artist: '周杰伦',
    title: '晴天',
    year: '',
    trackNo: '',
    ext: '.mp3',
  })
  assert.equal(p, '周杰伦/晴天 - 周杰伦.mp3')
})

test('非法字符清理与结尾点清理', () => {
  const p = renderLayout('{albumArtist}/{album}/{title}.{ext}', {
    albumArtist: 'AC/DC',
    album: 'Best: Vol.1',
    artist: 'AC/DC',
    title: 'Who? ',
    year: '',
    trackNo: '',
    ext: 'mp3',
  })
  assert.equal(p, 'AC_DC/Best_ Vol.1/Who_.mp3')
})

test('全空 artist+title：文件名段为空 → null（调用方保持原位）', () => {
  const p = renderLayout('{albumArtist}/{album}/{title} - {albumArtist}.{ext}', {
    albumArtist: '',
    album: 'A',
    artist: '',
    title: '',
    year: '',
    trackNo: '',
    ext: '.mp3',
  })
  assert.equal(p, null)
})

test('trackNo 参与模板（用户自定义场景）', () => {
  const p = renderLayout('{albumArtist}/{year} - {album}/{trackNo}. {title}.{ext}', {
    albumArtist: '周杰伦',
    album: '叶惠美',
    artist: '周杰伦',
    title: '晴天',
    year: '2003',
    trackNo: '3',
    ext: '.flac',
  })
  assert.equal(p, '周杰伦/2003 - 叶惠美/3. 晴天.flac')
})
