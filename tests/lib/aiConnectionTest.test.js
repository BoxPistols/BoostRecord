// 接続テスト（#94）の単体テスト。実際の API は叩かず ai:run の invoke をモックする。
// jest.mock のファクトリからは mock 接頭辞の変数しか参照できない
const mockInvoke = jest.fn()

jest.mock('electron', () => ({
  ipcRenderer: {
    invoke: (...args) => mockInvoke(...args),
    on: jest.fn(),
    removeListener: jest.fn()
  },
  // aiAssist が読み込む ConfigManager は electron-config を
  // モジュール読み込み時に生成するので app.getPath が要る
  app: { getPath: () => '/tmp', getName: () => 'test', getVersion: () => '0' }
}))

const { testAiConnection } = require('browser/main/lib/aiAssist')
const { DEFAULT_MODELS } = require('browser/main/lib/aiModels')

beforeEach(() => {
  mockInvoke.mockReset()
})

it('成功時は ok:true を返す', async () => {
  mockInvoke.mockResolvedValue('OK')
  const result = await testAiConnection({
    provider: 'openai',
    model: 'gpt-5-nano',
    apiKey: 'sk-test'
  })
  expect(result).toEqual({ ok: true, message: '' })
})

it('入力された provider / model / apiKey をそのまま使う', async () => {
  mockInvoke.mockResolvedValue('OK')
  await testAiConnection({
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    apiKey: 'AIza-test'
  })
  const [channel, req] = mockInvoke.mock.calls[0]
  expect(channel).toBe('ai:run')
  expect(req.provider).toBe('gemini')
  expect(req.model).toBe('gemini-2.5-flash')
  expect(req.apiKey).toBe('AIza-test')
})

it('model が空なら provider の既定モデルを使う', async () => {
  mockInvoke.mockResolvedValue('OK')
  await testAiConnection({ provider: 'openai', model: '', apiKey: 'sk-test' })
  expect(mockInvoke.mock.calls[0][1].model).toBe(DEFAULT_MODELS.openai)
})

it('apiKey が空でも呼ぶ（main 側が環境変数へフォールバックするため）', async () => {
  mockInvoke.mockResolvedValue('OK')
  const result = await testAiConnection({ provider: 'openai', model: '' })
  expect(mockInvoke).toHaveBeenCalledTimes(1)
  expect(mockInvoke.mock.calls[0][1].apiKey).toBe('')
  expect(result.ok).toBe(true)
})

it('失敗時は例外を投げずに ok:false とメッセージを返す', async () => {
  mockInvoke.mockRejectedValue(new Error('401 Incorrect API key provided'))
  const result = await testAiConnection({
    provider: 'openai',
    model: '',
    apiKey: 'sk-bad'
  })
  expect(result.ok).toBe(false)
  expect(result.message).toBe('401 Incorrect API key provided')
})

it('Electron が包んだエラー文から本文だけ取り出す', async () => {
  mockInvoke.mockRejectedValue(
    new Error(
      "Error invoking remote method 'ai:run': Error: 401 Incorrect API key provided"
    )
  )
  const result = await testAiConnection({
    provider: 'openai',
    model: '',
    apiKey: 'sk-bad'
  })
  expect(result.message).toBe('401 Incorrect API key provided')
})

it('複数行のエラー文も欠けずに取り出す', async () => {
  mockInvoke.mockRejectedValue(
    new Error("Error invoking remote method 'ai:run': Error: line1\nline2")
  )
  const result = await testAiConnection({ provider: 'openai', model: '' })
  expect(result.message).toBe('line1\nline2')
})

it('メッセージが空でも空文字を返さない', async () => {
  mockInvoke.mockRejectedValue(new Error(''))
  const result = await testAiConnection({ provider: 'openai', model: '' })
  expect(result.message).toBe('Unknown error')
})
