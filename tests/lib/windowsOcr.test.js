/**
 * @fileoverview lib/ocr/windowsOcr（Windows標準の文字認識）のテスト。
 * PowerShellを呼ぶ部分はWindowsでしか動かないので、CIのwindows-ocrジョブで確かめる
 */
const {
  joinWords,
  parseOcrOutput,
  isWindowsOcrPlatform,
  OCR_SCRIPT
} = require('../../lib/ocr/windowsOcr')

test('日本語の単語どうしは空白を入れずにつなぐ', () => {
  expect(joinWords(['今', '日', 'は', '晴', 'れ'])).toBe('今日は晴れ')
})

test('英数字どうしは空白を挟み、日本語との境目には入れない', () => {
  expect(joinWords(['Hello', 'World'])).toBe('Hello World')
  expect(joinWords(['BoostRecord', 'の', '設', '定'])).toBe('BoostRecordの設定')
  expect(joinWords(['価', '格', '100', '円'])).toBe('価格100円')
  expect(joinWords(['全', '角', 'ＡＢＣ'])).toBe('全角ＡＢＣ')
})

test('空の単語は飛ばす', () => {
  expect(joinWords(['', 'a', '', 'b'])).toBe('a b')
})

test('PowerShellの出力（行ごとにタブ区切り）を文章に戻す', () => {
  const out = '\uFEFF見\t出\tし\r\nSee\tthe\tdocs\r\n\r\n'
  expect(parseOcrOutput(out)).toBe('見出し\nSee the docs')
})

test('Windowsのときだけ使える', () => {
  expect(isWindowsOcrPlatform('win32')).toBe(true)
  expect(isWindowsOcrPlatform('darwin')).toBe(false)
  expect(isWindowsOcrPlatform('linux')).toBe(false)
})

test('スクリプトは画像のパスを環境変数で受け、UTF-8で出す', () => {
  // パスをコマンド行に入れていないこと（空白や記号を含むパスで崩れないため）
  expect(OCR_SCRIPT).toContain('$env:BOOSTRECORD_OCR_PATH')
  expect(OCR_SCRIPT).toContain('[System.Text.Encoding]::UTF8')
  // PowerShellのバッククォート（エスケープ文字）がJSの文字列で消えていないこと
  expect(OCR_SCRIPT).toContain("'IAsyncOperation`1'")
  expect(OCR_SCRIPT).toContain('-join "`t"')
})
