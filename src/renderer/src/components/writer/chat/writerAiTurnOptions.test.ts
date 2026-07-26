import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveWriterAiTurnOptions } from './writerAiTurnOptions'

test('未传 options 时保持侧栏默认 document + 外部工具', () => {
  assert.deepEqual(resolveWriterAiTurnOptions(), {
    scope: 'document',
    includeExternalTools: true
  })
  assert.deepEqual(resolveWriterAiTurnOptions(undefined), {
    scope: 'document',
    includeExternalTools: true
  })
})

test('气泡选项强制 selection 且关闭外部工具', () => {
  assert.deepEqual(
    resolveWriterAiTurnOptions({ scope: 'selection', includeExternalTools: false }),
    { scope: 'selection', includeExternalTools: false }
  )
})

test('可携带 pendingAction', () => {
  const options = {
    scope: 'selection' as const,
    includeExternalTools: false,
    pendingAction: 'rewrite' as const
  }
  assert.deepEqual(resolveWriterAiTurnOptions(options), {
    scope: 'selection',
    includeExternalTools: false
  })
  assert.equal(options.pendingAction, 'rewrite')
})
