// ConfigManager.get() が「廃止モデル ID を既定へ寄せて保存し直す」ところまで
// 通しで確認する。normalizeAiModels 単体（aiModels.test.js）が正しくても、
// get() に配線されていなければ実機では何も起きないため、配線の側を固定する。
jest.mock('electron', () => ({
  ipcRenderer: { send: jest.fn(), on: jest.fn(), invoke: jest.fn() },
  app: { getPath: () => '/tmp', getName: () => 'test', getVersion: () => '0' }
}))

// .boostnoterc をユーザー環境から読ませない（値が上書きされて判定がぶれる）。
// babel-plugin-webpack-alias は require/import しか書き換えないので、
// jest.mock のパスは相対で指定する（'browser/...' は解決できない）
jest.mock('../../browser/lib/RcParser', () => ({ parse: () => ({}) }))

const ConfigManager = require('browser/main/lib/ConfigManager').default
const { DEFAULT_MODELS } = require('browser/main/lib/aiModels')

function seed(ai) {
  window.localStorage.setItem(
    'config',
    JSON.stringify({ zoom: 1, isSideNavFolded: false, listWidth: 280, ai })
  )
}

function savedAi() {
  return JSON.parse(window.localStorage.getItem('config')).ai
}

beforeEach(() => {
  window.localStorage.clear()
})

it('廃止された旧 ID は既定へ寄り、localStorage にも書き戻る', () => {
  seed({
    provider: 'openai',
    openai: { apiKey: 'sk-keepme', model: 'gpt-5-mini' },
    gemini: { apiKey: '', model: 'gemini-2.5-flash' }
  })

  const config = ConfigManager.get()

  expect(config.ai.openai.model).toBe(DEFAULT_MODELS.openai)
  // 読むたびに寄せ直すのではなく、保存し直して一度で終わらせる
  expect(savedAi().openai.model).toBe(DEFAULT_MODELS.openai)
  // API キーは移行で失わない
  expect(config.ai.openai.apiKey).toBe('sk-keepme')
})

it('提供中の ID はそのまま（勝手に既定へ戻さない）', () => {
  seed({
    provider: 'openai',
    openai: { apiKey: '', model: 'gpt-5.6-sol' },
    gemini: { apiKey: '', model: 'gemini-2.5-flash' }
  })

  expect(ConfigManager.get().ai.openai.model).toBe('gpt-5.6-sol')
  expect(savedAi().openai.model).toBe('gpt-5.6-sol')
})
