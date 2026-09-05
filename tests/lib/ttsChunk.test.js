// 読み上げ用の Markdown 整形と分割。記号を読み上げないこと、文の途中で
// 切らないこと、長すぎる塊を作らないことを固定する
const {
  markdownToSpeechText,
  splitIntoChunks,
  buildSpeechChunks
} = require('browser/lib/ttsChunk')

describe('markdownToSpeechText', () => {
  it('見出し・強調・リンク・画像・箇条書きの記号を落として本文だけにする', () => {
    const md = [
      '# 会議メモ',
      '',
      '- **重要**な点は [資料](https://example.com) を見る',
      '- [x] 済み ![図](img.png)',
      '1. 手順その一',
      '> 引用です',
      '`code` も読む'
    ].join('\n')
    expect(markdownToSpeechText(md)).toBe(
      [
        '会議メモ',
        '',
        '重要な点は 資料 を見る',
        '済み 図',
        '手順その一',
        '引用です',
        'code も読む'
      ].join('\n')
    )
  })

  it('frontmatter とコードブロックと HTML タグは読まない', () => {
    const md =
      '---\ntitle: x\n---\n本文。\n\n```js\nconst a = 1\n```\n\n<div>中</div>\n'
    expect(markdownToSpeechText(md)).toBe('本文。\n\n中')
  })

  it('表は区切り行を落とし、セルを読点で繋ぐ', () => {
    const md = '| 名前 | 値 |\n|---|---|\n| A | 1 |'
    expect(markdownToSpeechText(md)).toBe('名前、値\nA、1')
  })
})

describe('splitIntoChunks', () => {
  it('文末で分け、上限までは同じ塊にまとめる', () => {
    const text = 'ひとつ。ふたつ！みっつ？\n\n次の段落。'
    expect(splitIntoChunks(text, 10)).toEqual([
      'ひとつ。ふたつ！',
      'みっつ？',
      '次の段落。'
    ])
  })

  it('段落は跨がない', () => {
    expect(splitIntoChunks('あ。\n\nい。', 100)).toEqual(['あ。', 'い。'])
  })

  it('1 文が上限を超えるときは読点で切り、それも無ければ長さで切る', () => {
    const long = 'これはとても長い文で、読点があるので、ここで切れるはずです。'
    const chunks = splitIntoChunks(long, 20)
    expect(chunks.every(c => c.length <= 20)).toBe(true)
    expect(chunks.join('')).toBe(long)
    const noComma = 'あ'.repeat(45)
    expect(splitIntoChunks(noComma, 20)).toEqual([
      'あ'.repeat(20),
      'あ'.repeat(20),
      'あ'.repeat(5)
    ])
  })

  it('空文字は空配列', () => {
    expect(splitIntoChunks('')).toEqual([])
    expect(buildSpeechChunks('```\nonly code\n```')).toEqual([])
  })
})

describe('行番号つきの分割', () => {
  const {
    markdownToSpeechLines,
    buildSpeechChunksWithLines
  } = require('browser/lib/ttsChunk')

  it('塊は元の行番号を持つ。ハイライトはこれを使う', () => {
    const md = [
      '# 見出し',
      '',
      '一行目です。',
      '二行目です。',
      '',
      '別の段落。'
    ].join('\n')
    expect(buildSpeechChunksWithLines(md)).toEqual([
      { text: '見出し', startLine: 0, endLine: 0, paragraph: 0, section: 1 },
      {
        text: '一行目です。二行目です。',
        startLine: 2,
        endLine: 3,
        paragraph: 1,
        section: 1
      },
      { text: '別の段落。', startLine: 5, endLine: 5, paragraph: 2, section: 1 }
    ])
  })

  it('落とした行のぶんも行番号がずれない', () => {
    const md = [
      '---',
      'title: x',
      '---',
      '本文。',
      '',
      '```js',
      'const a = 1',
      '```',
      '',
      '最後。'
    ].join('\n')
    expect(buildSpeechChunksWithLines(md)).toEqual([
      { text: '本文。', startLine: 3, endLine: 3, paragraph: 0, section: 0 },
      { text: '最後。', startLine: 9, endLine: 9, paragraph: 1, section: 0 }
    ])
  })

  it('空行は段落の区切りとして残り、落とした行は残らない', () => {
    const lines = markdownToSpeechLines('あ\n\n```\nx\n```\nい')
    expect(lines).toEqual([
      { text: 'あ', line: 0, heading: false },
      { text: '', line: 1, heading: false },
      { text: 'い', line: 5, heading: false }
    ])
  })
})

describe('段落と節の番号', () => {
  const { buildSpeechChunksWithLines } = require('browser/lib/ttsChunk')

  it('見出しごとに section が進み、空行ごとに paragraph が進む。見出し前は section 0', () => {
    const md = [
      '前書き。',
      '',
      '# 一章',
      '本文 A。',
      '本文 B。',
      '',
      '本文 C。',
      '## 一章の二',
      '本文 D。'
    ].join('\n')
    const c = buildSpeechChunksWithLines(md)
    expect(c.map(x => [x.text, x.paragraph, x.section])).toEqual([
      ['前書き。', 0, 0],
      ['一章', 1, 1],
      ['本文 A。本文 B。', 2, 1],
      ['本文 C。', 3, 1],
      ['一章の二', 4, 2],
      ['本文 D。', 5, 2]
    ])
  })
})
