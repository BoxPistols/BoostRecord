// ノート全体の読み上げプレーヤー。
//
// Markdown を塊に分け、1 塊ずつ合成して順に再生する。再生中に次の塊を
// 先読みして、塊の境目で黙る時間を短くする。UI（ReadAloudPlayer）と
// コンテキストメニューが同じインスタンスを共有する。
import { buildSpeechChunksWithLines } from 'browser/lib/ttsChunk'
import {
  preparePlayable,
  registerStopHook,
  getTtsConfig
} from 'browser/main/lib/ttsAssist'

// プレーヤーの話速は **絶対値**（VOICEVOX の speedScale そのもの）。
// 設定の話速に掛ける方式だと、設定が既に速い時に上限で頭打ちになり
// 「変えても変わらない」になる（実機で報告あり）
export const SPEED_OPTIONS = [0.5, 0.75, 1, 1.2, 1.5, 1.75, 2]
// キー操作 1 回ぶんの刻み
export const VOLUME_STEP = 0.1
// 前へ / 次へ / シークバーの移動単位
export const SKIP_UNITS = ['chunk', 'paragraph', 'section']

export function createPlayer(deps) {
  const prepare = (deps && deps.prepare) || preparePlayable
  const listeners = []
  const state = {
    status: 'idle', // 'idle' | 'loading' | 'playing' | 'paused'
    index: 0,
    total: 0,
    volume: 1,
    // null = まだ設定を読んでいない。load() で設定の話速から始める
    speed: null,
    label: '',
    error: null,
    // いま読んでいる塊の元の行範囲（0 始まり）。ハイライトに使う
    startLine: null,
    endLine: null,
    // 移動単位。null = 設定を読む前
    skipUnit: null,
    // 移動単位で数えた位置と総数（シークバーの目盛り）
    unitIndex: 0,
    unitTotal: 0
  }
  let chunks = []
  let current = null // 再生中の playable
  // 先読み: index -> Promise<playable>。speed/volume を変えたら捨てる
  let prefetched = {}
  // 「止めた後に届いた合成結果」を再生しないための世代番号
  let generation = 0

  function emit() {
    const snapshot = Object.assign({}, state)
    listeners.slice().forEach(fn => fn(snapshot))
  }

  function set(patch) {
    Object.assign(state, patch)
    emit()
  }

  function readConfig() {
    try {
      return (deps && deps.getConfig ? deps.getConfig : getTtsConfig)()
    } catch (e) {
      return { params: { speed: 1.2 }, rate: 1 }
    }
  }

  function ensureSpeed() {
    if (state.speed == null) {
      const cfg = readConfig()
      state.speed = (cfg.params && cfg.params.speed) || cfg.rate || 1
    }
  }

  // VOICEVOX は params.speed、OS 内蔵は rate に同じ値を渡す
  function overrides() {
    ensureSpeed()
    const cfg = readConfig()
    return {
      volume: state.volume,
      params: Object.assign({}, cfg.params, { speed: state.speed }),
      rate: state.speed
    }
  }

  // 合成を頼む時の話速を playable に持たせる。後で話速を変えた時、
  // 「合成時の話速との比」を playbackRate に掛ければ作り直さずに追従できる
  function getPlayable(i) {
    if (!prefetched[i]) {
      const synthSpeed = state.speed
      prefetched[i] = prepare(chunks[i].text, overrides()).then(pl => {
        pl.synthSpeed = synthSpeed
        return pl
      })
    }
    return prefetched[i]
  }

  // 先読みの深さ。話速を変えた直後などは次の 1 つが間に合わないことがある
  const PREFETCH_DEPTH = 2
  function prefetchAhead(i) {
    for (let k = 1; k <= PREFETCH_DEPTH; k++) {
      if (i + k >= chunks.length) break
      getPlayable(i + k).catch(() => {
        delete prefetched[i + k]
      })
    }
  }

  function applyRate(pl) {
    if (!pl || !pl.setRate) return
    const base = pl.synthSpeed || state.speed || 1
    pl.setRate(state.speed / base)
  }

  // 使わないと決めた playable は必ず捨てる（Blob URL を残さない）
  function discard(playable) {
    try {
      playable.stop()
    } catch (e) {
      /* まだ再生していない playable は止める物が無い */
    }
  }

  function unitKey(c) {
    ensureUnit()
    if (state.skipUnit === 'section') return c.section
    if (state.skipUnit === 'paragraph') return c.paragraph
    return null // chunk 単位: 塊そのもの
  }

  // 単位ごとの先頭塊の index の並び（chunk 単位なら全塊）
  function unitStarts() {
    if (!chunks.length) return []
    ensureUnit()
    if (state.skipUnit === 'chunk') return chunks.map((c, i) => i)
    const starts = []
    let prev = null
    chunks.forEach((c, i) => {
      const k = unitKey(c)
      if (k !== prev) starts.push(i)
      prev = k
    })
    return starts
  }

  function unitPosition(i) {
    const starts = unitStarts()
    let at = 0
    for (let k = 0; k < starts.length; k++) if (starts[k] <= i) at = k
    return { unitIndex: at, unitTotal: starts.length }
  }

  function ensureUnit() {
    if (state.skipUnit == null) {
      const cfg = readConfig()
      state.skipUnit =
        SKIP_UNITS.indexOf(cfg.skipUnit) !== -1 ? cfg.skipUnit : 'paragraph'
    }
  }

  function lineOf(i) {
    const c = chunks[i]
    const pos = unitPosition(i)
    return c
      ? Object.assign({ startLine: c.startLine, endLine: c.endLine }, pos)
      : Object.assign({ startLine: null, endLine: null }, pos)
  }

  function dropPrefetch() {
    prefetched = {}
  }

  function stopCurrent() {
    if (current) {
      try {
        current.stop()
      } catch (e) {
        /* 二重停止は無視 */
      }
      current = null
    }
  }

  async function playFrom(i) {
    if (i < 0 || i >= chunks.length) {
      stopCurrent()
      set(Object.assign({ status: 'idle', index: 0, error: null }, lineOf(0)))
      return
    }
    const gen = ++generation
    stopCurrent()
    set(Object.assign({ status: 'loading', index: i, error: null }, lineOf(i)))
    let playable
    try {
      playable = await getPlayable(i)
    } catch (e) {
      if (gen !== generation) return
      delete prefetched[i]
      set({ status: 'idle', error: e.message || String(e) })
      return
    }
    if (gen !== generation) {
      // 待っている間に止められた / 別の塊へ移った。これは鳴らさない
      discard(playable)
      return
    }
    current = playable
    delete prefetched[i]
    // 合成中に話速が変わっていたら、その比で再生する
    applyRate(playable)
    set({ status: 'playing', label: playable.label || state.label })
    // 先を読んでおく（失敗しても今の再生は続ける）
    prefetchAhead(i)
    try {
      await playable.play()
    } catch (e) {
      if (gen !== generation) return
      current = null
      set({ status: 'idle', error: e.message || String(e) })
      return
    }
    if (gen !== generation) return
    current = null
    playFrom(i + 1)
  }

  const player = {
    /** Markdown を読み込む。再生中なら止める */
    load(markdown, opts) {
      player.stop()
      ensureSpeed()
      chunks = buildSpeechChunksWithLines(markdown)
      dropPrefetch()
      set(
        Object.assign(
          {
            total: chunks.length,
            index: 0,
            error: null,
            label: (opts && opts.label) || state.label
          },
          lineOf(0)
        )
      )
      return chunks.length
    },
    play() {
      if (state.status === 'paused' && current) {
        current.resume()
        set({ status: 'playing' })
        return
      }
      // 合成中に一時停止した場合は playable が無い。同じ塊から作り直す
      if (state.status === 'paused' && !current) {
        playFrom(state.index)
        return
      }
      if (state.status === 'playing' || state.status === 'loading') return
      if (!chunks.length) return
      playFrom(state.index)
    },
    pause() {
      // 合成中でも止められるようにする。届いた合成結果は捨て、位置は保つ
      if (state.status === 'loading') {
        generation++
        set({ status: 'paused' })
        return
      }
      if (state.status !== 'playing' || !current) return
      current.pause()
      set({ status: 'paused' })
    },
    toggle() {
      if (state.status === 'playing') player.pause()
      else player.play()
    },
    /**
     * 止める。**位置は残す**（再生を押すと止めた塊から続く）。
     * 先頭から読み直したい時は restart() を使う
     */
    stop() {
      generation++
      stopCurrent()
      dropPrefetch()
      set({ status: 'idle' })
    },
    /** 先頭から読み直す */
    restart() {
      if (!chunks.length) return
      playFrom(0)
    },
    /** 次の単位（塊 / 段落 / 節）の先頭へ */
    next() {
      if (!chunks.length) return
      const starts = unitStarts()
      const target = starts.find(st => st > state.index)
      if (target == null) {
        player.stop()
        return
      }
      playFrom(target)
    },
    /**
     * 前の単位へ。単位の途中なら、まずその単位の先頭へ戻る
     * （音楽プレーヤーの「前の曲」と同じ作法）
     */
    prev() {
      if (!chunks.length) return
      const starts = unitStarts()
      let curStart = 0
      for (let k = 0; k < starts.length; k++) {
        if (starts[k] <= state.index) curStart = starts[k]
      }
      if (curStart < state.index && state.skipUnit !== 'chunk') {
        playFrom(curStart)
        return
      }
      const before = starts.filter(st => st < curStart)
      playFrom(before.length ? before[before.length - 1] : 0)
    },
    /** 単位で数えた位置（0 始まり）へ */
    seekUnit(u) {
      const starts = unitStarts()
      if (!starts.length) return
      const at = Math.min(starts.length - 1, Math.max(0, Number(u) || 0))
      playFrom(starts[at])
    },
    setSkipUnit(unit) {
      if (SKIP_UNITS.indexOf(unit) === -1) return
      state.skipUnit = unit
      set(unitPosition(state.index))
    },
    /** 指定した塊から再生する（シークバー・カーソル位置から） */
    seek(i) {
      const idx = Number(i)
      if (!chunks.length || Number.isNaN(idx)) return
      playFrom(Math.min(chunks.length - 1, Math.max(0, idx)))
    },
    /**
     * 元の行番号から再生する。その行を含む塊、無ければその行より後ろの
     * 最初の塊。どちらも無ければ最後の塊
     */
    seekToLine(line) {
      const n = Number(line)
      if (!chunks.length || Number.isNaN(n)) return
      let at = chunks.findIndex(c => c.startLine <= n && n <= c.endLine)
      if (at === -1) at = chunks.findIndex(c => c.startLine >= n)
      player.seek(at === -1 ? chunks.length - 1 : at)
    },
    /**
     * 本文のある行から再生する。行の文字列を整形して、それを含む最初の塊を
     * 探す。見つからなければ先頭から
     */
    seekToText(lineText) {
      const needle = buildSpeechChunksWithLines(lineText || '')
        .map(c => c.text)
        .join('')
      if (!needle) {
        player.seek(0)
        return
      }
      const head = needle.slice(0, 12)
      const at = chunks.findIndex(c => c.text.indexOf(head) !== -1)
      player.seek(at === -1 ? 0 : at)
    },
    /** 倍速を 1 段上げ下げする（SPEED_OPTIONS の中で） */
    stepSpeed(dir) {
      ensureSpeed()
      // 一覧に無い値（設定由来）は一番近い段から数える
      let i = SPEED_OPTIONS.indexOf(state.speed)
      if (i === -1) {
        i = SPEED_OPTIONS.reduce(
          (best, v, k) =>
            Math.abs(v - state.speed) <
            Math.abs(SPEED_OPTIONS[best] - state.speed)
              ? k
              : best,
          0
        )
      }
      const cur = i
      const at = Math.min(SPEED_OPTIONS.length - 1, Math.max(0, cur + dir))
      const next = SPEED_OPTIONS[at]
      if (next !== state.speed) player.setSpeed(next)
    },
    stepVolume(dir) {
      player.setVolume(
        Math.round((state.volume + dir * VOLUME_STEP) * 100) / 100
      )
    },
    setVolume(v) {
      const vol = Math.min(1, Math.max(0, Number(v)))
      if (Number.isNaN(vol)) return
      state.volume = vol
      if (current) current.setVolume(vol)
      // 先読み済みの塊は古い音量で作られている。Audio 側は setVolume が効く
      // ので作り直さず、再生開始時に volume を掛け直す
      Object.keys(prefetched).forEach(k => {
        prefetched[k].then(p => p.setVolume(vol)).catch(() => {})
      })
      emit()
    },
    setSpeed(s) {
      const speed = Number(s)
      if (!speed || speed <= 0) return
      state.speed = speed
      // 今鳴っている塊も先読み済みの塊も作り直さない。合成時の話速との比を
      // playbackRate に掛けて追従する（境目で待たない）。新しい話速で合成する
      // のは、まだ頼んでいない塊から
      if (current) applyRate(current)
      Object.keys(prefetched).forEach(k => {
        prefetched[k].then(applyRate).catch(() => {})
      })
      if (state.status === 'playing') prefetchAhead(state.index)
      emit()
    },
    getState() {
      return Object.assign({}, state)
    },
    getChunks() {
      return chunks.slice()
    },
    subscribe(fn) {
      listeners.push(fn)
      fn(Object.assign({}, state))
      return () => {
        const i = listeners.indexOf(fn)
        if (i !== -1) listeners.splice(i, 1)
      }
    }
  }
  return player
}

// アプリ全体で 1 つ。右クリックの「読み上げ」（stopSpeech）でも止まるようにする
const shared = createPlayer()
registerStopHook(() => {
  if (shared.getState().status !== 'idle') shared.stop()
})

export default shared
