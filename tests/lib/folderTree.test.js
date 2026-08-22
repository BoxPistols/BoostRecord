// フォルダ名のパス表記から多階層ツリーを導出する層。
// データモデルは変えず描画だけを変える方式なので、ここが唯一の頭脳になる。
const {
  splitPath,
  joinPath,
  leafName,
  buildFolderTree,
  ancestorPaths,
  isDescendantPath,
  collectFolderKeys,
  childPath,
  renameFolderPaths,
  resolveRenamedPath,
  migrateCollapsedPaths
} = require('browser/lib/folderTree')

const f = (key, name) => ({ key, name, color: '#fff' })

describe('splitPath', () => {
  it('区切りで分ける', () => {
    expect(splitPath('a/b/c')).toEqual(['a', 'b', 'c'])
  })

  it('連続・前後の区切りと空白を落とす', () => {
    expect(splitPath('/a//b/')).toEqual(['a', 'b'])
    expect(splitPath(' a / b ')).toEqual(['a', 'b'])
  })

  it('壊れた入力でも落ちない', () => {
    expect(splitPath('')).toEqual([])
    expect(splitPath('///')).toEqual([])
    expect(splitPath(undefined)).toEqual([])
    expect(splitPath(42)).toEqual([])
  })
})

describe('leafName', () => {
  it('最後の要素を返す', () => {
    expect(leafName('KSD/onboarding/PR-1281')).toBe('PR-1281')
    expect(leafName('KSD')).toBe('KSD')
    expect(leafName('')).toBe('')
  })
})

describe('buildFolderTree', () => {
  it('平坦な名前は根に並ぶ', () => {
    const tree = buildFolderTree([f('a', 'MayApp'), f('b', 'KSD')])
    expect(tree.map(n => n.name)).toEqual(['MayApp', 'KSD'])
    expect(tree.every(n => n.children.length === 0)).toBe(true)
  })

  it('パス表記が階層になる', () => {
    const tree = buildFolderTree([f('a', 'KSD'), f('b', 'KSD/onboarding')])
    expect(tree).toHaveLength(1)
    expect(tree[0].name).toBe('KSD')
    expect(tree[0].children.map(n => n.name)).toEqual(['onboarding'])
    expect(tree[0].children[0].depth).toBe(1)
  })

  it('3階層以上も同じ仕組みで扱える', () => {
    const tree = buildFolderTree([f('a', 'KSD/onboarding/PR-1281/review')])
    let node = tree[0]
    const names = [node.name]
    while (node.children.length) {
      node = node.children[0]
      names.push(node.name)
    }
    expect(names).toEqual(['KSD', 'onboarding', 'PR-1281', 'review'])
    expect(node.depth).toBe(3)
  })

  it('実体のない中間ノードを補う（子が根へ浮かない）', () => {
    // KSD 自体は boostnote.json に無い
    const tree = buildFolderTree([f('a', 'KSD/spec')])
    expect(tree).toHaveLength(1)
    expect(tree[0].name).toBe('KSD')
    expect(tree[0].folder).toBeNull()
    expect(tree[0].children[0].folder.key).toBe('a')
  })

  it('兄弟が同じ親を共有する（親を重複して作らない）', () => {
    const tree = buildFolderTree([f('a', 'KSD/spec'), f('b', 'KSD/onboarding')])
    expect(tree).toHaveLength(1)
    expect(tree[0].children.map(n => n.name)).toEqual(['spec', 'onboarding'])
  })

  it('名前が空でも捨てない（中身へ辿れなくなる）', () => {
    const tree = buildFolderTree([f('a', ''), f('b', '///')])
    expect(tree).toHaveLength(2)
    expect(tree.map(n => n.folder.key)).toEqual(['a', 'b'])
  })

  it('同じパスが2つあれば先勝ち（実体が入れ替わらない）', () => {
    const tree = buildFolderTree([f('a', 'KSD'), f('b', 'KSD')])
    expect(tree).toHaveLength(1)
    expect(tree[0].folder.key).toBe('a')
  })

  it('壊れた入力でも空を返す', () => {
    expect(buildFolderTree(undefined)).toEqual([])
    expect(buildFolderTree([])).toEqual([])
  })
})

