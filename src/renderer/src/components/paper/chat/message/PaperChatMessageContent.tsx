import { useMemo } from 'react'
import MarkdownIt from 'markdown-it'
import texmath from 'markdown-it-texmath'
import katex from 'katex'
import { normalizePaperInlineMathForRender } from '@shared/utils/paperMarkdown'
import styles from './PaperChatMessageContent.module.css'
import 'katex/dist/katex.min.css'
import 'markdown-it-texmath/css/texmath.css'

interface PaperChatMessageContentProps {
  content: string
  isStreaming?: boolean
  role: 'system' | 'user' | 'assistant' | 'tool'
}

const md = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: true,
  typographer: true
}).use(texmath, {
  engine: katex,
  delimiters: ['dollars', 'brackets', 'beg_end'],
  katexOptions: {
    throwOnError: false,
    strict: 'warn',
    output: 'htmlAndMathml',
    maxSize: 500,
    maxExpand: 1000
  }
})

/** 使用 markdown-it 将内容渲染为 HTML，支持 LaTeX 数学公式 */
function renderMarkdown(content: string): string {
  if (!content) return ''
  return md.render(normalizePaperInlineMathForRender(content, 'paragraph'))
}

/** 消息内容渲染组件，用户消息直接显示纯文本，AI 消息渲染为 Markdown */
export default function PaperChatMessageContent({
  content,
  isStreaming,
  role
}: PaperChatMessageContentProps) {
  const hasContent = content.trim().length > 0
  const renderedMarkdown = useMemo(() => renderMarkdown(content), [content])

  if (!hasContent) {
    return null
  }

  if (role === 'user') {
    return <div className={styles['message-text']}>{content}</div>
  }

  return (
    <div
      className={[
        styles['markdown-body'],
        'markdown-body',
        isStreaming ? styles['streaming-content'] : ''
      ]
        .filter(Boolean)
        .join(' ')}
      dangerouslySetInnerHTML={{ __html: renderedMarkdown }}
    />
  )
}
