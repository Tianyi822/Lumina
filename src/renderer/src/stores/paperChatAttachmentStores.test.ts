import assert from 'node:assert/strict'
import test from 'node:test'
import { usePaperChatDocumentUploadStore } from './paperChatDocumentUploadStore'
import { usePaperChatImageUploadStore } from './paperChatImageUploadStore'
import { usePaperChatQuoteStore } from './paperChatQuoteStore'

// 这些 getter 直接作为 zustand selector 结果返回给 useSyncExternalStore。
// 未初始化会话若每次新建空数组，React 会判定快照持续变化并抛
// "Maximum update depth exceeded"（写作 AI 面板 allowPaperQuotes=false 时必现）。

test('未初始化会话的文档 getter 返回稳定空数组引用', () => {
  const store = usePaperChatDocumentUploadStore.getState()

  assert.equal(store.getSessionDocuments('missing'), store.getSessionDocuments('missing'))
  assert.equal(store.getSessionDocuments('missing').length, 0)
  assert.equal(store.getSessionProcessingFiles('missing'), store.getSessionProcessingFiles('other'))
})

test('未初始化会话的图片 getter 返回稳定空数组引用', () => {
  const store = usePaperChatImageUploadStore.getState()

  assert.equal(store.getSessionImages('missing'), store.getSessionImages('missing'))
  assert.equal(
    store.getSessionProcessingImages('missing'),
    store.getSessionProcessingImages('other')
  )
})

test('未初始化会话的引文 getter 返回稳定空数组引用', () => {
  const store = usePaperChatQuoteStore.getState()

  assert.equal(store.getSessionQuotes('missing'), store.getSessionQuotes('missing'))
  assert.equal(store.getSessionQuotes('missing').length, 0)
})

test('初始化会话后 getter 仍返回同一引用直到内容变化', () => {
  const store = usePaperChatQuoteStore.getState()
  store.initSession('session-1')

  const first = usePaperChatQuoteStore.getState().getSessionQuotes('session-1')
  const second = usePaperChatQuoteStore.getState().getSessionQuotes('session-1')

  assert.equal(first, second)
})
