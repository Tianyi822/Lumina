import { normalizePaperInlineMathForRender } from '@shared/utils/paperMarkdown'

const RAW_TABLE_MATH_PATTERN = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\$[^\n$]+?\$)/g
const RAW_TABLE_MATH_TEST_PATTERN = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\$[^\n$]+?\$)/
const RAW_TABLE_MATH_SKIP_SELECTOR = [
  'code',
  'pre',
  'math',
  'eq',
  'eqn',
  '.katex',
  '.katex-display',
  '.texmath'
].join(', ')

const RAW_CODE_INLINE_MATH_PATTERN = /\$([^\n$]+?)\$/g
const RAW_CODE_INLINE_MATH_TEST_PATTERN = /\$[^\n$]+?\$/
const RAW_CODE_INLINE_MATH_SKIP_SELECTOR = ['.katex', '.katex-display', '.texmath'].join(', ')

const TEXT_NODE_TYPE = 3

function isTextNode(node: Node): boolean {
  return node.nodeType === TEXT_NODE_TYPE
}

/** 表格单元格内将 display 公式分隔符转为行内，供 texmath 行内渲染 */
/** 将表格单元格内 display 公式分隔符（如 $$）转为行内 $，适配 texmath 行内渲染 */
export function tableMathSourceToInline(markdown: string): string {
  const trimmed = markdown.trim()
  if (trimmed.startsWith('$$') && trimmed.endsWith('$$')) {
    return `$${trimmed.slice(2, -2).trim()}$`
  }

  if (trimmed.startsWith('\\[') && trimmed.endsWith('\\]')) {
    return `$${trimmed.slice(2, -2).trim()}$`
  }

  return markdown
}

function shouldRenderRawTableMathNode(node: Node): boolean {
  const content = node.textContent || ''
  if (!RAW_TABLE_MATH_TEST_PATTERN.test(content)) {
    return false
  }

  const parent = node.parentElement
  return !!parent && !parent.closest(RAW_TABLE_MATH_SKIP_SELECTOR)
}

function renderRawTableMathNode(
  doc: Document,
  textNode: Node,
  renderInline: (content: string) => string
): void {
  const content = textNode.textContent || ''
  const parent = textNode.parentNode
  if (!parent) {
    return
  }

  const fragment = doc.createDocumentFragment()
  let cursor = 0

  for (const match of content.matchAll(RAW_TABLE_MATH_PATTERN)) {
    const matchIndex = match.index ?? 0
    const mathSource = match[0]

    if (matchIndex > cursor) {
      fragment.appendChild(doc.createTextNode(content.slice(cursor, matchIndex)))
    }

    const inlineSource = tableMathSourceToInline(mathSource)
    const template = doc.createElement('template')
    template.innerHTML = renderInline(normalizePaperInlineMathForRender(inlineSource, 'table'))
    if (template.content.childNodes.length > 0) {
      fragment.appendChild(template.content)
    } else {
      fragment.appendChild(doc.createTextNode(mathSource))
    }

    cursor = matchIndex + mathSource.length
  }

  if (cursor < content.length) {
    fragment.appendChild(doc.createTextNode(content.slice(cursor)))
  }

  parent.insertBefore(fragment, textNode)
  parent.removeChild(textNode)
}

function renderRawTableInlineMath(root: Element, renderInline: (content: string) => string): void {
  root.querySelectorAll('table').forEach((table) => {
    const textNodes: Node[] = []
    const walker = table.ownerDocument.createTreeWalker(table, NodeFilter.SHOW_TEXT)

    while (walker.nextNode()) {
      const currentNode = walker.currentNode
      if (isTextNode(currentNode) && shouldRenderRawTableMathNode(currentNode)) {
        textNodes.push(currentNode)
      }
    }

    textNodes.forEach((textNode) => {
      renderRawTableMathNode(table.ownerDocument, textNode, renderInline)
    })
  })
}

/** 将表格内块级 KaTeX 降级为行内布局，避免 tr/td 塌缩为竖排 */
/** 将表格内的块级 KaTeX 降级为行内布局，防止 display 公式撑破 tr/td 导致竖排 */
export function normalizeTableDisplayMath(root: Element): void {
  root.querySelectorAll('table .katex-display').forEach((display) => {
    const element = display as HTMLElement
    element.classList.add('paper-katex-table-inline')
    element.style.display = 'inline-block'
    element.style.margin = '0'
    element.style.padding = '0'
    element.style.maxWidth = '100%'
    element.style.verticalAlign = 'middle'
    element.style.textAlign = 'initial'
  })
}

