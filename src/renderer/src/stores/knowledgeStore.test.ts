import test from 'node:test'
import assert from 'node:assert/strict'
import { useKnowledgeStore } from './knowledgeStore'
import type { KnowledgeBase } from '@shared/types/knowledge'
import { initI18n } from '@renderer/i18n'

// store 错误兜底走 i18n.t：先初始化（测试环境无 localStorage，默认语言恒为 zh）
await initI18n()

function createKnowledgeBase(): KnowledgeBase {
  return {
    id: 'kb-1',
    name: '测试知识库',
    embeddingConfig: {
      baseUrl: 'http://localhost',
      model: 'test-embedding',
      dimensions: 3
    },
    embeddingDimension: 3,
    chunkSize: 500,
    chunkOverlap: 50,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    documentCount: 2,
    linkedFileIds: ['file-1', 'file-2'],
    indexInvalidation: {
      needsReindex: true,
      reason: 'paper_note_updated',
      markedAt: '2026-01-02T00:00:00.000Z',
      files: [
        {
          fileId: 'file-1',
          fileName: 'removed.md',
          updatedAt: '2026-01-02T00:00:00.000Z'
        },
        {
          fileId: 'file-2',
          fileName: 'kept.md',
          updatedAt: '2026-01-02T00:00:00.000Z'
        }
      ]
    }
  }
}

test('unlinkFileFromKB 会同步清理本地索引失效文件', () => {
  useKnowledgeStore.setState({
    knowledgeBases: [createKnowledgeBase()],
    activeKbId: 'kb-1'
  })

  useKnowledgeStore.getState().unlinkFileFromKB('kb-1', 'file-1')

  const kb = useKnowledgeStore.getState().knowledgeBases[0]
  assert.deepEqual(kb.linkedFileIds, ['file-2'])
  assert.equal(kb.documentCount, 1)
  assert.deepEqual(
    kb.indexInvalidation?.files.map((file) => file.fileId),
    ['file-2']
  )
})

test('unlinkFileFromKB 移除最后一个失效文件时清空本地失效状态', () => {
  const kb = createKnowledgeBase()
  kb.linkedFileIds = ['file-1']
  kb.documentCount = 1
  kb.indexInvalidation = {
    ...kb.indexInvalidation!,
    files: [kb.indexInvalidation!.files[0]]
  }
  useKnowledgeStore.setState({
    knowledgeBases: [kb],
    activeKbId: 'kb-1'
  })

  useKnowledgeStore.getState().unlinkFileFromKB('kb-1', 'file-1')

  const nextKb = useKnowledgeStore.getState().knowledgeBases[0]
  assert.deepEqual(nextKb.linkedFileIds, [])
  assert.equal(nextKb.documentCount, 0)
  assert.equal(nextKb.indexInvalidation, undefined)
})
