const Mutable = require('browser/lib/Mutable')

describe('Mutable.Map', () => {
  it('wraps a Map with get/set/has/delete/size', () => {
    const m = new Mutable.Map([['a', 1]])
    expect(m.get('a')).toBe(1)
    expect(m.has('a')).toBe(true)
    expect(m.size).toBe(1)

    m.set('b', 2)
    expect(m.get('b')).toBe(2)
    expect(m.size).toBe(2)

    m.delete('a')
    expect(m.has('a')).toBe(false)
  })

  it('map() returns an array of callback results', () => {
    const m = new Mutable.Map([
      ['a', 1],
      ['b', 2]
    ])
    expect(m.map((value, key) => `${key}:${value}`).sort()).toEqual([
      'a:1',
      'b:2'
    ])
  })

  it('toJS() returns a plain object and converts nested mutables', () => {
    const m = new Mutable.Map([
      ['a', 1],
      ['s', new Mutable.Set([1, 2])]
    ])
    expect(m.toJS()).toEqual({ a: 1, s: [1, 2] })
  })
})

describe('Mutable.Set', () => {
  it('wraps a Set with add/delete/size', () => {
    const s = new Mutable.Set([1])
    expect(s.size).toBe(1)

    s.add(2)
    expect(s.size).toBe(2)

    s.delete(1)
    expect(s.size).toBe(1)
  })

  it('toJS() returns an array of the values', () => {
    const s = new Mutable.Set([1, 2, 3])
    expect(s.toJS().sort()).toEqual([1, 2, 3])
  })
})
