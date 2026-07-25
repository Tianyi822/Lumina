import test from 'node:test'
import assert from 'node:assert/strict'
import type { ChatMessage, PaperQuote } from '@shared/types/chat'
import { buildPaperTextAnchor } from '@shared/utils/paperAnnotationAnchors'
import { buildPaperQuoteContext } from '@shared/utils/paperQuoteContext'
import { formatMessagesWithKnowledge, formatQuotesContext } from './MessageFormatter.ts'

function createQuote(
  viewKind: PaperQuote['viewKind'],
  segmentIndex: number,
  text: string,
  selectedText: string,
  withContext = true
): PaperQuote {
  const startOffset = text.indexOf(selectedText)
  assert.notEqual(startOffset, -1)
  const textAnchor = buildPaperTextAnchor(text, startOffset, startOffset + selectedText.length)

  return {
    id: `${viewKind}-${segmentIndex}`,
    paperId: 'paper-1',
    segmentStableId: `segment-${segmentIndex}`,
    segmentIndex,
    viewKind,
    sourceType: viewKind,
    selectedText,
    surroundingContext: withContext ? buildPaperQuoteContext(text, textAnchor) : undefined,
    sourceLocation: {
      segmentStableId: `segment-${segmentIndex}`,
      segmentIndex,
      pageIndexes: [segmentIndex],
      blockIndexes: [segmentIndex * 2],
      startOffset,
      endOffset: startOffset + selectedText.length
    },
    textAnchor
  }
}

test('formatQuotesContext 按原文和译文分别编号并包含引用主体和上下文', () => {
  const context = formatQuotesContext([
    createQuote(
      'original',
      0,
      'Intro before. Alpha original content. After detail.',
      'Alpha original'
    ),
    createQuote('translation', 1, '前文说明。第一段译文内容。后文解释。', '第一段译文'),
    createQuote(
      'original',
      2,
      'Lead sentence. Beta original content. Tail sentence.',
      'Beta original'
    )
  ])

  assert.match(context, /【原文引用 1】/)
  assert.match(context, /【译文引用 1】/)
  assert.match(context, /【原文引用 2】/)
  assert.match(context, /来源位置：来源：原文；段落：第 1 段；页码：1/)
  assert.match(context, /用户实际选中：\nAlpha original/)
  assert.match(context, /上下文：/)
  assert.match(context, /前文：Intro before\./)
  assert.match(context, /用户选中：<用户选中>Alpha original<\/用户选中>/)
  assert.match(context, /后文：content\. After detail\./)
})

test('formatQuotesContext 兼容没有上下文字段的旧引用', () => {
  const context = formatQuotesContext([
    createQuote('original', 0, 'Alpha original content.', 'Alpha original', false)
  ])

  assert.match(context, /【原文引用 1】/)
  assert.match(context, /用户实际选中：\nAlpha original/)
  assert.equal(context.includes('上下文：'), false)
})

test('formatMessagesWithKnowledge 会过滤历史裁剪产生的孤立 tool 消息', () => {
  const messages: ChatMessage[] = [
    { role: 'tool', tool_call_id: 'call-orphan', content: '{"ok":true}' },
    { role: 'user', content: '继续总结' }
  ]

  const formatted = formatMessagesWithKnowledge(messages)

  assert.deepEqual(
    formatted.map((msg) => msg.role),
    ['user']
  )
})

test('formatMessagesWithKnowledge 保留合法 assistant/tool 配对', () => {
  const messages: ChatMessage[] = [
    {
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id: 'call-search',
          type: 'function',
          function: { name: 'paper__search_context', arguments: '{"query":"DWT"}' }
        }
      ]
    },
    { role: 'tool', tool_call_id: 'call-search', content: '{"matches":[]}' },
    { role: 'user', content: '基于结果继续回答' }
  ]

  const formatted = formatMessagesWithKnowledge(messages)

  assert.deepEqual(
    formatted.map((msg) => msg.role),
    ['assistant', 'tool', 'user']
  )
  assert.equal((formatted[0] as { tool_calls?: unknown[] }).tool_calls?.length, 1)
  assert.equal((formatted[1] as { tool_call_id?: string }).tool_call_id, 'call-search')
})

