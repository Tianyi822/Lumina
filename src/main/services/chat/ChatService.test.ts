import test from 'node:test'
import assert from 'node:assert/strict'
import { shouldUsePlanExecute } from './chatRouting.ts'
import { hasValidWriterContext } from './ChatService.ts'
import type { WriterAiRequestContext } from '@shared/types/writer'

test('论文会话开启实验室工具但未开启规划模式时走 ReAct', async () => {
  assert.equal(shouldUsePlanExecute({ sessionType: 'paper', enablePlanMode: false }), false)
  assert.equal(shouldUsePlanExecute({ sessionType: 'paper' }), false)
})

test('论文会话显式开启规划模式时才走 Plan-Execute', async () => {
  assert.equal(shouldUsePlanExecute({ sessionType: 'paper', enablePlanMode: true }), true)
  assert.equal(shouldUsePlanExecute({ sessionType: 'default', enablePlanMode: true }), false)
})

function makeWriterContext(): WriterAiRequestContext {
  return {
    documentId: 'writer-aaaaaaaa',
    baseRevision: 1,
    title: '标题',
    blocks: [{ nodeId: 'p-1', type: 'paragraph', text: '正文' }],
    anchor: {
      documentId: 'writer-aaaaaaaa',
      baseRevision: 1,
      scope: 'selection',
      startBlockId: 'p-1',
      endBlockId: 'p-1',
      startOffset: 0,
      endOffset: 2,
      expectedTextHash: 'abc'
    }
  }
}

test('存在有效 writerContext 时计入 ReAct 工具路由', () => {
  assert.equal(hasValidWriterContext({ writerContext: makeWriterContext() }), true)
})

test('无 writerContext 时不计入写作工具路由', () => {
  assert.equal(hasValidWriterContext({}), false)
  assert.equal(hasValidWriterContext({ writerContext: undefined }), false)
})
