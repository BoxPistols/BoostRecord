// 資格情報ストアの単体テスト。safeStorage を偽物に差し替えて electron 抜きで回す。
// 重視しているのは「鍵を失わないこと」で、成功経路より失敗経路の方が本番。
const fs = require('fs')
const os = require('os')
const path = require('path')
const { createSecureKeyStore } = require('../../lib/ai/secureKeys')

// 暗号化の代わりに 'enc:' を前置するだけ。復号できない入力では投げる
function fakeSafeStorage(options) {
  const opts = options || {}
  return {
    isEncryptionAvailable: () => opts.available !== false,
    encryptString: s => Buffer.from(`${opts.prefix || 'enc:'}${s}`, 'utf8'),
    decryptString: buf => {
      const s = buf.toString('utf8')
      if (s.indexOf('enc:') !== 0) throw new Error('cannot decrypt')
      return s.slice(4)
    }
  }
}

let dir
let filePath

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-secure-keys-'))
  filePath = path.join(dir, 'nested', 'ai-keys.json')
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

function makeStore(safeStorage) {
  return createSecureKeyStore({
    safeStorage: safeStorage || fakeSafeStorage(),
    filePath
  })
}

describe('保存と取り出し', () => {
  it('保存したキーを復号して返す（ディレクトリも作る）', () => {
    const store = makeStore()
    expect(store.set('openai', 'sk-secret')).toEqual({ ok: true })
    expect(store.get('openai')).toBe('sk-secret')
    expect(store.has('openai')).toBe(true)
  })

  it('前後の空白は落とす', () => {
    const store = makeStore()
    store.set('openai', '  sk-secret  ')
    expect(store.get('openai')).toBe('sk-secret')
  })

  it('ファイルに平文が残らない', () => {
    const store = makeStore()
    store.set('openai', 'sk-secret')
    const raw = fs.readFileSync(filePath, 'utf8')
    expect(raw).not.toContain('sk-secret')
  })

  it('ファイルは所有者のみ読み書き（0600）', () => {
    const store = makeStore()
    store.set('openai', 'sk-secret')
    // Windows は POSIX パーミッションを持たないので mode の検証は除く
    if (process.platform !== 'win32') {
      expect(fs.statSync(filePath).mode & 0o777).toBe(0o600)
    }
  })

  it('provider ごとに独立している', () => {
    const store = makeStore()
    store.set('openai', 'sk-a')
    store.set('gemini', 'AIza-b')
    expect(store.get('openai')).toBe('sk-a')
    expect(store.get('gemini')).toBe('AIza-b')
    expect(store.listConfigured(['openai', 'gemini'])).toEqual({
      openai: true,
      gemini: true
    })
  })

  it('空文字を渡すと削除', () => {
    const store = makeStore()
    store.set('openai', 'sk-secret')
    expect(store.set('openai', '')).toEqual({ ok: true, cleared: true })
    expect(store.get('openai')).toBeNull()
    expect(store.has('openai')).toBe(false)
  })
})

describe('暗号化が使えない環境', () => {
  it('保存を拒否する（平文を暗号文のつもりで書かない）', () => {
    const store = makeStore(fakeSafeStorage({ available: false }))
    expect(store.set('openai', 'sk-secret')).toEqual({
      ok: false,
      error: 'ENCRYPTION_UNAVAILABLE'
    })
    expect(fs.existsSync(filePath)).toBe(false)
  })

  it('取り出しは null を返すだけで投げない', () => {
    const store = makeStore(fakeSafeStorage({ available: false }))
    expect(store.get('openai')).toBeNull()
  })

  it('safeStorage 自体が無くても落ちない', () => {
    const store = createSecureKeyStore({ safeStorage: null, filePath })
    expect(store.isAvailable()).toBe(false)
    expect(store.get('openai')).toBeNull()
  })
})

describe('鍵を失わないこと', () => {
  it('復号できなくても暗号文を消さない（環境が戻れば読める）', () => {
    const store = makeStore()
    store.set('openai', 'sk-secret')
    const before = fs.readFileSync(filePath, 'utf8')

    // keyring が変わって復号できなくなった状況
    const broken = makeStore({
      isEncryptionAvailable: () => true,
      encryptString: s => Buffer.from(s, 'utf8'),
      decryptString: () => {
        throw new Error('cannot decrypt')
      }
    })
    expect(broken.get('openai')).toBeNull()
    // has は「入っている」と答え続ける。ファイルも無傷
    expect(broken.has('openai')).toBe(true)
    expect(fs.readFileSync(filePath, 'utf8')).toBe(before)
  })

  it('読み戻せない保存は ok を返さない（呼び出し側が平文を消す前に気づく）', () => {
    // 暗号化はできるが復号が別物になる = 保存できたつもりで読めない
    const store = makeStore(fakeSafeStorage({ prefix: 'other:' }))
    expect(store.set('openai', 'sk-secret')).toEqual({
      ok: false,
      error: 'VERIFY_FAILED'
    })
  })

  it('書き込みに失敗しても投げずに ok:false を返す', () => {
    const store = createSecureKeyStore({
      safeStorage: fakeSafeStorage(),
      filePath,
      fs: {
        readFileSync: fs.readFileSync,
        mkdirSync: () => {},
        writeFileSync: () => {
          throw new Error('EACCES')
        }
      }
    })
    const res = store.set('openai', 'sk-secret')
    expect(res.ok).toBe(false)
    expect(res.error).toBe('EACCES')
  })
})

describe('壊れた保存ファイル', () => {
  it('空扱いにして、上書き保存はできる', () => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, 'not json at all')
    const store = makeStore()
    expect(store.get('openai')).toBeNull()
    expect(store.has('openai')).toBe(false)
    expect(store.set('openai', 'sk-new')).toEqual({ ok: true })
    expect(store.get('openai')).toBe('sk-new')
  })

  it('ファイルが無い状態でも落ちない', () => {
    const store = makeStore()
    expect(store.get('openai')).toBeNull()
    expect(store.listConfigured(['openai', 'gemini'])).toEqual({
      openai: false,
      gemini: false
    })
  })
})

describe('保存が無いときはキーチェーンに触らない', () => {
  // macOS では isEncryptionAvailable() がキーチェーンを読むので、許可ダイアログ
  // の対象になる。何も預けていない利用者にまで出ていた
  it('get() は保存が無ければ isEncryptionAvailable を呼ばない', () => {
    const safeStorage = fakeSafeStorage()
    const spy = jest.spyOn(safeStorage, 'isEncryptionAvailable')
    const store = makeStore(safeStorage)
    expect(store.get('openai')).toBeNull()
    expect(spy).not.toHaveBeenCalled()
  })

  it('保存があるときは復号のために呼ぶ', () => {
    const safeStorage = fakeSafeStorage()
    const store = makeStore(safeStorage)
    store.set('openai', 'sk-test')
    const spy = jest.spyOn(safeStorage, 'isEncryptionAvailable')
    expect(store.get('openai')).toBe('sk-test')
    expect(spy).toHaveBeenCalled()
  })

  it('has() と listConfigured() は呼ばない（ファイルを見るだけ）', () => {
    const safeStorage = fakeSafeStorage()
    const store = makeStore(safeStorage)
    store.set('openai', 'sk-test')
    const spy = jest.spyOn(safeStorage, 'isEncryptionAvailable')
    expect(store.has('openai')).toBe(true)
    expect(store.listConfigured(['openai', 'gemini'])).toEqual({
      openai: true,
      gemini: false
    })
    expect(spy).not.toHaveBeenCalled()
  })
})
