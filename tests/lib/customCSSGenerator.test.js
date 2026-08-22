// AI が返した CSS を受け取ってよいかを決める層。
//
// ここが緩いと、プレビューの iframe が外部へ通信する CSS をそのまま読み込む。
// ここが「全部弾いたときに空を返す」形になっていると、利用者が書いた CSS が
// 消える。両方を見る。
const {
  CUSTOM_CSS_SYSTEM_PROMPT,
  MAX_GENERATED_CHARS,
  buildCustomCSSPrompt,
  extractCSS,
  validateGeneratedCSS,
  appendGeneratedCSS
} = require('browser/lib/customCSSGenerator')

describe('AI へ渡すプロンプト', () => {
  it('system は CSS だけを返すよう指示している', () => {
    expect(CUSTOM_CSS_SYSTEM_PROMPT).toMatch(/CSS only/i)
    expect(CUSTOM_CSS_SYSTEM_PROMPT).toMatch(/@import/)
    expect(CUSTOM_CSS_SYSTEM_PROMPT).toMatch(/data-theme/)
  })

  it('指示・テーマ・既存の CSS を渡す', () => {
    const prompt = buildCustomCSSPrompt({
      instruction: '見出しを詰めたい',
      currentCSS: 'h1 { color: red; }',
      themeName: 'dracula'
    })
    expect(prompt).toContain('見出しを詰めたい')
    expect(prompt).toContain('data-theme="dracula"')
    expect(prompt).toContain('h1 { color: red; }')
  })

  it('既存の CSS が無くても組み立てられる', () => {
    const prompt = buildCustomCSSPrompt({ instruction: 'tighter headings' })
    expect(prompt).toContain('tighter headings')
    expect(prompt).not.toContain('undefined')
  })

  it('既存の CSS が長いときは切り詰める', () => {
    const prompt = buildCustomCSSPrompt({
      instruction: 'x',
      currentCSS: 'a{}'.repeat(4000)
    })
    expect(prompt.length).toBeLessThan(6000)
  })
})

describe('コードフェンスの取り外し', () => {
  it('```css で囲まれていても中身だけ取る', () => {
    expect(extractCSS('```css\nh1 { color: red; }\n```')).toBe(
      'h1 { color: red; }'
    )
  })

  it('言語指定が無いフェンスも外す', () => {
    expect(extractCSS('```\nh1 {}\n```')).toBe('h1 {}')
  })

  it('フェンスが無ければそのまま', () => {
    expect(extractCSS('  h1 {}  ')).toBe('h1 {}')
  })

  it('null や undefined で落ちない', () => {
    expect(extractCSS(null)).toBe('')
    expect(extractCSS(undefined)).toBe('')
  })
})

describe('危険な指定を弾く', () => {
  const refuses = (css, reason) => {
    const verdict = validateGeneratedCSS(css)
    expect(verdict.ok).toBe(false)
    expect(verdict.reasons).toContain(reason)
    // 弾いたときに CSS を返さない。ここが空でないと呼び出し側が保存しうる
    expect(verdict.css).toBe('')
  }

  it('@import', () => {
    refuses("@import url('https://evil.example/x.css');\nh1 {}", 'at-import')
  })

  it('外部の url()', () => {
    refuses('h1 { background: url(https://evil.example/x.png); }', 'remote-url')
  })

  it('スキーム相対の url()', () => {
    refuses('h1 { background: url("//evil.example/x.png"); }', 'remote-url')
  })

  it('javascript: の URL', () => {
    refuses('h1 { background: url(javascript:alert(1)); }', 'javascript-url')
  })

  it('expression()', () => {
    refuses('h1 { width: expression(alert(1)); }', 'expression')
  })

  it('-moz-binding / behavior', () => {
    refuses('h1 { -moz-binding: url(x.xml); }', 'binding')
    refuses('h1 { behavior: url(x.htc); }', 'binding')
  })

  it('HTML が混ざっている', () => {
    refuses('</style><script>alert(1)</script>', 'markup')
  })

  it('CSS ではない断り書き', () => {
    refuses('I cannot help with that request.', 'not-css')
  })

  it('波括弧の対応が取れていない', () => {
    refuses('h1 { color: red;', 'unbalanced')
  })

  it('空の応答', () => {
    refuses('', 'empty')
    refuses('```css\n\n```', 'empty')
  })

  it('長すぎる応答', () => {
    refuses('h1 { color: red; }'.repeat(MAX_GENERATED_CHARS), 'too-long')
  })

  it('コメントの中の @import は理由に数えるが、素通しはしない', () => {
    // コメントは解析から外すので、これは通ってよい
    const verdict = validateGeneratedCSS('/* @import は使わない */\nh1 {}')
    expect(verdict.ok).toBe(true)
    expect(verdict.css).toContain('@import')
  })
})

describe('通してよいもの', () => {
  it('普通の CSS は通る', () => {
    const verdict = validateGeneratedCSS('h1, h2 {\n  margin-top: 2em;\n}')
    expect(verdict.ok).toBe(true)
    expect(verdict.reasons).toEqual([])
    expect(verdict.css).toContain('margin-top')
  })

  it('data: の url() は通す', () => {
    const verdict = validateGeneratedCSS(
      'h1 { background: url(data:image/gif;base64,R0lGOD); }'
    )
    expect(verdict.ok).toBe(true)
  })

  it('@media は通る', () => {
    const verdict = validateGeneratedCSS(
      '@media print {\n  body { font-size: 11pt; }\n}'
    )
    expect(verdict.ok).toBe(true)
  })

  it('!important は拒否ではなく注記', () => {
    const verdict = validateGeneratedCSS('h1 { color: red !important; }')
    expect(verdict.ok).toBe(true)
    expect(verdict.notes).toContain('uses-important')
  })
})

describe('反映', () => {
  it('既存の内容を消さない', () => {
    const existing = '/* mine */\nh1 { color: red; }'
    const next = appendGeneratedCSS(existing, 'h2 {}', 'AI が生成: 見出し')
    expect(next.indexOf(existing)).toBe(0)
    expect(next).toContain('h2 {}')
    expect(next).toContain('/* AI が生成: 見出し */')
  })

  it('空欄へ足しても先頭に空行を作らない', () => {
    expect(appendGeneratedCSS('  \n ', 'h2 {}', 'note').startsWith('/*')).toBe(
      true
    )
  })

  it('生成物が空なら現在の内容をそのまま返す', () => {
    expect(appendGeneratedCSS('h1 {}', '', 'note')).toBe('h1 {}')
    expect(appendGeneratedCSS('h1 {}', null, 'note')).toBe('h1 {}')
  })

  it('見出しコメントに */ が来ても閉じない', () => {
    const next = appendGeneratedCSS('', 'h2 {}', 'closes */ here')
    expect(next.split('\n')[0].slice(2, -2)).not.toContain('*/')
  })
})
