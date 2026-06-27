import React from 'react'
import renderer from 'react-test-renderer'
import StorageList from 'browser/components/StorageList'

it('StorageList shows the empty message when there are no storages', () => {
  const tree = renderer
    .create(<StorageList storageList={[]} isFolded={false} />)
    .toJSON()
  expect(tree.props.className).toBe('storageList')
  expect(JSON.stringify(tree)).toContain('No storage mount.')
})

it('StorageList uses the folded class when folded', () => {
  const tree = renderer
    .create(<StorageList storageList={[]} isFolded />)
    .toJSON()
  expect(tree.props.className).toBe('storageList-folded')
})

it('StorageList renders the provided storages', () => {
  const items = [<div key='a'>StorageA</div>, <div key='b'>StorageB</div>]
  const tree = renderer
    .create(<StorageList storageList={items} isFolded={false} />)
    .toJSON()
  expect(JSON.stringify(tree)).toContain('StorageA')
  expect(JSON.stringify(tree)).not.toContain('No storage mount.')
})