describe('ancestorPaths', () => {
  it('浅い順に祖先を返す（自分は含まない）', () => {
    expect(ancestorPaths('a/b/c')).toEqual(['a', 'a/b'])
    expect(ancestorPaths('a')).toEqual([])
    expect(ancestorPaths('')).toEqual([])
  })
})

describe('isDescendantPath', () => {
  it('自分自身も真', () => {
    expect(isDescendantPath('KSD', 'KSD')).toBe(true)
  })

  it('子孫を真とする', () => {
    expect(isDescendantPath('KSD/spec', 'KSD')).toBe(true)
    expect(isDescendantPath('KSD/spec/x', 'KSD')).toBe(true)
  })

  it('**前方一致だけで判定しない**（KSD と KSDX を混同しない）', () => {
    expect(isDescendantPath('KSDX', 'KSD')).toBe(false)
    expect(isDescendantPath('KSDX/spec', 'KSD')).toBe(false)
  })

  it('親子が逆なら偽', () => {
    expect(isDescendantPath('KSD', 'KSD/spec')).toBe(false)
  })

  // ここが緩いと、子孫カスケード削除を載せた瞬間にストレージ全消去になる。
  // '/' のような名前は CreateFolderModal の trim().length > 0 を素通りするため
  // 実際に作成でき、机上の話ではない
  it('正規化して空になる祖先は全 true にしない（全消去の入口）', () => {
    ;['', '/', '///', '   ', ' / '].forEach(ancestor => {
      expect(isDescendantPath('KSD/spec', ancestor)).toBe(false)
      expect(isDescendantPath('anything', ancestor)).toBe(false)
    })
  })
})

describe('collectFolderKeys', () => {
  it('自分と子孫の実フォルダ key を集める（中間ノードは飛ばす）', () => {
    const tree = buildFolderTree([
      f('root', 'KSD'),
      f('a', 'KSD/spec'),
      f('b', 'KSD/onboarding/PR-1'),
      f('c', 'Other')
    ])
    const ksd = tree.find(n => n.name === 'KSD')
    expect(collectFolderKeys(ksd).sort()).toEqual(['a', 'b', 'root'])
  })

  it('実体のない中間ノードだけなら空', () => {
    const tree = buildFolderTree([f('a', 'X/y')])
    const x = tree[0]
    expect(collectFolderKeys(x)).toEqual(['a'])
    expect(collectFolderKeys(null)).toEqual([])
  })
})

describe('childPath', () => {
  it('親のパスを前置する', () => {
    expect(childPath('KSD', 'onboarding')).toBe('KSD/onboarding')
    expect(childPath('KSD/a', 'b')).toBe('KSD/a/b')
  })

  it('親が空なら子だけ', () => {
    expect(childPath('', 'a')).toBe('a')
  })

  it('子にパスを入れても潰れない', () => {
    expect(childPath('KSD', 'a/b')).toBe('KSD/a/b')
  })
})

describe('joinPath', () => {
  it('配列を名前へ戻す', () => {
    expect(joinPath(['a', 'b'])).toBe('a/b')
    expect(joinPath([])).toBe('')
    expect(joinPath(undefined)).toBe('')
  })
})

