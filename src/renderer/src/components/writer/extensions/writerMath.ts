import katex from 'katex'

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
      error: error instanceof Error ? error.message : '公式渲染失败'
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
