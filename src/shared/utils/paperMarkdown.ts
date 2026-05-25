import type { PaperTranslationSegmentKind } from '../types/paper'

const ORDERED_LIST_MARKER_PATTERN = /(^|\n)(\s*)(\d+)([.)])(\s+)(?=\S)/g
const FALSE_LIST_CONTINUATION_PATTERN =
  /^(?:[a-z]|\d{4,}\b|[("'“‘[]|and\b|or\b|of\b|in\b|to\b|for\b|with\b|by\b|the\b|a\b|an\b)/
const REAL_ORDERED_LIST_CONTENT_PATTERN = /^(?:\[[ xX]\]\s+)?[A-Z\u00C0-\u024F]/

function looksLikeRealOrderedListItem(indexText: string, content: string): boolean {
  const index = Number(indexText)
  if (!Number.isFinite(index) || index < 1 || index > 99) {
    return false
  }

  return REAL_ORDERED_LIST_CONTENT_PATTERN.test(content)
}

export function isFalseOrderedListContinuation(content: string): boolean {
  const match = content.trimStart().match(/^(\d+)([.)])\s+(.+)$/)
  if (!match) {
    return false
  }

  const [, indexText, , lineContent] = match
  if (looksLikeRealOrderedListItem(indexText, lineContent)) {
    return false
  }

  return FALSE_LIST_CONTINUATION_PATTERN.test(lineContent)
}

function shouldEscapeOrderedListMarker(
  kind: PaperTranslationSegmentKind,
  indexText: string,
  delimiter: string,
  content: string
): boolean {
  if (kind !== 'paragraph' && kind !== 'list') {
    return false
  }

  if (looksLikeRealOrderedListItem(indexText, content)) {
    return false
  }

  return isFalseOrderedListContinuation(`${indexText}${delimiter} ${content}`)
}

/**
 * 兜底修正 OCR 残段被 markdown 误识别为有序列表的情况。
 */
export function normalizePaperMarkdownForRender(
  markdown: string,
  kind: PaperTranslationSegmentKind
): string {
  if (!markdown.trim()) {
    return markdown
  }

  return markdown.replace(
    ORDERED_LIST_MARKER_PATTERN,
    (
      _match: string,
      linePrefix: string,
      indentation: string,
      indexText: string,
      delimiter: string,
      spacing: string,
      offset: number,
      source: string
    ) => {
      const lineStart =
        offset +
        linePrefix.length +
        indentation.length +
        indexText.length +
        delimiter.length +
        spacing.length
      const lineEnd = source.indexOf('\n', lineStart)
      const content = source.slice(lineStart, lineEnd >= 0 ? lineEnd : source.length)

      if (!shouldEscapeOrderedListMarker(kind, indexText, delimiter, content)) {
        return `${linePrefix}${indentation}${indexText}${delimiter}${spacing}`
      }

      return `${linePrefix}${indentation}${indexText}\\${delimiter}${spacing}`
    }
  )
}

export function normalizePaperInlineMathForRender(
  content: string,
  kind: PaperTranslationSegmentKind
): string {
  if (kind === 'code') {
    return content
  }

  // 将未包裹的 \begin{equation}...\end{equation} 等环境转为 $$...$$
  let result = content.replace(
    /\\begin\{(equation|align|aligned|gather|gathered|multline|split|eqnarray|cases|matrix|pmatrix|bmatrix|vmatrix|Vmatrix|array)\*?\}([\s\S]*?)\\end\{\1\*?\}/g,
    (_match, env: string, body: string) => {
      return `$$\\begin{${env}}${body}\\end{${env}}$$`
    }
  )

  // 修正行内公式空格
  result = result.replace(/\$([^\n$]+?)\$/g, (_match, expression: string) => {
    return `$${expression.trim()}$`
  })

  return result
}