describe('renameFolderPaths', () => {
  const folders = [
    { key: 'a', name: 'KSD' },
    { key: 'b', name: 'KSD/onboarding' },
    { key: 'c', name: 'KSD/onboarding/PR-1281' },
    { key: 'd', name: 'KSDX' },
    { key: 'e', name: 'Docs' }
  ]

  it('葉の改名は自分だけ', () => {
    const r = renameFolderPaths(folders, 'c', 'KSD/onboarding/PR-2000')
    expect(r.ok).toBe(true)
    expect(r.changes).toEqual([{ key: 'c', name: 'KSD/onboarding/PR-2000' }])
  })

  it('親の改名は子孫のパスも書き換える', () => {
    const r = renameFolderPaths(folders, 'a', 'KSD2')
    expect(r.ok).toBe(true)
    expect(r.changes).toEqual([
      { key: 'a', name: 'KSD2' },
      { key: 'b', name: 'KSD2/onboarding' },
      { key: 'c', name: 'KSD2/onboarding/PR-1281' }
    ])
  })

  it('前方一致だけの別フォルダ（KSDX）は巻き込まない', () => {
    const r = renameFolderPaths(folders, 'a', 'KSD2')
    expect(r.changes.some(c => c.key === 'd')).toBe(false)
  })

  it('既存パスと衝突する改名は拒否する', () => {
    const r = renameFolderPaths(folders, 'a', 'Docs')
    expect(r.ok).toBe(false)
    expect(r.error).toBe('PATH_CLASH')
  })

  it('カスケード先が衝突しても拒否する', () => {
    const list = folders.concat([{ key: 'f', name: 'KSD2/onboarding' }])
    const r = renameFolderPaths(list, 'a', 'KSD2')
    expect(r.ok).toBe(false)
    expect(r.error).toBe('PATH_CLASH')
  })

  it('同名（正規化後）への変更は no-op', () => {
    const r = renameFolderPaths(folders, 'a', ' KSD ')
    expect(r.ok).toBe(true)
    expect(r.changes).toEqual([])
  })

  it('空になる名前は拒否する', () => {
    expect(renameFolderPaths(folders, 'a', ' / ').ok).toBe(false)
    expect(renameFolderPaths(folders, 'zzz', 'X').ok).toBe(false)
  })

  it('正規化を含む改名（a//b → a/b 配下へ）', () => {
    const r = renameFolderPaths(folders, 'a', 'Top//KSD')
    expect(r.changes[0]).toEqual({ key: 'a', name: 'Top/KSD' })
    expect(r.changes[1]).toEqual({ key: 'b', name: 'Top/KSD/onboarding' })
  })
})

describe('resolveRenamedPath', () => {
  it('葉の改名は親パスを保つ', () => {
    expect(resolveRenamedPath('KSD/onboarding', 'spec')).toBe('KSD/spec')
  })

  it('ルート直下も同じ', () => {
    expect(resolveRenamedPath('KSD', 'KSD2')).toBe('KSD2')
  })

  it('区切りを含む入力はその場で深くできる', () => {
    expect(resolveRenamedPath('KSD/onboarding', 'sub/leaf')).toBe(
      'KSD/sub/leaf'
    )
  })

  it('空入力は親パスに関係なく取り消し（親パスへの改名にしない）', () => {
    // newPath === '' だけで判定すると 'a/b' → 'a' の改名として通ってしまい、
    // 全選択→Delete→確定 で階層が1段潰れる
    expect(resolveRenamedPath('a/b', '')).toBe(null)
    expect(resolveRenamedPath('a/b', '  ')).toBe(null)
    expect(resolveRenamedPath('a/b', ' / ')).toBe(null)
    expect(resolveRenamedPath('a', '')).toBe(null)
  })

  it('変更が無ければ取り消し', () => {
    expect(resolveRenamedPath('a/b', 'b')).toBe(null)
    expect(resolveRenamedPath('a/b', ' b ')).toBe(null)
  })
})

describe('migrateCollapsedPaths', () => {
  it('改名したパス自身と子孫を付け替え、無関係は保つ', () => {
    const next = migrateCollapsedPaths(
      new Set(['a', 'a/x', 'ab', 'other']),
      'a',
      'b'
    )
    expect(Array.from(next).sort()).toEqual(['ab', 'b', 'b/x', 'other'])
  })

  it('前方一致だけの別パス（ab）は巻き込まない', () => {
    const next = migrateCollapsedPaths(new Set(['ab/x']), 'a', 'b')
    expect(next.has('ab/x')).toBe(true)
  })

  it('空集合・空 oldPath でも落ちない', () => {
    expect(migrateCollapsedPaths(null, 'a', 'b').size).toBe(0)
    expect(Array.from(migrateCollapsedPaths(['x'], '', 'b'))).toEqual(['x'])
  })
})
