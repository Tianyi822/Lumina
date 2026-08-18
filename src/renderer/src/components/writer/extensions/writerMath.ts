import katex from 'katex'
import { i18n } from '@renderer/i18n'

export interface WriterMathRenderSuccess {
  success: true
  latex: string
  html: string
}

export interface WriterMathRenderFailure {
  success: false
  latex: string
  html: ''
  error: string
}

export type WriterMathRenderResult = WriterMathRenderSuccess | WriterMathRenderFailure

export interface WriterMathJson {
  type: 'inlineMath' | 'blockMath'
  attrs: {
    latex: string
    nodeId: string
  }
}

export interface WriterMathDraft {
  editing: boolean
  draft: string
  sourceLatex: string
}

export interface WriterCodeBlockJson {
  type: 'codeBlock'
  attrs: {
    language: WriterCodeLanguage | null
    nodeId: string
  }
  content?: Array<Record<string, unknown>>
}

export const WRITER_CODE_LANGUAGES = [
  'javascript',
  'typescript',
  'python',
  'json',
  'bash',
  'css',
  'xml',
  'markdown',
  'c',
  'cpp',
  'java',
  'rust',
  'go'
] as const

export type WriterCodeLanguage = (typeof WRITER_CODE_LANGUAGES)[number]

const WRITER_CODE_LANGUAGE_SET = new Set<string>(WRITER_CODE_LANGUAGES)

/** 只允许已注册的语法高亮语言，未知语言回退为纯代码块。 */
export function normalizeWriterCodeLanguage(language: unknown): WriterCodeLanguage | null {
  if (typeof language !== 'string' || !WRITER_CODE_LANGUAGE_SET.has(language)) return null
  return language as WriterCodeLanguage
}

export function normalizeWriterCodeBlockAttributes<Attributes extends { language: unknown }>(
  attributes: Attributes
): Omit<Attributes, 'language'> & { language: WriterCodeLanguage | null } {
  return {
    ...attributes,
    language: normalizeWriterCodeLanguage(attributes.language)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 在 Tiptap 创建初始文档前，递归归一持久化 JSON 中的代码语言。 */
export function normalizeWriterCodeBlockContent(content: unknown): unknown {
  if (Array.isArray(content)) return content.map(normalizeWriterCodeBlockContent)
  if (!isRecord(content)) return content

  const normalizedContent = Array.isArray(content.content)
    ? content.content.map(normalizeWriterCodeBlockContent)
    : content.content
  if (content.type !== 'codeBlock') {
    return normalizedContent === content.content
      ? content
      : { ...content, content: normalizedContent }
  }

  const attributes = isRecord(content.attrs) ? content.attrs : {}
  return {
    ...content,
    attrs: normalizeWriterCodeBlockAttributes({ ...attributes, language: attributes.language }),
    ...(normalizedContent === undefined ? {} : { content: normalizedContent })
  }
}

export function normalizeWriterCodeBlockJson(
  document: Omit<WriterCodeBlockJson, 'attrs'> & {
    attrs: { language: unknown; nodeId: string }
  }
): WriterCodeBlockJson {
  return {
    ...document,
    attrs: normalizeWriterCodeBlockAttributes(document.attrs)
  }
}

/** 打开编辑器后记录源码版本，外部事务变化时不允许旧草稿覆盖它。 */
export function createWriterMathDraft(latex: string): WriterMathDraft {
  return {
    editing: true,
    draft: latex,
    sourceLatex: latex
  }
}

export function openWriterMathDraft(current: WriterMathDraft, latex: string): WriterMathDraft {
  return current.editing ? current : createWriterMathDraft(latex)
}

export function reconcileWriterMathDraft(current: WriterMathDraft, latex: string): WriterMathDraft {
  return current.sourceLatex === latex
    ? current
    : {
        editing: false,
        draft: latex,
        sourceLatex: latex
      }
}

/** 使用固定安全配置渲染公式，失败时保留原始 LaTeX 供节点视图展示。 */
export function renderWriterMath(latex: string, displayMode: boolean): WriterMathRenderResult {
  try {
    return {
      success: true,
      latex,
      html: katex.renderToString(latex, {
        displayMode,
        throwOnError: true,
        strict: 'warn',
        trust: false,
        output: 'htmlAndMathml'
      })
    }
  } catch (error) {
    return {
      success: false,
      latex,
      html: '',
      error: error instanceof Error ? error.message : i18n.t('writer.nodes.mathRenderFailed')
    }
  }
}

export function createInlineMathJson(latex: string, nodeId: string): WriterMathJson {
  return {
    type: 'inlineMath',
    attrs: { latex, nodeId }
  }
}

export function createBlockMathJson(latex: string, nodeId: string): WriterMathJson {
  return {
    type: 'blockMath',
    attrs: { latex, nodeId }
  }
}