test('formatMessagesWithKnowledge 只保留有 tool 响应的 tool_calls 且不修改输入', () => {
  const messages: ChatMessage[] = [
    {
      role: 'assistant',
      content: '',
      tool_calls: [
        {
          id: 'call-found',
          type: 'function',
          function: { name: 'paper__read_page', arguments: '{"page":1}' }
        },
        {
          id: 'call-missing',
          type: 'function',
          function: { name: 'paper__read_page', arguments: '{"page":2}' }
        }
      ]
    },
    { role: 'tool', tool_call_id: 'call-found', content: '{"stdout":"/workspace"}' },
    { role: 'user', content: '继续' }
  ]
  const original = JSON.stringify(messages)

  const formatted = formatMessagesWithKnowledge(messages)
  const assistantMessage = formatted[0] as {
    tool_calls?: Array<{ id: string }>
  }

  assert.deepEqual(
    assistantMessage.tool_calls?.map((toolCall) => toolCall.id),
    ['call-found']
  )
  assert.equal(JSON.stringify(messages), original)
})

test('formatMessagesWithKnowledge 仅为合法工具调用 assistant 保留 reasoning_content', () => {
  const messages: ChatMessage[] = [
    {
      role: 'assistant',
      content: '可见回答',
      reasoning_content: '内部思考'
    },
    {
      role: 'assistant',
      content: null,
      reasoning_content: '工具思考',
      tool_calls: [
        {
          id: 'call-search',
          type: 'function',
          function: { name: 'paper__search_context', arguments: '{"query":"DWT"}' }
        }
      ]
    },
    { role: 'tool', tool_call_id: 'call-search', content: '{"matches":[]}' },
    {
      role: 'user',
      content: '继续'
    }
  ]

  const formatted = formatMessagesWithKnowledge(messages)

  assert.deepEqual(
    formatted.map((msg) => msg.role),
    ['assistant', 'assistant', 'tool', 'user']
  )
  assert.equal('reasoning_content' in (formatted[0] as unknown as Record<string, unknown>), false)
  assert.equal(
    (formatted[1] as unknown as { reasoning_content?: string }).reasoning_content,
    '工具思考'
  )
})

test('formatMessagesWithKnowledge 追加新 user 时保持历史前缀不变', () => {
  const baseMessages: ChatMessage[] = [
    { role: 'user', content: '第一轮问题' },
    { role: 'assistant', content: '第一轮回答' },
    { role: 'user', content: '第二轮问题' }
  ]
  const extendedMessages: ChatMessage[] = [
    ...baseMessages,
    { role: 'assistant', content: '第二轮回答' },
    {
      role: 'user',
      content: '第三轮问题',
      attachedDocuments: [
        {
          fileName: 'note.md',
          fileType: 'md',
          fileSize: 12,
          parsedContent: '动态附件内容'
        }
      ]
    }
  ]

  const baseFormatted = formatMessagesWithKnowledge(baseMessages)
  const extendedFormatted = formatMessagesWithKnowledge(extendedMessages)

  assert.equal(
    JSON.stringify(extendedFormatted.slice(0, baseFormatted.length)),
    JSON.stringify(baseFormatted)
  )
  assert.match(String(extendedFormatted.at(-1)?.content), /动态附件内容/)
  assert.doesNotMatch(String(extendedFormatted[0].content), /动态附件内容/)
})

test('历史用户附件在追加新轮次后保持已发送前缀不变', () => {
  const attachedUser: ChatMessage = {
    role: 'user',
    content: '分析附件',
    attachedDocuments: [
      {
        fileName: 'paper.md',
        fileType: 'md',
        fileSize: 16,
        parsedContent: '稳定附件内容'
      }
    ]
  }
  const baseFormatted = formatMessagesWithKnowledge([attachedUser])
  const extendedFormatted = formatMessagesWithKnowledge([
    attachedUser,
    { role: 'assistant', content: '附件分析结果' },
    { role: 'user', content: '继续' }
  ])

  assert.equal(JSON.stringify(extendedFormatted[0]), JSON.stringify(baseFormatted[0]))
  assert.match(String(extendedFormatted[0].content), /稳定附件内容/)
})
