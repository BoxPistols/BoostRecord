// ノート読み上げプレーヤーの状態遷移。合成（prepare）は偽物に差し替え、
// 「塊が終わったら次へ進む」「一時停止から続きを再生」「途中で止めた合成結果を
// 再生しない」を固定する
jest.mock('../../browser/main/lib/ttsAssist', () => ({
  preparePlayable: jest.fn(),
  registerStopHook: jest.fn()
}))

const { createPlayer } = require('browser/main/lib/ttsPlayer')

// play() の完了を外から制御できる偽の playable
function fakePlayable(label) {
  const p = {
    label,
    volume: 1,
    paused: false,
    stopped: false,
    play: jest.fn(
      () =>
        new Promise(resolve => {
          p.finish = resolve
        })
    ),
    pause: jest.fn(() => {
      p.paused = true
    }),
    resume: jest.fn(() => {
      p.paused = false
    }),
    stop: jest.fn(() => {
      p.stopped = true
    }),
    setVolume: jest.fn(v => {
      p.volume = v
    }),
    setRate: jest.fn(r => {
      p.rate = r
    })
  }
  return p
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

describe('ttsPlayer', () => {
  let made
  let prepare
  let player

  beforeEach(() => {
    made = []
    prepare = jest.fn(text => {
      const p = fakePlayable('声')
      p.text = text
      made.push(p)
      return Promise.resolve(p)
    })
    player = createPlayer({
      prepare,
      getConfig: () => ({ params: { speed: 1.2 }, rate: 1 })
    })
  })

  it('本文を塊に分け、1 つ終わるごとに次へ進み、最後で idle に戻る', async () => {
    expect(player.load('一。\n\n二。')).toBe(2)
    expect(player.getState().total).toBe(2)
    player.play()
    await flush()
    expect(player.getState().status).toBe('playing')
    expect(made[0].text).toBe('一。')
    // 再生中に次の塊を先読みしている
    expect(prepare).toHaveBeenCalledTimes(2)
    made[0].finish()
    await flush()
    expect(player.getState().index).toBe(1)
    expect(made[1].play).toHaveBeenCalled()
    made[1].finish()
    await flush()
    expect(player.getState().status).toBe('idle')
    expect(player.getState().index).toBe(0)
  })

  it('一時停止は今の塊を止め、再生で続きから', async () => {
    player.load('一。')
    player.play()
    await flush()
    player.pause()
    expect(made[0].pause).toHaveBeenCalled()
    expect(player.getState().status).toBe('paused')
    player.play()
    expect(made[0].resume).toHaveBeenCalled()
    expect(player.getState().status).toBe('playing')
  })

  it('合成中の一時停止は結果を捨てて位置を保ち、再生で同じ塊から作り直す', async () => {
    let resolveFirst
    const calls = []
    prepare = jest.fn(
      text =>
        new Promise(resolve => {
          calls.push(text)
          resolveFirst = resolve
        })
    )
    player = createPlayer({
      prepare,
      getConfig: () => ({ params: { speed: 1.2 }, rate: 1 })
    })
    player.load('一。\n\n二。')
    player.play()
    expect(player.getState().status).toBe('loading')
    player.pause()
    expect(player.getState().status).toBe('paused')
    const late = fakePlayable('遅')
    resolveFirst(late)
    await flush()
    expect(late.play).not.toHaveBeenCalled()
    player.play()
    expect(player.getState().status).toBe('loading')
    expect(calls[calls.length - 1]).toBe('一。')
  })

  it('停止後に届いた合成結果は再生しない', async () => {
    let resolveFirst
    prepare = jest.fn(
      () =>
        new Promise(resolve => {
          resolveFirst = resolve
        })
    )
    player = createPlayer({
      prepare,
      getConfig: () => ({ params: { speed: 1.2 }, rate: 1 })
    })
    player.load('一。')
    player.play()
    expect(player.getState().status).toBe('loading')
    player.stop()
    const late = fakePlayable('遅')
    resolveFirst(late)
    await flush()
    expect(late.play).not.toHaveBeenCalled()
    expect(player.getState().status).toBe('idle')
  })

  it('次へ / 前へは塊を跨いで移動し、最後の次は停止', async () => {
    player.load('一。\n\n二。\n\n三。')
    player.play()
    await flush()
    player.next()
    await flush()
    expect(player.getState().index).toBe(1)
    expect(made[0].stop).toHaveBeenCalled()
    player.prev()
    await flush()
    expect(player.getState().index).toBe(0)
    player.next()
    await flush()
    player.next()
    await flush()
    expect(player.getState().index).toBe(2)
    player.next()
    expect(player.getState().status).toBe('idle')
  })

  it('音量は再生中の塊へ即座に効き、次の塊にも引き継ぐ', async () => {
    player.load('一。\n\n二。')
    player.play()
    await flush()
    player.setVolume(0.3)
    expect(made[0].setVolume).toHaveBeenCalledWith(0.3)
    made[0].finish()
    await flush()
    // 先読み済みの 2 塊目にも setVolume が届いている
    expect(made[1].setVolume).toHaveBeenCalledWith(0.3)
  })

  it('再生中の話速変更は今の塊も先読み済みも作り直さず playbackRate で追従し、未着手の塊から新しい話速で合成する', async () => {
    player.load('一。\n\n二。\n\n三。\n\n四。')
    player.play()
    await flush()
    // 先読みは 2 つ先まで（一 を再生中に 二・三 を合成）
    expect(made.map(m => m.text)).toEqual(['一。', '二。', '三。'])
    const first = made[0]
    player.setSpeed(1.5)
    await flush()
    expect(first.stop).not.toHaveBeenCalled()
    expect(first.setRate).toHaveBeenCalledWith(1.5 / 1.2)
    // 先読み済みは捨てず、比で追従
    expect(made[1].setRate).toHaveBeenCalledWith(1.5 / 1.2)
    expect(made[1].stop).not.toHaveBeenCalled()
    // 新しい話速で合成し直した塊は無い（未着手の 四 は再生が進んでから）
    expect(made.length).toBe(3)
    first.finish()
    await flush()
    // 二 が鳴り、三 は既にあるので 四 だけを新しい話速で合成
    const last = prepare.mock.calls[prepare.mock.calls.length - 1]
    expect(last[0]).toBe('四。')
    expect(last[1].params.speed).toBe(1.5)
  })

  it('合成に失敗したらエラーを出して idle に戻る', async () => {
    prepare = jest.fn(() =>
      Promise.reject(new Error('VOICEVOX が起動していません'))
    )
    player = createPlayer({
      prepare,
      getConfig: () => ({ params: { speed: 1.2 }, rate: 1 })
    })
    player.load('一。')
    player.play()
    await flush()
    expect(player.getState().status).toBe('idle')
    expect(player.getState().error).toMatch(/VOICEVOX/)
  })
})

describe('ttsPlayer seek / step', () => {
  let made
  let prepare
  let player

  beforeEach(() => {
    made = []
    prepare = jest.fn(text => {
      const p = fakePlayable('声')
      p.text = text
      made.push(p)
      return Promise.resolve(p)
    })
    player = createPlayer({
      prepare,
      getConfig: () => ({ params: { speed: 1.2 }, rate: 1 })
    })
  })

  it('seek は指定した塊から再生し、範囲外は端に寄せる', async () => {
    player.load('一。\n\n二。\n\n三。')
    player.seek(2)
    await flush()
    expect(player.getState().index).toBe(2)
    expect(made[made.length - 1].text).toBe('三。')
    player.seek(99)
    await flush()
    expect(player.getState().index).toBe(2)
  })

  it('seekToText はカーソル行の本文を含む塊から再生する', async () => {
    player.load('# 見出し\n\n最初の段落。\n\n- **二つ目**の段落。\n\n三つ目。')
    // 塊は [見出し, 最初の段落, 二つ目の段落, 三つ目] なので 2
    player.seekToText('- **二つ目**の段落。')
    await flush()
    expect(player.getState().index).toBe(2)
    // 見つからなければ先頭から
    player.seekToText('どこにも無い文')
    await flush()
    expect(player.getState().index).toBe(0)
  })

  it('話速の初期値は設定の話速。stepSpeed は選択肢を 1 段ずつ動き、端で止まる', () => {
    player = createPlayer({
      prepare,
      getConfig: () => ({ params: { speed: 1.2 }, rate: 1 })
    })
    player.load('一。')
    expect(player.getState().speed).toBe(1.2)
    player.stepSpeed(1)
    expect(player.getState().speed).toBe(1.5)
    player.stepSpeed(-1)
    player.stepSpeed(-1)
    expect(player.getState().speed).toBe(1)
    for (let i = 0; i < 10; i++) player.stepSpeed(-1)
    expect(player.getState().speed).toBe(0.5)
  })

  it('stepVolume は 0.1 刻みで 0〜1 に収まる', () => {
    player.stepVolume(-1)
    expect(player.getState().volume).toBe(0.9)
    for (let i = 0; i < 20; i++) player.stepVolume(1)
    expect(player.getState().volume).toBe(1)
  })
})

describe('ttsPlayer の位置と行', () => {
  let made
  let prepare
  let player

  beforeEach(() => {
    made = []
    prepare = jest.fn(text => {
      const p = fakePlayable('声')
      p.text = text
      made.push(p)
      return Promise.resolve(p)
    })
    player = createPlayer({
      prepare,
      getConfig: () => ({ params: { speed: 1.2 }, rate: 1 })
    })
  })

  it('状態にいま読んでいる行範囲が入る', async () => {
    player.load('# 見出し\n\n本文です。\n\n次の段落。')
    expect(player.getState().startLine).toBe(0)
    player.play()
    await flush()
    made[0].finish()
    await flush()
    expect(player.getState().startLine).toBe(2)
    expect(player.getState().endLine).toBe(2)
  })

  it('停止しても位置は残り、再生で続きから。restart で先頭から', async () => {
    player.load('一。\n\n二。\n\n三。')
    player.seek(2)
    await flush()
    player.stop()
    expect(player.getState().status).toBe('idle')
    expect(player.getState().index).toBe(2)
    player.play()
    await flush()
    expect(player.getState().index).toBe(2)
    player.restart()
    await flush()
    expect(player.getState().index).toBe(0)
  })

  it('seekToLine は元の行番号を含む塊から再生する', async () => {
    player.load('# 見出し\n\n一行目。\n二行目。\n\n別の段落。')
    player.seekToLine(3)
    await flush()
    expect(player.getState().index).toBe(1)
    // 落とした行を指したら、その次の塊
    player.seekToLine(4)
    await flush()
    expect(player.getState().index).toBe(2)
  })

  it('待っている間に止めた合成結果は破棄する（Blob を残さない）', async () => {
    let resolveFirst
    prepare = jest.fn(
      () =>
        new Promise(resolve => {
          resolveFirst = resolve
        })
    )
    player = createPlayer({
      prepare,
      getConfig: () => ({ params: { speed: 1.2 }, rate: 1 })
    })
    player.load('一。')
    player.play()
    player.stop()
    const late = fakePlayable('遅')
    resolveFirst(late)
    await flush()
    expect(late.play).not.toHaveBeenCalled()
    expect(late.stop).toHaveBeenCalled()
  })
})

describe('移動単位（塊 / 段落 / 見出し）', () => {
  let made
  let prepare
  const mk = unit =>
    createPlayer({
      prepare,
      getConfig: () => ({ params: { speed: 1.2 }, rate: 1, skipUnit: unit })
    })
  const md = ['# 一章', '文 1。文 2。', '', '文 3。', '# 二章', '文 4。'].join(
    '\n'
  )
  // 塊: [一章, 文1。文2。, 文3。, 二章, 文4。] = index 0..4
  //     段落: 0, 1, 2, 3, 4 / 節: 1, 1, 1, 2, 2

  beforeEach(() => {
    made = []
    prepare = jest.fn(text => {
      const p = fakePlayable('声')
      p.text = text
      made.push(p)
      return Promise.resolve(p)
    })
  })

  it('見出し単位: 次へは次の見出し、前へは節の途中なら節の先頭へ', async () => {
    const player = mk('section')
    player.load(md, 4)
    expect(player.getState().unitTotal).toBe(2)
    player.seek(1)
    await flush()
    player.next()
    await flush()
    expect(player.getState().index).toBe(3)
    expect(player.getState().unitIndex).toBe(1)
    player.seek(2)
    await flush()
    player.prev()
    await flush()
    expect(player.getState().index).toBe(0)
  })

  it('段落単位: 段落の先頭へ飛び、シークの目盛りは段落数', async () => {
    const player = mk('paragraph')
    player.load(md, 4)
    expect(player.getState().unitTotal).toBe(5)
    player.seekUnit(2)
    await flush()
    expect(player.getState().index).toBe(2)
    // 先読みで次の塊も作るので「最後に作った塊」ではなく、飛び先が鳴ったことを見る
    expect(made.find(m => m.text === '文 3。').play).toHaveBeenCalled()
  })

  it('単位は途中で切り替えられ、位置の表示が変わる', async () => {
    const player = mk('chunk')
    player.load(md, 4)
    expect(player.getState().unitTotal).toBe(5)
    player.setSkipUnit('section')
    expect(player.getState().unitTotal).toBe(2)
  })
})
