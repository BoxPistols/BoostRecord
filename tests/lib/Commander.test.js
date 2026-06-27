import Commander from 'browser/main/lib/Commander'

it('fires the command on bound elements matching the target', () => {
  const el = { fire: jest.fn() }
  Commander.bind('editor', el)
  Commander.fire('editor:save')
  expect(el.fire).toHaveBeenCalledWith('save')
  Commander.release(el)
})

it('does not fire released elements', () => {
  const el = { fire: jest.fn() }
  Commander.bind('editor', el)
  Commander.release(el)
  Commander.fire('editor:save')
  expect(el.fire).not.toHaveBeenCalled()
})

it('fires every element bound to the same target', () => {
  const a = { fire: jest.fn() }
  const b = { fire: jest.fn() }
  Commander.bind('list', a)
  Commander.bind('list', b)
  Commander.fire('list:refresh')
  expect(a.fire).toHaveBeenCalledWith('refresh')
  expect(b.fire).toHaveBeenCalledWith('refresh')
  Commander.release(a)
  Commander.release(b)
})

it('ignores commands with no matching target', () => {
  expect(() => Commander.fire('nothing:here')).not.toThrow()
})
