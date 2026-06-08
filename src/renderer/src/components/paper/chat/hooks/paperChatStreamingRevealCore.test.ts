import test from 'node:test'
import assert from 'node:assert/strict'
import {
  derivePaperChatRevealState,
  getNextPaperChatRevealLength
} from './paperChatStreamingRevealCore'

test('流式结束但内容未揭示完时仍保持视觉揭示状态', () => {
  const content = '这是一段模型已经完整返回但界面还没有揭示完的回答'

  const state = derivePaperChatRevealState(content, 9, true)

  assert.equal(state.displayedContent, content.slice(0, 9))
  assert.equal(state.isRevealing, true)
})

test('历史消息不进入视觉揭示状态', () => {
  const content = '历史回答直接完整展示'

  const state = derivePaperChatRevealState(content, content.length, false)

  assert.equal(state.displayedContent, content)
  assert.equal(state.isRevealing, false)
})

test('揭示长度按固定小块推进且不会超过内容长度', () => {
  assert.equal(getNextPaperChatRevealLength(5, 20, 3), 8)
  assert.equal(getNextPaperChatRevealLength(19, 20, 3), 20)
})
