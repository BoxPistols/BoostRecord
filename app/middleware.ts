// Vercel の Routing Middleware。公開中の Web 版の全リクエストに Basic 認証をかける。
//
// ID とパスワードはコードに書かない（公開リポジトリなので誰でも読める）。Vercel の
// 環境変数 BASIC_AUTH_USER / BASIC_AUTH_PASSWORD に置く。どちらかが無いときは
// 開けたままにせず 503 を返す（設定し忘れで素通しにならないように）。
//
// ノートはブラウザの中（OPFS）か利用者のフォルダにあり、ここを通らない。守るのは
// 「誰がこのアプリを開けるか」で、アプリのコードを配る口を絞る。
import { timingSafeEqual, createHash } from 'node:crypto'
import { next } from '@vercel/functions'

export const config = { runtime: 'nodejs' }

const REALM = 'BoostRecord'

// 長さの違いで時間差が出ないよう、ハッシュにしてから比べる
function same(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest()
  const hb = createHash('sha256').update(b).digest()
  return timingSafeEqual(ha, hb)
}

export type AuthResult = 'ok' | 'unauthorized' | 'unconfigured'

export function checkBasicAuth(
  header: string | null,
  user: string | undefined,
  password: string | undefined
): AuthResult {
  if (!user || !password) return 'unconfigured'
  const m = /^Basic\s+([A-Za-z0-9+/=]+)\s*$/i.exec(header ?? '')
  if (!m) return 'unauthorized'
  let decoded: string
  try {
    decoded = Buffer.from(m[1], 'base64').toString('utf8')
  } catch {
    return 'unauthorized'
  }
  const i = decoded.indexOf(':')
  if (i < 0) return 'unauthorized'
  // 片方が違っても両方を比べ、どちらが違ったかを時間で漏らさない
  const userOk = same(decoded.slice(0, i), user)
  const passOk = same(decoded.slice(i + 1), password)
  return userOk && passOk ? 'ok' : 'unauthorized'
}

// 認証前の応答にも、本体と同じ守りを付ける（vercel.json の headers はここには効かない）
const BASE_HEADERS = {
  'Cache-Control': 'no-store',
  'Content-Type': 'text/plain; charset=utf-8',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer'
}

export default function middleware(request: Request) {
  const result = checkBasicAuth(
    request.headers.get('authorization'),
    process.env.BASIC_AUTH_USER,
    process.env.BASIC_AUTH_PASSWORD
  )
  if (result === 'ok') return next()
  if (result === 'unconfigured') {
    return new Response('Service unavailable', { status: 503, headers: BASE_HEADERS })
  }
  return new Response('Authentication required', {
    status: 401,
    headers: {
      ...BASE_HEADERS,
      'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"`
    }
  })
}
