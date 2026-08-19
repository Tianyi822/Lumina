import test from 'node:test'
import assert from 'node:assert/strict'
import { useWriterSessionStore } from './writerSessionStore'

function resetStore(): void {
  useWriterSessionStore.getState().closeDocument()
}

test('保存成功更新 revision 并清除 dirty 状态', () => {
  resetStore()
  const store = useWriterSessionStore.getState()

  store.openDocument('writer-document-a', 3, '研究笔记')
  store.markDirty('研究笔记修订')
  store.markSaving()
  store.applySaveResult(4)

  assert.deepEqual(
    {
      documentId: useWriterSessionStore.getState().currentDocumentId,
      revision: useWriterSessionStore.getState().revision,
      dirty: useWriterSessionStore.getState().dirty,
      saveStatus: useWriterSessionStore.getState().saveStatus,
      titleSummary: useWriterSessionStore.getState().titleSummary
    },
    {
      documentId: 'writer-document-a',
      revision: 4,
      dirty: false,
      saveStatus: 'saved',
      titleSummary: '研究笔记修订'
    }
  )
})

test('保存失败保留 dirty 并暴露错误状态', () => {
  resetStore()
  const store = useWriterSessionStore.getState()

  store.openDocument('writer-document-a', 3, '研究笔记')
  store.markDirty()
  store.markSaving()
  store.handleSaveFailure('磁盘不可用')

  assert.equal(useWriterSessionStore.getState().revision, 3)
  assert.equal(useWriterSessionStore.getState().dirty, true)
  assert.equal(useWriterSessionStore.getState().saveStatus, 'error')
  assert.equal(useWriterSessionStore.getState().error, '磁盘不可用')
})

test('revision conflict 保留内存摘要与 revision 并进入 conflict 状态', () => {
  resetStore()
  const store = useWriterSessionStore.getState()

  store.openDocument('writer-document-a', 3, '内存中的新标题')
  store.markDirty()
  store.handleRevisionConflict()

  assert.equal(useWriterSessionStore.getState().revision, 3)
  assert.equal(useWriterSessionStore.getState().dirty, true)
  assert.equal(useWriterSessionStore.getState().saveStatus, 'conflict')
  assert.equal(useWriterSessionStore.getState().titleSummary, '内存中的新标题')
  assert.equal('content' in useWriterSessionStore.getState(), false)
})

test('切换文档时只切换会话摘要并重置旧文档保存状态', () => {
  resetStore()
  const store = useWriterSessionStore.getState()

  store.openDocument('writer-document-a', 3, '旧文档')
  store.markDirty('旧文档未保存标题')
  store.handleSaveFailure('保存失败')
  store.openDocument('writer-document-b', 8, '新文档')

  assert.deepEqual(
    {
      documentId: useWriterSessionStore.getState().currentDocumentId,
      revision: useWriterSessionStore.getState().revision,
      dirty: useWriterSessionStore.getState().dirty,
      saveStatus: useWriterSessionStore.getState().saveStatus,
      titleSummary: useWriterSessionStore.getState().titleSummary,
      error: useWriterSessionStore.getState().error
    },
    {
      documentId: 'writer-document-b',
      revision: 8,
      dirty: false,
      saveStatus: 'idle',
      titleSummary: '新文档',
      error: null
    }
  )
})

test('在途保存响应只推进 revision，不清除响应后产生的新编辑', () => {
  resetStore()
  const store = useWriterSessionStore.getState()

  store.openDocument('writer-document-a', 3, '研究笔记')
  const savingVersion = store.markDirty('第一次编辑')
  store.markSaving()
  const latestVersion = store.markDirty('保存期间的新编辑')
  store.applySaveResult(4, savingVersion)

  assert.equal(latestVersion > savingVersion, true)
  assert.equal(useWriterSessionStore.getState().revision, 4)
  assert.equal(useWriterSessionStore.getState().dirty, true)
  assert.equal(useWriterSessionStore.getState().saveStatus, 'dirty')
  assert.equal(useWriterSessionStore.getState().titleSummary, '保存期间的新编辑')
})

test('外部 revision 同步不覆盖 dirty、编辑版本或内存摘要', () => {
  resetStore()
  const store = useWriterSessionStore.getState()

  store.openDocument('writer-document-a', 3, '研究笔记')
  const editVersion = store.markDirty('内存中的新标题')
  store.syncRevision(8)

  assert.equal(useWriterSessionStore.getState().revision, 8)
  assert.equal(useWriterSessionStore.getState().dirty, true)
  assert.equal(useWriterSessionStore.getState().saveStatus, 'dirty')
  assert.equal(useWriterSessionStore.getState().editVersion, editVersion)
  assert.equal(useWriterSessionStore.getState().titleSummary, '内存中的新标题')
})
