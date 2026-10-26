// Windows標準の文字認識（Windows.Media.Ocr）で画像の文字を読む。端末の外に画像を出さない。
// macOSのvisionOcr.jsと同じ役割。WinRTはPowerShell（Windows PowerShell 5.1）から呼ぶ。
// コンパイル済みのバイナリを同梱せずに済む
const { execFile } = require('child_process')

// 画像のパスは環境変数で渡す。コマンド行に入れると、空白や記号・日本語を含むパスの
// クオートをPowerShell側の解釈とそろえる必要がある
const PATH_ENV = 'BOOSTRECORD_OCR_PATH'

// 行ごとに、単語をタブでつないで出す。日本語は1文字ずつ単語になり、OCRの Line.Text は
// 文字の間に空白を入れて返すので、つなぎ方はJS側（joinWords）で決める。
// 出力はUTF-8に固定する（既定のOEMコードページだと日本語が化ける）
const OCR_SCRIPT = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics, ContentType = WindowsRuntime]
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
  $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1'
})[0]
function Await($op, $type) {
  $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
  $null = $task.Wait(-1)
  $task.Result
}
$mode = $env:BOOSTRECORD_OCR_MODE
$langs = [Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages | ForEach-Object { $_.LanguageTag }
if ($mode -eq 'languages') { $langs -join "\`n"; exit 0 }
$ja = $langs | Where-Object { $_ -like 'ja*' } | Select-Object -First 1
if ($ja) {
  $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage((New-Object Windows.Globalization.Language $ja))
} else {
  $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
}
if ($null -eq $engine) { throw 'OCR_WINDOWS_NO_LANGUAGE' }
$file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($env:${PATH_ENV})) ([Windows.Storage.StorageFile])
$stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
try {
  $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $max = [Windows.Media.Ocr.OcrEngine]::MaxImageDimension
  if ($decoder.PixelWidth -gt $max -or $decoder.PixelHeight -gt $max) { throw 'OCR_WINDOWS_IMAGE_TOO_LARGE' }
  $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
  foreach ($line in $result.Lines) { ($line.Words | ForEach-Object { $_.Text }) -join "\`t" }
} finally {
  $stream.Dispose()
}
`

// 初回は認識エンジンの読み込みに時間がかかることがあるので、macOSと同じく余裕を取る
const TIMEOUT_MS = 90 * 1000

// Windows.Media.Ocr は Windows 10 以降。Electron 28 も Windows 10 以降でしか動かない
function isWindowsOcrPlatform(platform) {
  return (platform || process.platform) === 'win32'
}

// 単語の間に空白を入れない文字（かな・漢字・全角の記号と英数字）
const CJK = /[\u3000-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/

/**
 * 1行ぶんの単語をつなぐ。日本語どうしは詰め、英数字どうしは空白を挟む
 * @param {string[]} words
 * @returns {string}
 */
function joinWords(words) {
  let out = ''
  words.forEach(word => {
    if (!word) return
    if (out && !CJK.test(out[out.length - 1]) && !CJK.test(word[0])) {
      out += ' '
    }
    out += word
  })
  return out
}

/**
 * PowerShellの出力（行ごとにタブ区切りの単語）を文章に戻す
 * @param {string} stdout
 * @returns {string}
 */
function parseOcrOutput(stdout) {
  return stdout
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map(line => joinWords(line.split('\t')))
    .join('\n')
    .replace(/\n+$/, '')
}

function runScript(env) {
  return new Promise((resolve, reject) => {
    // -EncodedCommand はUTF-16LEのbase64。スクリプトの引用符や改行をコマンド行で崩さない
    const encoded = Buffer.from(OCR_SCRIPT, 'utf16le').toString('base64')
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-EncodedCommand',
        encoded
      ],
      {
        timeout: TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024,
        windowsHide: true,
        env: Object.assign({}, process.env, env)
      },
      (err, stdout, stderr) => {
        if (err) {
          const message = (stderr || err.message).trim()
          // 決めたコードはそのまま返し、画面側で案内文に置き換える
          const code = /OCR_WINDOWS_[A-Z_]+/.exec(message)
          reject(new Error(code ? code[0] : message))
          return
        }
        resolve(stdout)
      }
    )
  })
}

let languagesPromise = null

/**
 * この端末で使える認識言語（例: ['en-US', 'ja']）。結果は覚えておく
 * @returns {Promise<string[]>} Windows以外や取得に失敗したときは空
 */
function getWindowsOcrLanguages() {
  if (!isWindowsOcrPlatform()) return Promise.resolve([])
  if (!languagesPromise) {
    languagesPromise = runScript({ BOOSTRECORD_OCR_MODE: 'languages' })
      .then(out =>
        out
          .replace(/^\uFEFF/, '')
          .split(/\r?\n/)
          .map(s => s.trim())
          .filter(Boolean)
      )
      .catch(() => [])
  }
  return languagesPromise
}

/**
 * @param {string} filePath 画像ファイルの絶対パス
 * @returns {Promise<string>} 認識した文字列（行ごとに改行）
 */
function runWindowsOcr(filePath) {
  return runScript({ [PATH_ENV]: filePath }).then(parseOcrOutput)
}

module.exports = {
  runWindowsOcr,
  getWindowsOcrLanguages,
  isWindowsOcrPlatform,
  joinWords,
  parseOcrOutput,
  OCR_SCRIPT
}
