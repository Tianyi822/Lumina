import { trimTextBoundaryRange } from '@shared/utils/textBoundary'

export interface CanonicalTextBoundary {
  node: Node
  offset: number
}

export interface CanonicalTextSegment {
  kind: 'text' | 'math' | 'display_math'
  text: string
  startOffset: number
  endOffset: number
  startBoundary: CanonicalTextBoundary
  endBoundary: CanonicalTextBoundary
  sourceNode: Node
}

export interface CanonicalTextIndex {
  root: Element
  text: string
  segments: CanonicalTextSegment[]
}

export interface CanonicalTextClientRect {
  x: number
  y: number
  width: number
  height: number
  top: number
  right: number
  bottom: number
  left: number
}

export type CanonicalTextPointAffinity = 'start' | 'end'

const ELEMENT_NODE = 1
const TEXT_NODE = 3

function isElementNode(node: Node): node is Element {
  return node.nodeType === ELEMENT_NODE
}

function isTextNode(node: Node): node is Text {
  return node.nodeType === TEXT_NODE
}

function getNodeText(node: Node): string {
  return node.textContent || ''
}

function getNodeIndex(node: Node): number {
  const parent = node.parentNode
  if (!parent) {
    return 0
  }

  return Array.prototype.indexOf.call(parent.childNodes, node)
}

function matchesElement(element: Element, selector: string): boolean {
  return typeof element.matches === 'function' && element.matches(selector)
}

function queryElement(element: Element, selector: string): Element | null {
  return typeof element.querySelector === 'function' ? element.querySelector(selector) : null
}

function containsNode(parent: Node, child: Node): boolean {
  if (parent === child) {
    return true
  }

  if (typeof (parent as Node & { contains?: (node: Node) => boolean }).contains === 'function') {
    return (parent as Node & { contains: (node: Node) => boolean }).contains(child)
  }

  let current: Node | null = child.parentNode
  while (current) {
    if (current === parent) {
      return true
    }
    current = current.parentNode
  }

  return false
}

function readKatexTex(element: Element): string {
  const annotation = queryElement(element, 'annotation[encoding="application/x-tex"]')
  const tex = annotation?.textContent?.trim()
  if (tex) {
    return `$${tex}$`
  }

  return element.textContent || ''
}

function getElementBoundary(element: Element, edge: 'before' | 'after'): CanonicalTextBoundary {
  const parent = element.parentNode
  if (!parent) {
    return {
      node: element,
      offset: edge === 'before' ? 0 : element.childNodes.length
    }
  }

  const index = getNodeIndex(element)
  return {
    node: parent,
    offset: edge === 'before' ? index : index + 1
  }
}

function clampOffset(offset: number, length: number): number {
  return Math.max(0, Math.min(length, offset))
}

function isFiniteRect(rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>): boolean {
  return [rect.left, rect.top, rect.width, rect.height].every((value) => Number.isFinite(value))
}

function normalizeClientRect(
  rect: Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom' | 'width' | 'height'>
): CanonicalTextClientRect | null {
  if (!isFiniteRect(rect) || rect.width <= 0 || rect.height <= 0) {
    return null
  }

  const left = rect.left
  const top = rect.top
  const width = rect.width
  const height = rect.height
  const right = Number.isFinite(rect.right) ? rect.right : left + width
  const bottom = Number.isFinite(rect.bottom) ? rect.bottom : top + height

  return {
    x: left,
    y: top,
    left,
    top,
    right,
    bottom,
    width,
    height
  }
}

function unionClientRects(rects: CanonicalTextClientRect[]): CanonicalTextClientRect | null {
  if (rects.length === 0) {
    return null
  }

  const left = Math.min(...rects.map((rect) => rect.left))
  const top = Math.min(...rects.map((rect) => rect.top))
  const right = Math.max(...rects.map((rect) => rect.right))
  const bottom = Math.max(...rects.map((rect) => rect.bottom))

  return {
    x: left,
    y: top,
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top
  }
}

