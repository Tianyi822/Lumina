import test from 'node:test'
import assert from 'node:assert/strict'
import { getWorkspaceAddLabel, WORKSPACE_NAV_ITEMS } from './workspaceNavigation'

test('写作位于一级导航并使用新建文档动作', () => {
  assert.deepEqual(
    WORKSPACE_NAV_ITEMS.map((item) => item.view),
    ['paper', 'knowledge', 'writer']
  )
  assert.equal(getWorkspaceAddLabel('writer'), '新建文档')
})
