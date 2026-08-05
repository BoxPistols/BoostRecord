// localStorage の平文キー → 資格情報ストアへの移行テスト。
// ここでの本題は「移せなかった鍵を消さないこと」。移行は片道なので、
// 先に消してから書く順序になっていると環境次第で鍵が失われる。
const mockInvoke = jest.fn()

jest.mock('electron', () => ({
  ipcRenderer: {
    invoke: (...args) => mockInvoke(...args),
    send: jest.fn(),
    on: jest.fn(),
    removeListener: jest.fn()
  },
  app: { getPath: () => '/tmp', getName: () => 'test', getVersion: () => '0' }
}))

jest.mock('../../browser/lib/RcParser', () => ({ parse: () => ({}) }))

// ConfigManager.set() は eventEmitter 経由で現在のウィンドウへ通知する
jest.mock('@electron/remote', () => ({
  getCurrentWindow: () => ({ webContents: { send: jest.fn() } }),
  app: { getPath: () => '/tmp', getName: () => 'test', getVersion: () => '0' }
}))

function seedConfig(ai) {
  window.localStorage.setItem(
    'config',
    JSON.stringify({ zoom: 1, isSideNavFolded: false, listWidth: 280, ai })
  )
}

function savedAi() {
  return JSON.parse(window.localStorage.getItem('config')).ai
}

// migratePlaintextKeys は「起動時に1回」を守るためモジュール内にフラグを持つ。
// ケースごとに読み込み直す（この jest には isolateModules が無い）
function freshMigrate() {
  jest.resetModules()
  return require('browser/main/lib/aiKeys').migratePlaintextKeys
}

beforeEach(() => {
  window.localStorage.clear()
  mockInvoke.mockReset()
})

it('資格情報ストアへ移せた provider だけ config の平文を消す', async () => {
  mockInvoke.mockResolvedValue({ ok: true })
  seedConfig({
    provider: 'openai',
    openai: { apiKey: 'sk-plain', model: 'gpt-5.6-luna' },
    gemini: { apiKey: 'AIza-plain', model: 'gemini-2.5-flash' }
  })

  const result = await freshMigrate()()

  expect(result.migrated.sort()).toEqual(['gemini', 'openai'])
  expect(savedAi().openai.apiKey).toBe('')
  expect(savedAi().gemini.apiKey).toBe('')
  // モデル設定は巻き添えにしない
  expect(savedAi().openai.model).toBe('gpt-5.6-luna')

  const sent = mockInvoke.mock.calls.filter(c => c[0] === 'ai:keys-set')
  expect(sent).toHaveLength(2)
  expect(sent.map(c => c[1].key).sort()).toEqual(['AIza-plain', 'sk-plain'])
})

it('保存に失敗した provider の平文は残す（消えたら再入力できない）', async () => {
  mockInvoke.mockResolvedValue({ ok: false, error: 'ENCRYPTION_UNAVAILABLE' })
  seedConfig({
    provider: 'openai',
    openai: { apiKey: 'sk-plain', model: 'gpt-5.6-luna' },
    gemini: { apiKey: '', model: 'gemini-2.5-flash' }
  })

  const result = await freshMigrate()()

  expect(result.migrated).toEqual([])
  expect(result.failed).toEqual(['openai'])
  expect(savedAi().openai.apiKey).toBe('sk-plain')
})

it('片方だけ成功した場合、成功した方だけ消す', async () => {
  mockInvoke.mockImplementation((channel, req) =>
    Promise.resolve(
      req && req.provider === 'openai'
        ? { ok: true }
        : { ok: false, error: 'WRITE_FAILED' }
    )
  )
  seedConfig({
    provider: 'openai',
    openai: { apiKey: 'sk-plain', model: 'gpt-5.6-luna' },
    gemini: { apiKey: 'AIza-plain', model: 'gemini-2.5-flash' }
  })

  await freshMigrate()()

  expect(savedAi().openai.apiKey).toBe('')
  expect(savedAi().gemini.apiKey).toBe('AIza-plain')
})

it('IPC が失敗しても例外を投げず、平文も消さない', async () => {
  // mockRejectedValue は拒否済み Promise を先に1つ作るため、ハンドラが付く前に
  // unhandled rejection として Node に殺されることがある。都度生成にする
  mockInvoke.mockImplementation(() =>
    Promise.reject(new Error('no handler registered'))
  )
  seedConfig({
    provider: 'openai',
    openai: { apiKey: 'sk-plain', model: 'gpt-5.6-luna' },
    gemini: { apiKey: '', model: 'gemini-2.5-flash' }
  })

  const result = await freshMigrate()()

  expect(result.migrated).toEqual([])
  expect(savedAi().openai.apiKey).toBe('sk-plain')
})

it('移すものが無ければ IPC を叩かない', async () => {
  seedConfig({
    provider: 'openai',
    openai: { apiKey: '', model: 'gpt-5.6-luna' },
    gemini: { apiKey: '   ', model: 'gemini-2.5-flash' }
  })

  const result = await freshMigrate()()

  expect(result).toEqual({ migrated: [], failed: [] })
  expect(mockInvoke.mock.calls.filter(c => c[0] === 'ai:keys-set')).toEqual([])
})

it('2 回目の呼び出しは何もしない（起動時1回）', async () => {
  mockInvoke.mockResolvedValue({ ok: true })
  seedConfig({
    provider: 'openai',
    openai: { apiKey: 'sk-plain', model: 'gpt-5.6-luna' },
    gemini: { apiKey: '', model: 'gemini-2.5-flash' }
  })

  const migrate = freshMigrate()
  await migrate()
  mockInvoke.mockClear()
  const second = await migrate()

  expect(second).toEqual({ migrated: [], failed: [] })
  expect(mockInvoke.mock.calls.filter(c => c[0] === 'ai:keys-set')).toEqual([])
})
