// Renderer-side wrapper for VOICEVOX text-to-speech.
//
// speakText(text)  – plays the text via VOICEVOX; reads port/speakerId from config.
// stopSpeech()     – stops any currently playing audio.
//
// Requires the VOICEVOX engine to be running locally.
const { ipcRenderer } = require('electron')
import ConfigManager from 'browser/main/lib/ConfigManager'

let currentAudio = null
let currentObjectUrl = null

export function stopSpeech() {
  if (currentAudio) {
    currentAudio.pause()
    currentAudio = null
  }
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl)
    currentObjectUrl = null
  }
}

export async function speakText(text) {
  stopSpeech()

  const ttsCfg =
    (ConfigManager.getConfig() && ConfigManager.getConfig().tts) || {}
  const speakerId = ttsCfg.speakerId != null ? ttsCfg.speakerId : 1
  const port = ttsCfg.port || 50021

  const result = await ipcRenderer.invoke('tts:speak', {
    text,
    speakerId,
    port
  })
  if (!result.ok) {
    const isOffline = /ECONNREFUSED|ECONNRESET/.test(result.reason || '')
    throw new Error(
      isOffline
        ? `VOICEVOX エンジンが起動していません。\nhttp://localhost:${port} で起動してください。`
        : result.reason || 'TTS failed'
    )
  }

  const blob = new Blob([result.wav], { type: 'audio/wav' })
  const url = URL.createObjectURL(blob)
  currentObjectUrl = url

  const audio = new Audio(url)
  currentAudio = audio
  audio.onended = () => {
    stopSpeech()
  }
  await audio.play()
}