function getElementClientRects(element: Element): CanonicalTextClientRect[] {
  const rects =
    typeof element.getClientRects === 'function'
      ? Array.from(element.getClientRects())
      : typeof element.getBoundingClientRect === 'function'
        ? [element.getBoundingClientRect()]
        : []

  return rects
    .map((rect) => normalizeClientRect(rect))
    .filter((rect): rect is CanonicalTextClientRect => rect !== null)
}

function getMathVisibleElement(element: Element): Element {
  return queryElement(element, '.katex-html') || element
}

/** 在规范文本索引中查找包含指定节点的数学公式段 */
export function findCanonicalMathSegmentByNode(
  index: CanonicalTextIndex,
  node: Node
): CanonicalTextSegment | null {
  return (
    index.segments.find((segment) => {
      return (
        (segment.kind === 'math' || segment.kind === 'display_math') &&
        containsNode(segment.sourceNode, node)
      )
    }) || null
  )
}

function appendSegment(
  segments: CanonicalTextSegment[],
  textParts: string[],
  segment: Omit<CanonicalTextSegment, 'startOffset' | 'endOffset'>
): void {
  if (!segment.text) {
    return
  }

  const startOffset = textParts.join('').length
  const endOffset = startOffset + segment.text.length
  textParts.push(segment.text)
  segments.push({
    ...segment,
    startOffset,
    endOffset
  })
}

/** 构建 DOM 子树的规范文本索引（含纯文本段和 KaTeX 数学公式段） */
export function buildCanonicalTextIndex(root: Element): CanonicalTextIndex {
  const textParts: string[] = []
  const segments: CanonicalTextSegment[] = []

  function walk(node: Node): void {
    // 先检查居中公式容器（.katex-display > .katex 结构，walk 自上而下会先遇到 .katex-display）
    if (isElementNode(node) && matchesElement(node, '.katex-display')) {
      appendSegment(segments, textParts, {
        kind: 'display_math',
        text: readKatexTex(node),
        startBoundary: getElementBoundary(node, 'before'),
        endBoundary: getElementBoundary(node, 'after'),
        sourceNode: node
      })
      return
    }

    // 行内公式
    if (isElementNode(node) && matchesElement(node, '.katex')) {
      appendSegment(segments, textParts, {
        kind: 'math',
        text: readKatexTex(node),
        startBoundary: getElementBoundary(node, 'before'),
        endBoundary: getElementBoundary(node, 'after'),
        sourceNode: node
      })
      return
    }

    if (isTextNode(node)) {
      const text = getNodeText(node)
      appendSegment(segments, textParts, {
        kind: 'text',
        text,
        startBoundary: {
          node,
          offset: 0
        },
        endBoundary: {
          node,
          offset: text.length
        },
        sourceNode: node
      })
      return
    }

    Array.from(node.childNodes).forEach(walk)
  }

  walk(root)

  return {
    root,
    text: textParts.join(''),
    segments
  }
}

/** 将规范文本的绝对偏移量解析为 DOM 边界点（节点+偏移量） */
export function resolveCanonicalTextPoint(
  index: CanonicalTextIndex,
  absoluteOffset: number,
  affinity: CanonicalTextPointAffinity
): CanonicalTextBoundary | null {
  if (index.segments.length === 0) {
    return null
  }

  const offset = clampOffset(absoluteOffset, index.text.length)

  for (const segment of index.segments) {
    if (offset < segment.startOffset || offset > segment.endOffset) {
      continue
    }

    if (affinity === 'start' && offset === segment.endOffset && offset < index.text.length) {
      continue
    }

    if (segment.kind === 'math' || segment.kind === 'display_math') {
      if (offset <= segment.startOffset) {
        return segment.startBoundary
      }

      if (offset >= segment.endOffset) {
        return segment.endBoundary
      }

      return affinity === 'end' ? segment.endBoundary : segment.startBoundary
    }

    return {
      node: segment.sourceNode,
      offset: clampOffset(offset - segment.startOffset, segment.text.length)
    }
  }

  const lastSegment = index.segments[index.segments.length - 1]
  return offset <= 0 ? index.segments[0].startBoundary : lastSegment.endBoundary
}

function findSegmentContainingNode(
  index: CanonicalTextIndex,
  node: Node
): CanonicalTextSegment | null {
  return findCanonicalMathSegmentByNode(index, node)
}