function renderRawCodeBlockInlineMath(
  root: Element,
  renderInline: (content: string) => string
): void {
  root.querySelectorAll('pre code').forEach((codeBlock) => {
    const textNodes: Node[] = []
    const walker = codeBlock.ownerDocument.createTreeWalker(codeBlock, NodeFilter.SHOW_TEXT)

    while (walker.nextNode()) {
      const currentNode = walker.currentNode
      if (
        isTextNode(currentNode) &&
        RAW_CODE_INLINE_MATH_TEST_PATTERN.test(currentNode.textContent || '')
      ) {
        const parent = currentNode.parentElement
        if (parent && !parent.closest(RAW_CODE_INLINE_MATH_SKIP_SELECTOR)) {
          textNodes.push(currentNode)
        }
      }
    }

    textNodes.forEach((textNode) => {
      const content = textNode.textContent || ''
      const parent = textNode.parentNode
      if (!parent) return

      const doc = codeBlock.ownerDocument
      const fragment = doc.createDocumentFragment()
      let cursor = 0

      for (const match of content.matchAll(RAW_CODE_INLINE_MATH_PATTERN)) {
        const matchIndex = match.index ?? 0
        const mathSource = match[0]

        if (matchIndex > cursor) {
          fragment.appendChild(doc.createTextNode(content.slice(cursor, matchIndex)))
        }

        const template = doc.createElement('template')
        template.innerHTML = renderInline(
          normalizePaperInlineMathForRender(mathSource, 'paragraph')
        )
        if (template.content.childNodes.length > 0) {
          fragment.appendChild(template.content)
        } else {
          fragment.appendChild(doc.createTextNode(mathSource))
        }

        cursor = matchIndex + mathSource.length
      }

      if (cursor < content.length) {
        fragment.appendChild(doc.createTextNode(content.slice(cursor)))
      }

      parent.insertBefore(fragment, textNode)
      parent.removeChild(textNode)
    })
  })
}

/** 兼容浏览器 DOMParser（body > div）与 linkedom parseHTML（documentElement 即 div） */
function getHtmlPostProcessRoot(document: Document): Element | null {
  const body = document.body
  if (body?.firstElementChild?.tagName === 'DIV') {
    return body.firstElementChild
  }

  const documentElement = document.documentElement
  if (documentElement?.tagName === 'DIV') {
    return documentElement
  }

  return documentElement ?? null
}

/** linkedom 解析片段时可能在容器内插入空的 head/body，需移除以免污染输出 */
function stripSpuriousDocumentSectionNodes(root: Element): void {
  root.querySelectorAll(':scope > head, :scope > body').forEach((node) => {
    node.remove()
  })
}

/** 对渲染后的 HTML 执行后处理：移除分隔线、渲染表格内公式、包装表格容器等 */
export function postProcessRenderedHtml(
  html: string,
  renderInline: (content: string) => string,
  headingId?: string
): string {
  if (typeof DOMParser === 'undefined') {
    return html
  }

  const parser = new DOMParser()
  const document = parser.parseFromString(`<div>${html}</div>`, 'text/html')
  const root = getHtmlPostProcessRoot(document)
  if (!root) {
    return html
  }

  stripSpuriousDocumentSectionNodes(root)

  root.querySelectorAll('hr').forEach((separator) => {
    separator.remove()
  })

  if (headingId) {
    const heading = root.querySelector('h1, h2, h3, h4, h5, h6')
    if (heading) {
      heading.id = headingId
    }
  }

  renderRawTableInlineMath(root, renderInline)
  normalizeTableDisplayMath(root)
  renderRawCodeBlockInlineMath(root, renderInline)

  root.querySelectorAll('table').forEach((table) => {
    if (table.parentElement?.classList.contains('paper-markdown-view__table-wrap')) {
      return
    }

    const wrap = document.createElement('div')
    wrap.className = 'paper-markdown-view__table-wrap'
    table.parentNode?.insertBefore(wrap, table)
    wrap.appendChild(table)
  })

  return root.innerHTML
}
