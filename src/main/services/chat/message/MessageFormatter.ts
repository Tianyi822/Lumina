import OpenAI from 'openai'
import type { AttachedDocument, PaperQuote } from '@shared/types/chat'
import { formatFileSize } from '@shared/utils'
import type { ChatMessage, KnowledgeSearchResult } from '../../../types/chat'

/**
 * 构建知识库上下文文本
 */
export function buildKnowledgeContext(knowledgeResults?: KnowledgeSearchResult[]): string {
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
export function formatDocumentsContext(documents: AttachedDocument[]): string {
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
function getQuoteSourceType(quote: PaperQuote): PaperQuote['viewKind'] {
  return quote.sourceType || quote.viewKind
}

function formatQuoteSourceLabel(sourceType: PaperQuote['viewKind']): string {
  return sourceType === 'original' ? '原文' : '译文'
}

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

function normalizeQuotePromptText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

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
 * 格式化消息为 OpenAI 格式
 * 过滤掉空内容的助手消息，将知识库结果和附加文档附加到最后一条用户消息
 * 如果最后一条用户消息包含图片，则使用多模态 content 格式
 */
export function formatMessagesWithKnowledge(
  messages: ChatMessage[],
  knowledgeResults?: KnowledgeSearchResult[]
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const knowledgeContext = buildKnowledgeContext(knowledgeResults)

  const filteredMessages = messages.filter((msg) => {
    if (msg.role === 'assistant') {
      const hasContent = msg.content && msg.content.trim().length > 0
      const hasToolCalls = msg.tool_calls && msg.tool_calls.length > 0
      return hasContent || hasToolCalls
    }
    return true
  })

  // 清理孤立的 tool_calls：确保每个 assistant 的 tool_calls 都有对应的 tool 消息
  const validToolCallIds = new Set(
    filteredMessages
      .filter((msg) => msg.role === 'tool' && msg.tool_call_id)
      .map((msg) => msg.tool_call_id!)
  )

  for (const msg of filteredMessages) {
    if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
      msg.tool_calls = msg.tool_calls.filter((tc) => validToolCallIds.has(tc.id))
    }
  }

  return filteredMessages.map((msg, index) => {
    if (msg.role === 'user' && index === filteredMessages.length - 1) {
      let textContent = msg.content || ''
      if (knowledgeContext) {
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

    if (msg.role === 'assistant' && msg.reasoning_content) {
      return {
        role: 'assistant' as const,
        content: msg.content || '',
        reasoning_content: msg.reasoning_content
      } as OpenAI.Chat.Completions.ChatCompletionMessageParam
    }

    return {
      role: msg.role as 'system' | 'user' | 'assistant',
      content: msg.content || ''
    }
  })
}
