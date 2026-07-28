// 保存済み設定と既定値のマージ。Object.assign は浅いため、保存済みの
// hotkey が既定値のオブジェクトごと置き換わり、**新しく足したキーが既存
// ユーザーへ届かない**（設定画面に項目が出ず、ショートカットも登録されない）。
jest.mock('electron', () => ({
  ipcRenderer: { send: jest.fn(), on: jest.fn() },
  app: { getPath: () => '/tmp', getName: () => 'test', getVersion: () => '0' },
  remote: { app: { getPath: () => '/tmp' } }
}))

const { DEFAULT_CONFIG } = require('browser/main/lib/ConfigManager')

// ConfigManager は localStorage を直接読むので、保存済み設定を差し込んで get() する
function getWith(stored) {
  window.localStorage.setItem('config', JSON.stringify(stored))
  jest.resetModules()
  return require('browser/main/lib/ConfigManager').default.get()
}

afterEach(() => {
  window.localStorage.removeItem('config')
})

it('既定値に後から足したホットキーが、保存済み設定を持つ環境にも届く', () => {
  // 新しいキーを知らない古い設定（toggleNoteList などが無い）
  const config = getWith({
    hotkey: { toggleMain: 'Command + Alt + L' }
  })
  expect(config.hotkey.toggleMain).toBe('Command + Alt + L')
  expect(config.hotkey.toggleNoteList).toBe(
    DEFAULT_CONFIG.hotkey.toggleNoteList
  )
  expect(config.hotkey.toggleInfo).toBe(DEFAULT_CONFIG.hotkey.toggleInfo)
  expect(config.hotkey.focusNoteLink).toBe(DEFAULT_CONFIG.hotkey.focusNoteLink)
})

it('保存済みの値は既定値で上書きされない', () => {
  const config = getWith({ hotkey: { toggleNoteList: 'Command + 9' } })
  expect(config.hotkey.toggleNoteList).toBe('Command + 9')
})

it('ui / editor など他の入れ子も同じ扱いになる', () => {
  const config = getWith({ ui: { theme: 'dracula' } })
  expect(config.ui.theme).toBe('dracula')
  // 保存側に無いキーは既定値から補われる
  expect(config.ui.language).toBe(DEFAULT_CONFIG.ui.language)
})

it('空文字のホットキーは「未割り当て」として保持する（既定値で埋めない）', () => {
  const config = getWith({ hotkey: { toggleMenuBar: '' } })
  expect(config.hotkey.toggleMenuBar).toBe('')
})
