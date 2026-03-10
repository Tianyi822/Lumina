import OpenAI from 'openai'
import type { AttachedDocument } from '@shared/types/chat'
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
 * 格式化文件大小
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
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

  return filteredMessages.map((msg, index) => {
    if (msg.role === 'user' && index === filteredMessages.length - 1) {
      let textContent = msg.content || ''
      if (knowledgeContext) {
        textContent += knowledgeContext
      }
      if (msg.attachedDocuments && msg.attachedDocuments.length > 0) {
        textContent += formatDocumentsContext(msg.attachedDocuments)
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
      return {
        role: 'assistant' as const,
        content: msg.content,
        tool_calls: msg.tool_calls
      }
    }

    return {
      role: msg.role as 'system' | 'user' | 'assistant',
      content: msg.content || ''
    }
  })
}
