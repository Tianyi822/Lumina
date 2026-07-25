import OpenAI from 'openai'
import type { AttachedDocument, PaperQuote } from '@shared/types/chat'
import { formatFileSize } from '@shared/utils'
import type { ChatMessage, KnowledgeSearchResult } from '../../../types/chat'

/**
 * 构建知识库上下文文本
 */
function buildKnowledgeContext(knowledgeResults?: KnowledgeSearchResult[]): string {
  if (!knowledgeResults || knowledgeResults.length === 0) {
    return ''
  }

  let context = '\n\n# 知识库参考信息\n\n'
  context += '以下是从选中的知识库中检索到的相关信息，请基于这些信息回答用户问题：\n\n'

  for (const kbResult of knowledgeResults) {
    context += `## 知识库：${kbResult.knowledgeBaseName}\n\n`

    if (kbResult.results.length === 0) {
      context += '*该知识库中未找到相关信息*\n\n'
      continue
    }

    for (const result of kbResult.results) {
      context += `### 文档：${result.fileName}\n`
      context += `**相关度：${(result.similarity * 100).toFixed(1)}%**\n\n`
      context += `${result.content}\n\n`
    }

    context += '---\n\n'
  }

  context += '请基于上述知识库内容回答用户问题。如果知识库中没有相关信息，请明确告知用户。'

  return context
}

/**
 * 格式化文档内容为文本
 */
function formatDocumentsContext(documents: AttachedDocument[]): string {
  if (!documents || documents.length === 0) {
    return ''
  }

  let context = '\n\n=== 上传的文档 ===\n\n'

  documents.forEach((doc, index) => {
    context += `[文档 ${index + 1}]\n`
    context += `文件名: ${doc.fileName}\n`
    context += `类型: ${doc.fileType}\n`
    context += `大小: ${formatFileSize(doc.fileSize)}\n`
    context += '---\n'
    context += doc.parsedContent
    context += '\n\n'
  })

  return context
}

/**
 * 格式化论文引用内容为文本
 */
/**
 * 格式化论文引用内容为文本
 */
function getQuoteSourceType(quote: PaperQuote): PaperQuote['viewKind'] {
  return quote.sourceType || quote.viewKind
}

/** 生成引用来源标签（原文/译文） */
function formatQuoteSourceLabel(sourceType: PaperQuote['viewKind']): string {
  return sourceType === 'original' ? '原文' : '译文'
}

/** 构建引用位置描述字符串 */
function formatQuoteLocation(quote: PaperQuote): string {
  const location = quote.sourceLocation
  const segmentIndex = location?.segmentIndex ?? quote.segmentIndex
  const parts = [`来源：${formatQuoteSourceLabel(getQuoteSourceType(quote))}`]

  if (Number.isFinite(segmentIndex)) {
    parts.push(`段落：第 ${segmentIndex + 1} 段`)
  }

  if (location?.pageIndexes?.length) {
    parts.push(`页码：${location.pageIndexes.map((pageIndex) => pageIndex + 1).join(', ')}`)
  }

  if (location?.blockIndexes?.length) {
    parts.push(`块索引：${location.blockIndexes.join(', ')}`)
  }

  const startOffset = location?.startOffset ?? quote.textAnchor.startOffset
  const endOffset = location?.endOffset ?? quote.textAnchor.endOffset
  parts.push(`选区偏移：${startOffset}-${endOffset}`)

  return parts.join('；')
}

/** 规范化引用文本（压缩空白） */
function normalizeQuotePromptText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** 格式化单条引用的上下文信息 */
function formatSingleQuoteContext(quote: PaperQuote): string {
  const selectedText = quote.selectedText.trim() || quote.selectedText
  let context = `来源位置：${formatQuoteLocation(quote)}\n`
  context += `用户实际选中：\n${selectedText}\n`

  const surroundingContext = quote.surroundingContext
  if (!surroundingContext?.contextualText.trim()) {
    return context
  }

  const beforeText = normalizeQuotePromptText(surroundingContext.beforeText)
  const afterText = normalizeQuotePromptText(surroundingContext.afterText)

  context += '上下文：\n'
  if (beforeText) {
    context += `前文：${beforeText}\n`
  }
  context += `用户选中：<用户选中>${selectedText}</用户选中>\n`
  if (afterText) {
    context += `后文：${afterText}\n`
  }

  return context
}

export function formatQuotesContext(quotes: PaperQuote[]): string {
  if (!quotes || quotes.length === 0) {
    return ''
  }

  let context = '\n\n--- 用户选中的论文内容（含上下文） ---\n'
  context += '说明：“用户实际选中”是用户关注的引用主体；“上下文”仅用于理解语义、指代和来源位置。\n'
  let originalIndex = 0
  let translationIndex = 0

  for (const quote of quotes) {
    const sourceType = getQuoteSourceType(quote)
    const label =
      sourceType === 'original' ? `原文引用 ${++originalIndex}` : `译文引用 ${++translationIndex}`
    context += `\n【${label}】\n${formatSingleQuoteContext(quote)}`
  }

  return context
}

/**
 * 深度克隆 ChatMessage，避免副作用修改原始消息
 */
