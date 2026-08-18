import test from 'node:test'
import assert from 'node:assert/strict'
import {
  WORKSPACE_NAV_ITEMS,
  WORKSPACE_NAV_LABEL_KEYS,
  WORKSPACE_ADD_LABEL_KEYS
} from './workspaceNavigation'

test('写作位于一级导航并使用新建文档动作', () => {
  assert.deepEqual(
    WORKSPACE_NAV_ITEMS.map((item) => item.view),
    ['paper', 'knowledge', 'writer']
  )
  assert.equal(WORKSPACE_NAV_LABEL_KEYS.writer, 'chrome.nav.writer')
  assert.equal(WORKSPACE_ADD_LABEL_KEYS.writer, 'chrome.nav.addDocument')
})
