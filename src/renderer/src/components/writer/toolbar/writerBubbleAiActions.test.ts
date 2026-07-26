import assert from 'node:assert/strict'
import test from 'node:test'
import {
  WRITER_BUBBLE_CONTINUE_PROMPT,
  WRITER_BUBBLE_REWRITE_PROMPT,
  canStartWriterBubbleAiAction,
  getWriterBubbleAiPrompt
} from './writerBubbleAiActions'

test('改写与续写使用固定提示词且互不相同', () => {
  assert.equal(getWriterBubbleAiPrompt('rewrite'), WRITER_BUBBLE_REWRITE_PROMPT)
  assert.equal(getWriterBubbleAiPrompt('continue'), WRITER_BUBBLE_CONTINUE_PROMPT)
  assert.notEqual(WRITER_BUBBLE_REWRITE_PROMPT, WRITER_BUBBLE_CONTINUE_PROMPT)
  assert.match(WRITER_BUBBLE_REWRITE_PROMPT, /改写当前选区/)
  assert.match(WRITER_BUBBLE_CONTINUE_PROMPT, /选区之后续写/)
})

test('发送中或无模型时拒绝气泡 AI 动作', () => {
  assert.deepEqual(canStartWriterBubbleAiAction({ isSending: true, selectedModel: 'm1' }), {
    ok: false,
    reason: 'busy'
  })
  assert.deepEqual(canStartWriterBubbleAiAction({ isSending: false, selectedModel: '' }), {
    ok: false,
    reason: 'no_model'
  })
  assert.deepEqual(canStartWriterBubbleAiAction({ isSending: false, selectedModel: 'm1' }), {
    ok: true
  })
})
