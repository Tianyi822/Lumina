import test from 'node:test'
import assert from 'node:assert/strict'
import { useWriterChatStore } from './writerChatStore'

test('不同写作文档的消息和流状态互不共享', () => {
  const store = useWriterChatStore.getState()
  store.initializeSession('session-a', 'writer-a')
  store.initializeSession('session-b', 'writer-b')
  store.appendContent('session-a', '回答 A')
  assert.equal(store.getSession('session-a')?.streamingContent, '回答 A')
  assert.equal(store.getSession('session-b')?.streamingContent, '')
  assert.equal(store.getSession('session-a')?.selectedPaperId, undefined)
})
