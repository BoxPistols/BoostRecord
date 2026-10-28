// 公開中の Web 版にかける Basic 認証（middleware.ts）
import test from 'node:test'
import assert from 'node:assert/strict'
import middleware, { checkBasicAuth } from '../middleware.ts'

const basic = (user, pass) => 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64')

test('正しい ID とパスワードだけを通す', () => {
  assert.equal(checkBasicAuth(basic('alice', 's3cret'), 'alice', 's3cret'), 'ok')
  assert.equal(checkBasicAuth(basic('alice', 'wrong'), 'alice', 's3cret'), 'unauthorized')
  assert.equal(checkBasicAuth(basic('bob', 's3cret'), 'alice', 's3cret'), 'unauthorized')
  assert.equal(checkBasicAuth(basic('alice', 's3cret!'), 'alice', 's3cret'), 'unauthorized')
  assert.equal(checkBasicAuth(basic('', ''), 'alice', 's3cret'), 'unauthorized')
})

test('パスワードに : を含んでも、最初の : で ID と分ける', () => {
  assert.equal(checkBasicAuth(basic('alice', 'a:b:c'), 'alice', 'a:b:c'), 'ok')
})

test('ヘッダが無い・形式が違うものは通さない', () => {
  for (const h of [null, '', 'Bearer abc', 'Basic', 'Basic !!!', 'Basic ' + Buffer.from('nocolon').toString('base64')]) {
    assert.equal(checkBasicAuth(h, 'alice', 's3cret'), 'unauthorized', String(h))
  }
})

test('環境変数が無いときは素通しにせず、設定されていない扱いにする', () => {
  assert.equal(checkBasicAuth(basic('alice', 's3cret'), undefined, 's3cret'), 'unconfigured')
  assert.equal(checkBasicAuth(basic('alice', 's3cret'), 'alice', ''), 'unconfigured')
})

test('middleware は 401 / 503 を返し、通すときは次へ渡す', () => {
  const req = auth => new Request('https://boost-record.vercel.app/', { headers: auth ? { authorization: auth } : {} })
  // process.env は差し替えず、触ったキーだけ戻す（丸ごと代入すると文字列化の挙動が失われる）
  const saved = {
    BASIC_AUTH_USER: process.env.BASIC_AUTH_USER,
    BASIC_AUTH_PASSWORD: process.env.BASIC_AUTH_PASSWORD
  }
  try {
    delete process.env.BASIC_AUTH_USER
    delete process.env.BASIC_AUTH_PASSWORD
    assert.equal(middleware(req(basic('a', 'b'))).status, 503)

    process.env.BASIC_AUTH_USER = 'alice'
    process.env.BASIC_AUTH_PASSWORD = 's3cret'
    const denied = middleware(req(null))
    assert.equal(denied.status, 401)
    assert.match(denied.headers.get('www-authenticate'), /^Basic realm="BoostRecord"/)
    assert.equal(denied.headers.get('cache-control'), 'no-store')
    assert.equal(denied.headers.get('x-frame-options'), 'DENY')

    const passed = middleware(req(basic('alice', 's3cret')))
    // next() は「次へ渡す」印の付いた応答を返す
    assert.equal(passed.headers.get('x-middleware-next'), '1')
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
})
