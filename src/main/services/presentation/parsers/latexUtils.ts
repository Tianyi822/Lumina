/**
 * LaTeX 公式转换工具
 * 将简单的 LaTeX 公式转换为 Unicode 表示
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
  '\\sum': '∑',
  '\\prod': '∏',
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

const SUBSCRIPT_CHARS: Record<string, string> = {
  '0': '₀',
  '1': '₁',
  '2': '₂',
  '3': '₃',
  '4': '₄',
  '5': '₅',
  '6': '₆',
  '7': '₇',
  '8': '₈',
  '9': '₉',
  a: 'ₐ',
  e: 'ₑ',
  h: 'ₕ',
  i: 'ᵢ',
  j: 'ⱼ',
  k: 'ₖ',
  l: 'ₗ',
  m: 'ₘ',
  n: 'ₙ',
  o: 'ₒ',
  p: 'ₚ',
  r: 'ᵣ',
  s: 'ₛ',
  t: 'ₜ',
  u: 'ᵤ',
  v: 'ᵥ',
  x: 'ₓ',
  '+': '₊',
  '-': '₋',
  '=': '₌',
  '(': '₍',
  ')': '₎'
}

const SUPERSCRIPT_CHARS: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  a: 'ᵃ',
  b: 'ᵇ',
  c: 'ᶜ',
  d: 'ᵈ',
  e: 'ᵉ',
  f: 'ᶠ',
  g: 'ᵍ',
  h: 'ʰ',
  i: 'ⁱ',
  j: 'ʲ',
  k: 'ᵏ',
  l: 'ˡ',
  m: 'ᵐ',
  n: 'ⁿ',
  o: 'ᵒ',
  p: 'ᵖ',
  r: 'ʳ',
  s: 'ˢ',
  t: 'ᵗ',
  u: 'ᵘ',
  v: 'ᵛ',
  x: 'ˣ',
  '+': '⁺',
  '-': '⁻',
  '=': '⁼',
  '(': '⁽',
  ')': '⁾'
}

/**
 * 将 LaTeX 公式转换为 Unicode 表示
 * @param latex - LaTeX 公式字符串
 * @returns Unicode 表示的公式
 */
export function convertLatexToUnicode(latex: string): string {
  let result = latex.trim()

  // 清理布局控制命令，避免残留不可见标记
  result = result.replace(/\\left|\\right|\\!/g, '')
  result = result.replace(/\\text\{([^}]+)\}/g, '$1')

  for (const [command, unicode] of Object.entries(LATEX_SYMBOLS)) {
    result = result.split(command).join(unicode)
  }

  // 先处理花括号形式，再处理单字符形式
  result = result.replace(/_\{([^}]+)\}/g, (_, value: string) => `₍${toSubscriptText(value)}₎`)
  result = result.replace(/\^\{([^}]+)\}/g, (_, value: string) => `⁽${toSuperscriptText(value)}⁾`)
  result = result.replace(/_([a-zA-Z0-9+\-=()])/g, (_, value: string) => toSubscriptText(value))
  result = result.replace(/\^([a-zA-Z0-9+\-=()])/g, (_, value: string) => toSuperscriptText(value))

  // 清理剩余花括号，保留内容本身
  result = result.replace(/[{}]/g, '')

  return result
}

/**
 * 处理文本中的 LaTeX 公式
 * @param text - 包含可能的 LaTeX 公式的文本
 * @returns 转换后的文本
 */
export function processLatexInText(text: string): string {
  let result = text

  // 先处理块级公式，避免被行内公式规则截断
  result = result.replace(/\$\$([\s\S]+?)\$\$/g, (_, formula: string) =>
    convertLatexToUnicode(formula)
  )
  result = result.replace(/(?<!\$)\$([^$\n]+?)\$(?!\$)/g, (_, formula: string) =>
    convertLatexToUnicode(formula)
  )

  return result
}

/**
 * 将文本转换为下标字符
 * @param value - 原始文本
 * @returns 下标文本
 */
function toSubscriptText(value: string): string {
  return [...value].map((char) => SUBSCRIPT_CHARS[char] || char).join('')
}

/**
 * 将文本转换为上标字符
 * @param value - 原始文本
 * @returns 上标文本
 */
function toSuperscriptText(value: string): string {
  return [...value].map((char) => SUPERSCRIPT_CHARS[char] || char).join('')
}
