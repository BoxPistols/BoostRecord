// ava 8はESMだけで配布されていて、require('ava')は関数ではなく名前空間
// （{ default, registerCompletionHandler }）を返す。テストファイルはava 0.25の頃の
// `const test = require('ava')`のままなので、名前空間のdefault（test関数）を返すようにする
const mock = require('mock-require')
const ava = require('ava')
mock('ava', ava.default)

// データ層のテストはjsdomやファイル操作の後始末をせず終わるものがあり、ワーカーが
// 終了しないとavaはタイムアウトとして失敗させる。ava 0.25はテスト完了後にワーカーを
// 終了させていたので、同じく完了したら終了させる
ava.registerCompletionHandler(() => {
  process.exit()
})
