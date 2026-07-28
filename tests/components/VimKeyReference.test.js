import React from 'react'
import renderer from 'react-test-renderer'
import VimKeyReference from 'browser/components/VimKeyReference'

// 環境設定で vim を選べるのに、どのキーが使えるかを示す場所が無かった。
// 選んだ本人が忘れると、エディタが「文字を入力できない壊れた状態」に
// 見えてしまう（ノーマルモードに居るだけ）。
it('ノーマルモードで始まることを最初に伝える', () => {
  const json = JSON.stringify(renderer.create(<VimKeyReference />).toJSON())
  expect(json).toMatch(/normal mode|ノーマルモード/)
  // 入力へ入るキーと戻るキーは、これが無いと詰むので必ず載せる
  expect(json).toMatch(/"i"/)
  expect(json).toMatch(/Esc/)
})

it('モード・移動・編集・検索の4区分を出す', () => {
  const json = JSON.stringify(renderer.create(<VimKeyReference />).toJSON())
  ;['Modes', 'Move', 'Edit', 'Search'].forEach(section => {
    expect(json).toMatch(new RegExp(section))
  })
})

it('狭い場所では1列に積む', () => {
  const wide = JSON.stringify(renderer.create(<VimKeyReference />).toJSON())
  const narrow = JSON.stringify(
    renderer.create(<VimKeyReference compact />).toJSON()
  )
  expect(wide).toMatch(/repeat\(auto-fit/)
  expect(narrow).not.toMatch(/repeat\(auto-fit/)
})
