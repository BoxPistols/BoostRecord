import React from 'react'
import renderer from 'react-test-renderer'
import StorageItemChild from 'browser/components/StorageItem'

// ダブルクリック改名のその場編集。モーダルを出さずに行の中で完結する。
// IME（日本語変換）の確定 Enter で誤確定しないこと、二重確定しないことを固定する。

const baseProps = {
  isActive: false,
  folderName: 'onboarding',
  fullPath: 'KSD/onboarding',
  isFolded: false,
  handleDragEnter: () => {},
  handleDragLeave: () => {}
}

const findInput = component =>
  component.root.findAll(n => n.type === 'input')[0]

it('通常時は入力欄を出さない', () => {
  const component = renderer.create(<StorageItemChild {...baseProps} />)
  expect(component.root.findAll(n => n.type === 'input').length).toBe(0)
})

it('編集中は入力欄を出し、初期値は葉の名前', () => {
  const component = renderer.create(
    <StorageItemChild
      {...baseProps}
      isEditing
      onRenameConfirm={jest.fn()}
      onRenameCancel={jest.fn()}
    />
  )
  expect(findInput(component).props.defaultValue).toBe('onboarding')
})

it('Enter で確定し、blur が続いても二重確定しない', () => {
  const onConfirm = jest.fn()
  const component = renderer.create(
    <StorageItemChild
      {...baseProps}
      isEditing
      onRenameConfirm={onConfirm}
      onRenameCancel={jest.fn()}
    />
  )
  const input = findInput(component)
  input.props.onKeyDown({
    key: 'Enter',
    keyCode: 13,
    nativeEvent: {},
    preventDefault: jest.fn(),
    stopPropagation: jest.fn()
  })
  input.props.onBlur()
  expect(onConfirm).toHaveBeenCalledTimes(1)
})

it('IME 変換中の Enter では確定しない（isComposing / keyCode 229 の両方）', () => {
  const onConfirm = jest.fn()
  const component = renderer.create(
    <StorageItemChild
      {...baseProps}
      isEditing
      onRenameConfirm={onConfirm}
      onRenameCancel={jest.fn()}
    />
  )
  const input = findInput(component)
  input.props.onKeyDown({
    key: 'Enter',
    keyCode: 13,
    nativeEvent: { isComposing: true },
    preventDefault: jest.fn(),
    stopPropagation: jest.fn()
  })
  input.props.onKeyDown({
    key: 'Enter',
    keyCode: 229,
    nativeEvent: {},
    preventDefault: jest.fn(),
    stopPropagation: jest.fn()
  })
  expect(onConfirm).not.toHaveBeenCalled()
})

it('Esc で取り消し、その後の blur で確定しない', () => {
  const onConfirm = jest.fn()
  const onCancel = jest.fn()
  const component = renderer.create(
    <StorageItemChild
      {...baseProps}
      isEditing
      onRenameConfirm={onConfirm}
      onRenameCancel={onCancel}
    />
  )
  const input = findInput(component)
  input.props.onKeyDown({
    key: 'Escape',
    keyCode: 27,
    nativeEvent: {},
    preventDefault: jest.fn(),
    stopPropagation: jest.fn()
  })
  input.props.onBlur()
  expect(onCancel).toHaveBeenCalledTimes(1)
  expect(onConfirm).not.toHaveBeenCalled()
})

it('編集中の行は button でない（不正な入れ子でフォーカスを奪い合わない）', () => {
  const component = renderer.create(
    <StorageItemChild
      {...baseProps}
      isEditing
      onRenameConfirm={jest.fn()}
      onRenameCancel={jest.fn()}
    />
  )
  expect(component.root.findAll(n => n.type === 'button').length).toBe(0)
})

it('IME 変換中の Esc では取り消さない（変換キャンセルを尊重）', () => {
  const onCancel = jest.fn()
  const component = renderer.create(
    <StorageItemChild
      {...baseProps}
      isEditing
      onRenameConfirm={jest.fn()}
      onRenameCancel={onCancel}
    />
  )
  const input = findInput(component)
  input.props.onKeyDown({
    key: 'Escape',
    keyCode: 27,
    nativeEvent: { isComposing: true },
    preventDefault: jest.fn(),
    stopPropagation: jest.fn()
  })
  expect(onCancel).not.toHaveBeenCalled()
})

it('renameDefaultValue が表示名より優先される（プレースホルダを実名にしない）', () => {
  const component = renderer.create(
    <StorageItemChild
      {...baseProps}
      folderName='Untitled folder'
      renameDefaultValue=''
      isEditing
      onRenameConfirm={jest.fn()}
      onRenameCancel={jest.fn()}
    />
  )
  expect(findInput(component).props.defaultValue).toBe('')
})
