// macOS標準の文字認識（Vision）で画像の文字を読む。端末の外に画像を出さない。
// スクリプトは標準入力で渡す。配布版ではファイルがasarの中にありosascriptから読めないため
const { execFile } = require('child_process')

// AppleScriptObjCからVisionを呼ぶ。コンパイル済みのバイナリを同梱せずに済む。
// 日本語の認識はmacOS 13以降
const VISION_SCRIPT = `
use AppleScript version "2.7"
use framework "Foundation"
use framework "Vision"
use scripting additions
on run argv
  set imgURL to current application's NSURL's fileURLWithPath:(item 1 of argv)
  set reqHandler to current application's VNImageRequestHandler's alloc()'s initWithURL:imgURL options:(current application's NSDictionary's dictionary())
  set req to current application's VNRecognizeTextRequest's alloc()'s init()
  req's setRecognitionLevel:(current application's VNRequestTextRecognitionLevelAccurate)
  req's setRecognitionLanguages:{"ja-JP", "en-US"}
  req's setUsesLanguageCorrection:true
  set {ok, err} to reqHandler's performRequests:{req} |error|:(reference)
  if ok is false then error (err's localizedDescription() as text)
  set out to {}
  repeat with obs in (req's results())
    set end of out to ((obs's topCandidates:1)'s firstObject()'s |string|()) as text
  end repeat
  set AppleScript's text item delimiters to linefeed
  return out as text
end run
`

// 初回は認識モデルの読み込みで30秒ほどかかった（2回目以降は1秒未満）ので余裕を取る
const TIMEOUT_MS = 90 * 1000

function isVisionAvailable(platform) {
  return (platform || process.platform) === 'darwin'
}

/**
 * @param {string} filePath 画像ファイルの絶対パス
 * @returns {Promise<string>} 認識した文字列（行ごとに改行）
 */
function runVisionOcr(filePath) {
  return new Promise((resolve, reject) => {
    // パスは引数として渡す。シェルを通さないので空白や記号を含んでも崩れない
    const child = execFile(
      'osascript',
      ['-', filePath],
      { timeout: TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error((stderr || err.message).trim()))
          return
        }
        resolve(stdout.replace(/\n$/, ''))
      }
    )
    child.stdin.end(VISION_SCRIPT)
  })
}

module.exports = { runVisionOcr, isVisionAvailable, VISION_SCRIPT }
