import test from 'node:test'
import assert from 'node:assert/strict'
import type { Message } from '../types'
import {
  buildChatMessages,
  messageToSessionMessage,
  sessionMessageToMessage
} from './messageHelpers.ts'

test('buildChatMessages 优先展开模型 transcript 并跳过重复 tool 消息', () => {
  const messages: Message[] = [
    {
      id: 'user-1',
      role: 'user',
      content: '查询后总结'
    },
    {
      id: 'assistant-1',
      role: 'assistant',
      content: '最终总结',
      tool_calls: [
        {
          id: 'call-1',
          type: 'function',
          function: { name: 'paper__search_context', arguments: '{"query":"test"}' }
        }
      ],
      modelTranscript: [
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call-1',
              type: 'function',
              function: { name: 'paper__search_context', arguments: '{"query":"test"}' }
            }
          ]
        },
        { role: 'tool', tool_call_id: 'call-1', content: '{"matches":[]}' },
        { role: 'assistant', content: '最终总结' }
      ]
    },
    {
      id: 'tool-1',
      role: 'tool',
      content: '{"matches":[]}',
      tool_call_id: 'call-1'
    }
  ]

  const chatMessages = buildChatMessages(messages)

  assert.deepEqual(
    chatMessages.map((message) => message.role),
    ['user', 'assistant', 'tool', 'assistant']
  )
  assert.equal(chatMessages.filter((message) => message.role === 'tool').length, 1)
})

test('modelTranscript 在会话消息转换中保持不变', () => {
  const message: Message = {
    id: 'assistant-1',
    role: 'assistant',
    content: '完成',
    modelTranscript: [{ role: 'assistant', content: '完成' }]
  }

  const restored = sessionMessageToMessage(messageToSessionMessage(message))

  assert.deepEqual(restored.modelTranscript, message.modelTranscript)
})
