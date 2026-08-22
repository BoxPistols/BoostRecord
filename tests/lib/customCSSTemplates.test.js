// カスタム CSS のテンプレート。挿入で既存の内容を失わないことと、
// テンプレート自体が「どのテーマでも壊れない書き方」を守っていることを見る。
const {
  CUSTOM_CSS_TEMPLATES,
  findCustomCSSTemplate,
  buildCustomCSSSnippet,
  appendCustomCSSTemplate
} = require('browser/lib/customCSSTemplates')

const identity = key => key

describe('カスタム CSS のテンプレート', () => {
  it('走査自体が空回りしていない', () => {
    expect(CUSTOM_CSS_TEMPLATES.length).toBeGreaterThanOrEqual(5)
  })

  it('id が一意', () => {
    const ids = CUSTOM_CSS_TEMPLATES.map(t => t.id)
    expect(ids.length).toBe(new Set(ids).size)
  })

  it('表示文字列は英語で持つ（訳はロケール側）', () => {
    const nonAscii = CUSTOM_CSS_TEMPLATES.filter(t =>
      // eslint-disable-next-line no-control-regex
      /[^\x00-\x7F]/.test([t.labelKey].concat(t.noteKeys).join(' '))
    ).map(t => t.id)
    expect(nonAscii).toEqual([])
  })

  it('!important を使わない', () => {
    // カスタム CSS は生成 CSS の最後に置かれるので、同じ詳細度なら既に勝つ。
    // ここで !important を使うと、利用者が次に書く規則が負けるだけになる
    const offenders = CUSTOM_CSS_TEMPLATES.filter(t =>
      /!\s*important/i.test(t.css)
    ).map(t => t.id)
    expect(offenders).toEqual([])
  })

  it('外部リソースを読み込まない', () => {
    // @import / url(http...) を雛形に入れると、そのまま真似されて
    // プレビューが外部へ通信する
    const offenders = CUSTOM_CSS_TEMPLATES.filter(
      t => /@import/i.test(t.css) || /url\(\s*['"]?(https?:)?\/\//i.test(t.css)
    ).map(t => t.id)
    expect(offenders).toEqual([])
  })

  it('波括弧の対応が取れている', () => {
    const offenders = CUSTOM_CSS_TEMPLATES.filter(t => {
      const open = (t.css.match(/\{/g) || []).length
      const close = (t.css.match(/\}/g) || []).length
      return open === 0 || open !== close
    }).map(t => t.id)
    expect(offenders).toEqual([])
  })

  it('findCustomCSSTemplate は未知の id で null を返す', () => {
    expect(findCustomCSSTemplate('no-such-template')).toBeNull()
    expect(findCustomCSSTemplate(CUSTOM_CSS_TEMPLATES[0].id)).toBe(
      CUSTOM_CSS_TEMPLATES[0]
    )
  })

  it('見出しと注記をコメントとして先頭に置く', () => {
    const template = CUSTOM_CSS_TEMPLATES[0]
    const snippet = buildCustomCSSSnippet(template, identity)
    expect(snippet.startsWith(`/* ${template.labelKey} */`)).toBe(true)
    template.noteKeys.forEach(noteKey => {
      expect(snippet).toContain(`/* ${noteKey} */`)
    })
    expect(snippet).toContain(template.css)
  })

  it('訳に */ が入ってもコメントが途中で閉じない', () => {
    const snippet = buildCustomCSSSnippet(
      CUSTOM_CSS_TEMPLATES[0],
      () => 'closes */ here'
    )
    const commentLines = snippet
      .split('\n')
      .filter(line => line.startsWith('/*'))
    expect(commentLines.length).toBeGreaterThan(0)
    commentLines.forEach(line => {
      expect(line.slice(2, -2)).not.toContain('*/')
    })
  })

  it('既に書いてある内容を消さない', () => {
    const existing = '/* mine */\nh1 { color: red; }'
    const next = appendCustomCSSTemplate(
      existing,
      CUSTOM_CSS_TEMPLATES[0],
      identity
    )
    expect(next.startsWith(existing)).toBe(true)
    expect(next).toContain(CUSTOM_CSS_TEMPLATES[0].css)
  })

  it('空欄への挿入で先頭に空行を作らない', () => {
    const next = appendCustomCSSTemplate(
      '   \n\n ',
      CUSTOM_CSS_TEMPLATES[1],
      identity
    )
    expect(next.startsWith('/*')).toBe(true)
  })

  it('続けて挿入すると両方が残る', () => {
    const once = appendCustomCSSTemplate('', CUSTOM_CSS_TEMPLATES[0], identity)
    const twice = appendCustomCSSTemplate(
      once,
      CUSTOM_CSS_TEMPLATES[1],
      identity
    )
    expect(twice).toContain(CUSTOM_CSS_TEMPLATES[0].css)
    expect(twice).toContain(CUSTOM_CSS_TEMPLATES[1].css)
  })

  it('template が無い場合は現在の内容をそのまま返す', () => {
    expect(appendCustomCSSTemplate('h1 {}', null, identity)).toBe('h1 {}')
  })
})
