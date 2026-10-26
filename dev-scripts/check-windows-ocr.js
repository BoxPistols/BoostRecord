// Windows標準の文字認識（lib/ocr/windowsOcr.js）が実機で読めるかを確かめる。
// CIのwindows-ocrジョブで回す。依存を入れずに node だけで動く。
//
// 1. PowerShell（System.Drawing）で英語の文字を描いたPNGを作る
// 2. 空白と日本語を含むフォルダに置く（パスを環境変数で渡している作りの確認）
// 3. 使える認識言語と、読み取った文字列を確かめる
//
// GitHubのWindowsランナーは英語だけなので、日本語の認識はここでは見ない
// （単語のつなぎ方は tests/lib/windowsOcr.test.js で見ている）
const { execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const {
  runWindowsOcr,
  getWindowsOcrLanguages
} = require('../lib/ocr/windowsOcr')

const TEXT = 'BoostRecord OCR 12345'

function makeImage(file) {
  const script = `
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 900, 200
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::White)
$font = New-Object System.Drawing.Font 'Arial', 40
$g.DrawString($env:OCR_TEXT, $font, [System.Drawing.Brushes]::Black, 20, 60)
$bmp.Save($env:OCR_OUT, [System.Drawing.Imaging.ImageFormat]::Png)
`
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-EncodedCommand',
      Buffer.from(script, 'utf16le').toString('base64')
    ],
    { env: Object.assign({}, process.env, { OCR_OUT: file, OCR_TEXT: TEXT }) }
  )
}

async function main() {
  if (process.platform !== 'win32') {
    console.log('skip: Windows only')
    return
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ocr テスト '))
  const file = path.join(dir, "画像 (1) & 'x'.png")
  makeImage(file)

  const languages = await getWindowsOcrLanguages()
  console.log('languages:', JSON.stringify(languages))
  if (languages.length === 0) throw new Error('no recognizer language')

  const started = Date.now()
  const text = await runWindowsOcr(file)
  console.log(`read in ${Date.now() - started} ms: ${JSON.stringify(text)}`)
  // 認識の揺れ（O と 0 など）で落ちないよう、語ごとに見る
  const normalized = text.replace(/\s+/g, ' ').toLowerCase()
  const missing = ['boostrecord', '12345'].filter(w => !normalized.includes(w))
  if (missing.length) throw new Error('not recognized: ' + missing.join(', '))
  console.log('OK')
}

main().catch(err => {
  console.error('FAIL:', err && err.message)
  process.exit(1)
})
