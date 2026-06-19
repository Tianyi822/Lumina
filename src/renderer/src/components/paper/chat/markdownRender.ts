import MarkdownIt from 'markdown-it'
import texmath from 'markdown-it-texmath'
import katex from 'katex'
import { normalizePaperInlineMathForRender } from '@shared/utils/paperMarkdown'

/** 共享 markdown 实例：禁用原始 HTML，启用换行/链接/排版，集成 LaTeX 公式渲染 */
const md = new MarkdownIt({ html: false, breaks: true, linkify: true, typographer: true }).use(
  texmath,
  {
    engine: katex,
    delimiters: ['dollars', 'brackets', 'beg_end'],
    katexOptions: {
      throwOnError: false,
      strict: 'warn',
      output: 'htmlAndMathml',
      maxSize: 500,
      maxExpand: 1000
    }
  }
)

/**
 * 渲染行内 Markdown/LaTeX 文本（不含块级 p 标签）
 * 先经论文内联公式归一化，再用 markdown-it 行内渲染
 */
export function renderInline(text: string): string {
  if (!text) return ''
  return md.renderInline(normalizePaperInlineMathForRender(text, 'paragraph'))
}

/**
 * 渲染块级 Markdown/LaTeX 文本（含独立公式块）
 * 先经论文内联公式归一化（处理 \begin{equation} 等环境），再用 markdown-it 块级渲染
 */
export function renderBlock(text: string): string {
  if (!text) return ''
  return md.render(normalizePaperInlineMathForRender(text, 'paragraph'))
}