function getCanonicalOffsetForElementPoint(
  index: CanonicalTextIndex,
  container: Element,
  offset: number
): number {
  const childNodes = Array.from(container.childNodes)
  const targetChild = childNodes[offset] || null

  if (!targetChild) {
    const containedSegments = index.segments.filter((segment) => {
      return containsNode(container, segment.sourceNode)
    })
    return containedSegments.length > 0
      ? containedSegments[containedSegments.length - 1].endOffset
      : index.text.length
  }

  const nextSegment = index.segments.find((segment) => {
    return containsNode(targetChild, segment.sourceNode) || segment.sourceNode === targetChild
  })

  return nextSegment?.startOffset ?? index.text.length
}

export function getCanonicalOffsetForDomPoint(
  index: CanonicalTextIndex,
  container: Node,
  offset: number,
  affinity: CanonicalTextPointAffinity
): number | null {
  const mathSegment = findSegmentContainingNode(index, container)
  if (mathSegment) {
    return affinity === 'end' ? mathSegment.endOffset : mathSegment.startOffset
  }

  if (isTextNode(container)) {
    const textSegment = index.segments.find((segment) => segment.sourceNode === container)
    if (textSegment) {
      return textSegment.startOffset + clampOffset(offset, textSegment.text.length)
    }

    const parentElement = container.parentElement
    if (parentElement && index.root.contains(parentElement)) {
      return getCanonicalOffsetForElementPoint(index, parentElement, getNodeIndex(container))
    }

    return null
  }

  if (isElementNode(container)) {
    return getCanonicalOffsetForElementPoint(index, container, offset)
  }

  return null
}

export function getCanonicalRangeOffsets(
  index: CanonicalTextIndex,
  range: Range
): { startOffset: number; endOffset: number } | null {
  const startOffset = getCanonicalOffsetForDomPoint(
    index,
    range.startContainer,
    range.startOffset,
    'start'
  )
  const endOffset = getCanonicalOffsetForDomPoint(index, range.endContainer, range.endOffset, 'end')

  if (startOffset === null || endOffset === null) {
    return null
  }

  return {
    startOffset: Math.min(startOffset, endOffset),
    endOffset: Math.max(startOffset, endOffset)
  }
}

/** 获取规范文本区间对应的客户端包围矩形，支持 KaTeX 公式的特殊处理 */
export function getCanonicalRangeClientRect(
  index: CanonicalTextIndex,
  startOffset: number,
  endOffset: number,
  fallbackRange?: Pick<Range, 'getBoundingClientRect'>
): CanonicalTextClientRect | null {
  const nextStartOffset = clampOffset(Math.min(startOffset, endOffset), index.text.length)
  const nextEndOffset = clampOffset(Math.max(startOffset, endOffset), index.text.length)
  if (nextStartOffset >= nextEndOffset) {
    return null
  }

  const selectedSegments = index.segments.filter((segment) => {
    return segment.endOffset > nextStartOffset && segment.startOffset < nextEndOffset
  })
  const mathRects = selectedSegments.flatMap((segment) => {
    if (
      (segment.kind !== 'math' && segment.kind !== 'display_math') ||
      !isElementNode(segment.sourceNode)
    ) {
      return []
    }

    return getElementClientRects(getMathVisibleElement(segment.sourceNode))
  })

  const fallbackRect =
    fallbackRange && typeof fallbackRange.getBoundingClientRect === 'function'
      ? normalizeClientRect(fallbackRange.getBoundingClientRect())
      : null

  if (
    selectedSegments.length > 0 &&
    selectedSegments.every((segment) => segment.kind === 'math' || segment.kind === 'display_math')
  ) {
    return unionClientRects(mathRects) || fallbackRect
  }

  return unionClientRects([...(fallbackRect ? [fallbackRect] : []), ...mathRects])
}

/** 去除规范文本区间两端的空白字符并返回裁剪后的偏移量 */
export function trimCanonicalTextRange(
  text: string,
  startOffset: number,
  endOffset: number
): { startOffset: number; endOffset: number } | null {
  return trimTextBoundaryRange(text, startOffset, endOffset)
}
