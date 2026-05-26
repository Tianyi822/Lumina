import type { PaperTranslationSegmentKind } from '../types/paper'

const ORDERED_LIST_MARKER_PATTERN = /(^|\n)(\s*)(\d+)([.)])(\s+)(?=\S)/g
const FALSE_LIST_CONTINUATION_PATTERN =
  /^(?:[a-z]|\d{4,}\b|[("'“‘[]|and\b|or\b|of\b|in\b|to\b|for\b|with\b|by\b|the\b|a\b|an\b)/
const REAL_ORDERED_LIST_CONTENT_PATTERN = /^(?:\[[ xX]\]\s+)?[A-Z\u00C0-\u024F]/
const DISPLAY_MATH_PLACEHOLDER_PREFIX = '@@PAPER_DISPLAY_MATH_'
const DISPLAY_MATH_PLACEHOLDER_SUFFIX = '@@'
const LATEX_ENVIRONMENT_PATTERN =
  /\\begin\{(equation|align|aligned|gather|gathered|multline|split|eqnarray|cases|matrix|pmatrix|bmatrix|vmatrix|Vmatrix|array)(\*)?\}([\s\S]*?)\\end\{\1\2?\}/g

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

function normalizeTexForRender(tex: string): string {
  return tex
    .trim()
    .replace(/\\(left|right)\s*([{}])/g, (_match: string, command: string, brace: string) => {
      return `\\${command}\\${brace}`
    })
}

function normalizeStandaloneMathForRender(content: string): string | null {
  const trimmed = content.trim()
  let match = trimmed.match(/^\$\$([\s\S]*?)\$\$$/)
  if (match) {
    const expression = normalizeTexForRender(match[1])
    return expression ? `$$\n${expression}\n$$` : null
  }

  match = trimmed.match(/^\$\s*\n([\s\S]*?)\n\s*\$$/)
  if (match) {
    const expression = normalizeTexForRender(match[1])
    return expression ? `$$\n${expression}\n$$` : null
  }

  match = trimmed.match(/^\\\[([\s\S]*?)\\\]$/)
  if (match) {
    const expression = normalizeTexForRender(match[1])
    return expression ? `\\[\n${expression}\n\\]` : null
  }

  match = trimmed.match(/^\\\(([\s\S]*?)\\\)$/)
  if (match) {
    const expression = normalizeTexForRender(match[1])
    return expression ? `\\(${expression}\\)` : null
  }

  return null
}

function protectDisplayMath(content: string, protectedBlocks: string[]): string {
  return content
    .replace(/\$\$([\s\S]*?)\$\$/g, (_match: string, expression: string) => {
      const placeholder = `${DISPLAY_MATH_PLACEHOLDER_PREFIX}${protectedBlocks.length}${DISPLAY_MATH_PLACEHOLDER_SUFFIX}`
      protectedBlocks.push(`$$${normalizeTexForRender(expression)}$$`)
      return placeholder
    })
    .replace(/\\\[([\s\S]*?)\\\]/g, (_match: string, expression: string) => {
      const placeholder = `${DISPLAY_MATH_PLACEHOLDER_PREFIX}${protectedBlocks.length}${DISPLAY_MATH_PLACEHOLDER_SUFFIX}`
      protectedBlocks.push(`\\[${normalizeTexForRender(expression)}\\]`)
      return placeholder
    })
}

function restoreDisplayMath(content: string, protectedBlocks: string[]): string {
  return content.replace(
    new RegExp(`${DISPLAY_MATH_PLACEHOLDER_PREFIX}(\\d+)${DISPLAY_MATH_PLACEHOLDER_SUFFIX}`, 'g'),
    (placeholder: string, indexText: string) => {
      return protectedBlocks[Number(indexText)] ?? placeholder
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

  const standaloneMath = normalizeStandaloneMathForRender(content)
  if (standaloneMath) {
    return standaloneMath
  }

  // 将未包裹的 \begin{equation}...\end{equation} 等环境转为 $$...$$。
  let result = content.replace(
    LATEX_ENVIRONMENT_PATTERN,
    (_match: string, env: string, star: string | undefined, body: string) => {
      const environmentName = `${env}${star ?? ''}`
      return `$$\\begin{${environmentName}}${normalizeTexForRender(body)}\\end{${environmentName}}$$`
    }
  )

  const protectedBlocks: string[] = []
  result = protectDisplayMath(result, protectedBlocks)

  // 修正行内公式空格
  result = result.replace(/\$([^\n$]+?)\$/g, (_match, expression: string) => {
    return `$${normalizeTexForRender(expression)}$`
  })
  result = result.replace(/\\\(([^\n]+?)\\\)/g, (_match: string, expression: string) => {
    return `\\(${normalizeTexForRender(expression)}\\)`
  })

  return restoreDisplayMath(result, protectedBlocks)
}