function cloneChatMessage(msg: ChatMessage): ChatMessage {
  return {
    ...msg,
    tool_calls: msg.tool_calls?.map((toolCall) => ({
      id: toolCall.id,
      type: toolCall.type,
      function: {
        name: toolCall.function.name,
        arguments: toolCall.function.arguments
      }
    })),
    attachedDocuments: msg.attachedDocuments ? [...msg.attachedDocuments] : undefined,
    attachedImages: msg.attachedImages ? [...msg.attachedImages] : undefined,
    attachedQuotes: msg.attachedQuotes ? [...msg.attachedQuotes] : undefined
  }
}

/** 判断助手消息是否应该保留（有内容或有工具调用） */
function shouldKeepAssistantMessage(msg: ChatMessage): boolean {
  const hasContent = msg.content && msg.content.trim().length > 0
  const hasToolCalls = msg.tool_calls && msg.tool_calls.length > 0
  return Boolean(hasContent || hasToolCalls)
}

/**
 * 清理发送给模型的工具消息配对，避免历史裁剪后出现孤立 tool 消息。
 */
function sanitizeToolMessagePairs(messages: ChatMessage[]): ChatMessage[] {
  const filteredMessages = messages.map(cloneChatMessage).filter((msg) => {
    if (msg.role === 'assistant') {
      return shouldKeepAssistantMessage(msg)
    }
    return true
  })

  const sanitizedMessages: ChatMessage[] = []
  const consumedToolIndexes = new Set<number>()

  for (let index = 0; index < filteredMessages.length; index++) {
    if (consumedToolIndexes.has(index)) continue

    const msg = filteredMessages[index]
    if (msg.role === 'tool') {
      continue
    }

    if (msg.role !== 'assistant' || !msg.tool_calls || msg.tool_calls.length === 0) {
      sanitizedMessages.push(msg)
      continue
    }

    const validToolCalls = msg.tool_calls.filter((toolCall) => toolCall.id.trim().length > 0)
    const pendingToolCallIds = new Set(validToolCalls.map((toolCall) => toolCall.id))
    const matchedToolMessages: ChatMessage[] = []

    for (
      let toolIndex = index + 1;
      toolIndex < filteredMessages.length && filteredMessages[toolIndex].role === 'tool';
      toolIndex++
    ) {
      const toolMessage = filteredMessages[toolIndex]
      const toolCallId = toolMessage.tool_call_id
      if (!toolCallId || !pendingToolCallIds.has(toolCallId)) {
        continue
      }

      matchedToolMessages.push(toolMessage)
      pendingToolCallIds.delete(toolCallId)
      consumedToolIndexes.add(toolIndex)
    }

    if (matchedToolMessages.length === 0) {
      const assistantMessage: ChatMessage = {
        ...msg,
        tool_calls: undefined
      }
      if (shouldKeepAssistantMessage(assistantMessage)) {
        sanitizedMessages.push(assistantMessage)
      }
      continue
    }

    const matchedToolCallIds = new Set(
      matchedToolMessages.map((toolMessage) => toolMessage.tool_call_id)
    )
    sanitizedMessages.push({
      ...msg,
      tool_calls: validToolCalls.filter((toolCall) => matchedToolCallIds.has(toolCall.id))
    })
    sanitizedMessages.push(...matchedToolMessages)
  }

  return sanitizedMessages
}

/**
 * 格式化消息为 OpenAI 格式
 * 过滤掉空内容的助手消息，将每条用户消息的附件稳定展开。
 * 知识库结果只附加到最后一条用户消息。
 */
export function formatMessagesWithKnowledge(
  messages: ChatMessage[],
  knowledgeResults?: KnowledgeSearchResult[]
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const knowledgeContext = buildKnowledgeContext(knowledgeResults)
  const filteredMessages = sanitizeToolMessagePairs(messages)

  return filteredMessages.map((msg, index) => {
    if (msg.role === 'user') {
      let textContent = msg.content || ''
      if (knowledgeContext && index === filteredMessages.length - 1) {
        textContent += knowledgeContext
      }
      if (msg.attachedDocuments && msg.attachedDocuments.length > 0) {
        textContent += formatDocumentsContext(msg.attachedDocuments)
      }

      if (msg.attachedQuotes && msg.attachedQuotes.length > 0) {
        textContent += formatQuotesContext(msg.attachedQuotes)
      }

      if (msg.attachedImages && msg.attachedImages.length > 0) {
        const contentParts: Array<
          | { type: 'text'; text: string }
          | { type: 'image_url'; image_url: { url: string; detail: string } }
        > = [{ type: 'text', text: textContent }]

        for (const img of msg.attachedImages) {
          contentParts.push({
            type: 'image_url',
            image_url: {
              url: img.base64Data,
              detail: 'auto'
            }
          })
        }

        return {
          role: 'user' as const,
          content: contentParts
        } as OpenAI.Chat.Completions.ChatCompletionUserMessageParam
      }

      return {
        role: 'user' as const,
        content: textContent
      }
    }

    if (msg.role === 'tool') {
      return {
        role: 'tool' as const,
        tool_call_id: msg.tool_call_id || '',
        content: msg.content || ''
      }
    }

    if (msg.role === 'assistant' && msg.tool_calls) {
      const assistantMsg: OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam & {
        reasoning_content?: string
      } = {
        role: 'assistant' as const,
        content: msg.content || null,
        tool_calls: msg.tool_calls
      }
      if (msg.reasoning_content) {
        assistantMsg.reasoning_content = msg.reasoning_content
      }
      return assistantMsg as OpenAI.Chat.Completions.ChatCompletionMessageParam
    }

    return {
      role: msg.role as 'system' | 'user' | 'assistant',
      content: msg.content || ''
    }
  })
}
