// Renderer-side wrapper for VOICEVOX text-to-speech.
//
// speakText(text, speakerId?)  – plays the text via VOICEVOX (localhost:50021).
// stopSpeech()                 – stops any currently playing audio.
//
// Requires the VOICEVOX engine to be running locally.
const { ipcRenderer } = require('electron')

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

export async function speakText(text, speakerId = 1) {
  stopSpeech()

  const result = await ipcRenderer.invoke('tts:speak', { text, speakerId })
  if (!result.ok) {
    const isOffline = /ECONNREFUSED|ECONNRESET/.test(result.reason || '')
    throw new Error(
      isOffline
        ? 'VOICEVOX エンジンが起動していません。\nhttp://localhost:50021 で起動してください。'
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
