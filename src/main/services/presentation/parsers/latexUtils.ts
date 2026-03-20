/**
 * LaTeX 公式转换工具
 * 优先输出字体兼容性更好的可读文本，避免 PPT 中出现缺字方框
 */

const LATEX_SYMBOLS: Record<string, string> = {
  // 希腊字母
  '\\alpha': 'α',
  '\\beta': 'β',
  '\\gamma': 'γ',
  '\\delta': 'δ',
  '\\epsilon': 'ε',
  '\\zeta': 'ζ',
  '\\eta': 'η',
  '\\theta': 'θ',
  '\\iota': 'ι',
  '\\kappa': 'κ',
  '\\lambda': 'λ',
  '\\mu': 'μ',
  '\\nu': 'ν',
  '\\xi': 'ξ',
  '\\pi': 'π',
  '\\rho': 'ρ',
  '\\sigma': 'σ',
  '\\tau': 'τ',
  '\\upsilon': 'υ',
  '\\phi': 'φ',
  '\\chi': 'χ',
  '\\psi': 'ψ',
  '\\omega': 'ω',
  // 数学符号
  '\\sum': 'Σ',
  '\\prod': 'Π',
  '\\int': '∫',
  '\\oint': '∮',
  '\\infty': '∞',
  '\\partial': '∂',
  '\\nabla': '∇',
  '\\pm': '±',
  '\\mp': '∓',
  '\\times': '×',
  '\\div': '÷',
  '\\cdot': '·',
  '\\star': '⋆',
  '\\circ': '∘',
  '\\leq': '≤',
  '\\geq': '≥',
  '\\neq': '≠',
  '\\approx': '≈',
  '\\equiv': '≡',
  '\\sim': '∼',
  '\\propto': '∝',
  '\\subset': '⊂',
  '\\supset': '⊃',
  '\\in': '∈',
  '\\notin': '∉',
  '\\cap': '∩',
  '\\cup': '∪',
  '\\emptyset': '∅',
  '\\to': '→',
  '\\leftarrow': '←',
  '\\leftrightarrow': '↔',
  '\\Rightarrow': '⇒',
  '\\Leftarrow': '⇐',
  '\\Leftrightarrow': '⇔'
}

const LATEX_TEXT_COMMANDS = [
  'text',
  'mathrm',
  'mathbf',
  'mathit',
  'operatorname',
  'mathcal',
  'boldsymbol'
]

/**
 * 将 LaTeX 公式转换为兼容 PPT 字体的可读文本
 * @param latex - LaTeX 公式字符串
 * @returns 转换后的文本
 */
export function convertLatexToUnicode(latex: string): string {
  let result = latex.trim()

  // 清理不会影响语义的布局命令
  result = result.replace(/\\left|\\right|\\!/g, '')

  for (const command of LATEX_TEXT_COMMANDS) {
    result = unwrapLatexCommand(result, command)
  }

  // 优先处理结构化命令，避免后续普通符号替换破坏结构
  result = result.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, (_, numerator, denominator) => {
    return `(${normalizeFormulaFragment(numerator)})/(${normalizeFormulaFragment(denominator)})`
  })
  result = result.replace(/\\sqrt\{([^{}]+)\}/g, (_, value) => {
    return `√(${normalizeFormulaFragment(value)})`
  })

  result = replaceLatexSymbols(result)

  // 下标和上标统一转成字体更稳定的括号表示
  result = result.replace(/_\{([^}]+)\}/g, (_, value) => `(${normalizeFormulaFragment(value)})`)
  result = result.replace(/\^\{([^}]+)\}/g, (_, value) => `^(${normalizeFormulaFragment(value)})`)
  result = result.replace(/_([a-zA-Z0-9])/g, (_, value) => `(${value})`)
  result = result.replace(/\^([a-zA-Z0-9])/g, (_, value) => `^(${value})`)

  // 清理残留花括号和多余空白
  result = result.replace(/[{}]/g, '')
  result = result.replace(/\s+/g, ' ').trim()

  return result
}

/**
 * 处理文本中的 LaTeX 公式
 * @param text - 包含可能的 LaTeX 公式的文本
 * @returns 转换后的文本
 */
export function processLatexInText(text: string): string {
  let result = text

  result = result.replace(/\$\$([\s\S]+?)\$\$/g, (_, formula: string) =>
    convertLatexToUnicode(formula)
  )
  result = result.replace(/(?<!\$)\$([^$\n]+?)\$(?!\$)/g, (_, formula: string) =>
    convertLatexToUnicode(formula)
  )

  return result
}

/**
 * 展开形如 \text{...} 的文本命令
 * @param source - 原始公式
 * @param command - 命令名
 * @returns 展开后的公式
 */
function unwrapLatexCommand(source: string, command: string): string {
  const pattern = new RegExp(`\\\\${command}\\{([^{}]+)\\}`, 'g')
  return source.replace(pattern, '$1')
}

/**
 * 替换 LaTeX 符号命令
 * @param source - 原始公式
 * @returns 替换后的文本
 */
function replaceLatexSymbols(source: string): string {
  let result = source
  for (const [command, replacement] of Object.entries(LATEX_SYMBOLS)) {
    result = result.split(command).join(replacement)
  }
  return result
}

/**
 * 标准化公式片段
 * @param value - 原始片段
 * @returns 适合拼回正文的片段
 */
function normalizeFormulaFragment(value: string): string {
  return replaceLatexSymbols(value).replace(/[{}]/g, '').replace(/\s+/g, ' ').trim()
}
