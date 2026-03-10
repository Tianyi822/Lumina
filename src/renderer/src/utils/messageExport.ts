import type { ExportFormat, Message, UserInteractionRequest } from '@renderer/types'

export interface ExportFormatOption {
  value: ExportFormat
  label: string
  description: string
  shortcut: string
}

export const EXPORT_FORMAT_OPTIONS: ExportFormatOption[] = [
  {
    value: 'markdown',
    label: 'Markdown',
    description: '保留标题、列表和表格等 Markdown 结构',
    shortcut: '1 / M'
  },
  {
    value: 'word',
    label: 'Word',
    description: '导出为 .docx，适合继续编辑排版',
    shortcut: '2 / W'
  },
  {
    value: 'pdf',
    label: 'PDF',
    description: '导出为固定版式文档，便于直接分享',
    shortcut: '3 / P'
  },
  {
    value: 'txt',
    label: 'TXT',
    description: '导出为纯文本，适合快速留档',
    shortcut: '4 / T'
  },
  {
    value: 'pptx',
    label: 'PPTX',
    description: '导出为 .pptx，自动按内容生成演示文稿',
    shortcut: '5 / S'
  }
]

const EXPORT_INTENT_PATTERNS = [
  /导出(?:一下|下)?(?:这份|当前|这个)?(?:内容|消息|教案|文档|结果)?/i,
  /下载(?:一下|下)?(?:这份|当前|这个)?(?:内容|消息|教案|文档|结果)?/i,
  /保存(?:一下|下)?(?:这份|当前|这个)?(?:内容|消息|教案|文档|结果)?/i
]

/**
 * 创建导出格式选择提示
 */
export function createExportInteractionInfo(): UserInteractionRequest {
  return {
    question: '请选择导出格式，也可以直接输入“导出为 PDF”之类的自然语言回复。',
    options: EXPORT_FORMAT_OPTIONS.map((option) => ({
      value: option.value,
      label: option.label,
      description: option.description
    }))
  }
}

/**
 * 判断消息是否可导出
 */
export function isExportableAssistantMessage(message?: Message | null): message is Message {
  return (
    !!message && message.role === 'assistant' && !message.isStreaming && !!message.content.trim()
  )
}

/**
 * 获取最近一条可导出的 AI 消息
 */
export function findLatestExportableAssistantMessage(messages: Message[]): Message | null {
  for (let index = messages.length - 1; index >= 0; index--) {
    if (isExportableAssistantMessage(messages[index])) {
      return messages[index]
    }
  }

  return null
}

/**
 * 判断文本是否为导出意图
 */
export function isExportIntent(text: string): boolean {
  return EXPORT_INTENT_PATTERNS.some((pattern) => pattern.test(text.trim()))
}

/**
 * 从自然语言中解析导出格式
 */
export function parseExportFormat(text: string): ExportFormat | null {
  const normalized = text.trim().toLowerCase()
  if (!normalized) return null

  if (/(markdown|(^|[^a-z])md([^a-z]|$)|\.md\b)/i.test(normalized)) {
    return 'markdown'
  }

  if (/(^|[^a-z])(word|doc|docx)([^a-z]|$)|word文档|文档格式/i.test(normalized)) {
    return 'word'
  }

  if (/(^|[^a-z])pdf([^a-z]|$)|pdf格式|pdf文件/i.test(normalized)) {
    return 'pdf'
  }

  if (/(^|[^a-z])(txt|text)([^a-z]|$)|纯文本|文本格式/i.test(normalized)) {
    return 'txt'
  }

  if (/(^|[^a-z])(ppt|pptx|slides)([^a-z]|$)|幻灯片|演示文稿|演示稿/i.test(normalized)) {
    return 'pptx'
  }

  return null
}
