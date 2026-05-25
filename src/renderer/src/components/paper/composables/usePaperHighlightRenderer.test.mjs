import test from 'node:test'
import assert from 'node:assert/strict'
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { __paperHighlightRendererTestHooks } from './usePaperHighlightRenderer.ts'

globalThis.Node = {
  ELEMENT_NODE: 1,
  TEXT_NODE: 3
}

class FakeText {
  constructor(text) {
    this.nodeType = 3
    this.textContent = text
    this.childNodes = []
    this.parentNode = null
    this.parentElement = null
  }
}

class FakeElement {
  constructor(tagName, className = '', children = [], attrs = {}) {
    this.nodeType = 1
    this.tagName = tagName.toUpperCase()
    this.className = className
    this.attrs = attrs
    this.childNodes = []
    this.parentNode = null
    this.parentElement = null
    this.ownerDocument = fakeDocument

    children.forEach((child) => this.appendChild(child))
  }

  get textContent() {
    return this.childNodes.map((child) => child.textContent || '').join('')
  }

  contains(node) {
    if (node === this) {
      return true
    }

    return this.childNodes.some((child) => {
      if (child === node) {
        return true
      }

      return child.nodeType === 1 && child.contains(node)
    })
  }

  appendChild(child) {
    child.parentNode = this
    child.parentElement = this
    if (child.nodeType === 1) {
      child.ownerDocument = this.ownerDocument
    }
    this.childNodes.push(child)
    return child
  }

  setAttribute(name, value) {
    this.attrs[name] = String(value)
    if (name === 'class') {
      this.className = String(value)
    }
  }

  getAttribute(name) {
    if (name === 'class') {
      return this.className
    }

    return this.attrs[name] ?? null
  }

  matches(selector) {
    if (selector === 'mark.paper-annotation-highlight') {
      return (
        this.tagName === 'MARK' &&
        this.className.split(/\s+/).includes('paper-annotation-highlight')
      )
    }

    if (selector === 'annotation[encoding="application/x-tex"]') {
      return this.tagName === 'ANNOTATION' && this.attrs.encoding === 'application/x-tex'
    }

    if (selector.startsWith('.')) {
      return this.className.split(/\s+/).includes(selector.slice(1))
    }

    return false
  }

  closest(selector) {
    const selectors = selector.split(',').map((item) => item.trim())

    function findClosest(element) {
      if (!element) {
        return null
      }

      return selectors.some((item) => element.matches(item))
        ? element
        : findClosest(element.parentElement)
    }

    return findClosest(this)
  }

  querySelector(selector) {
    if (this.matches(selector)) {
      return this
    }

    for (const child of this.childNodes) {
      if (child.nodeType !== 1 || typeof child.querySelector !== 'function') {
        continue
      }

      const found = child.querySelector(selector)
      if (found) {
        return found
      }
    }

    return null
  }

  querySelectorAll(selector) {
    const matches = []

    function walk(node) {
      if (node.nodeType !== 1) {
        return
      }

      if (node.matches(selector)) {
        matches.push(node)
      }

      node.childNodes.forEach(walk)
    }

    this.childNodes.forEach(walk)
    return matches
  }

  remove() {
    const parent = this.parentNode
    if (!parent) {
      return
    }

    const index = parent.childNodes.indexOf(this)
    if (index >= 0) {
      parent.childNodes.splice(index, 1)
    }
    this.parentNode = null
    this.parentElement = null
  }
}

const fakeDocument = {
  createRange() {
    return new FakeRange()
  }
}

function createMark(children = []) {
  return new FakeElement('mark', 'paper-annotation-highlight', children)
}

function createKatexElement(tex, duplicateText = 'formula visual') {
  return new FakeElement('span', 'katex', [
    new FakeElement('span', 'katex-mathml', [
      new FakeElement('math', '', [
        new FakeElement('semantics', '', [
          new FakeElement('annotation', '', [new FakeText(tex)], {
            encoding: 'application/x-tex'
          })
        ])
      ])
    ]),
    new FakeElement('span', 'katex-html', [new FakeText(duplicateText)])
  ])
}

function createKatexDisplayElement(tex, duplicateText = 'formula visual') {
  return new FakeElement('span', 'katex-display', [createKatexElement(tex, duplicateText)])
}

function createAnchor(text, selectedText) {
  const startOffset = text.indexOf(selectedText)
  assert.notEqual(startOffset, -1)
  const endOffset = startOffset + selectedText.length

  return {
    selectedText,
    prefixText: text.slice(Math.max(0, startOffset - 32), startOffset),
    suffixText: text.slice(endOffset, Math.min(text.length, endOffset + 32)),
    startOffset,
    endOffset,
    normalizedText: selectedText.replace(/\s+/g, ' ').trim()
  }
}

function createSegment(originalText = 'CHAOS-MRI to Synapse-CT') {
  return {
    renderId: 'segment-render-1',
    stableId: 'segment-stable-1',
    index: 0,
    kind: 'paragraph',
    originalMarkdown: originalText,
    originalText,
    textHash: 'hash-1',
    sourceRevisionId: 'revision-1',
    sourceRefs: {
      pageIndexes: [0],
      blockIndexes: [1]
    }
  }
}

function createAnnotation(overrides = {}) {
  const originalText = overrides.originalText || 'CHAOS-MRI to Synapse-CT'
  const originalAnchor =
    overrides.originalAnchor === null
      ? undefined
      : overrides.originalAnchor || createAnchor(originalText, 'Synapse-CT')

  return {
    id: overrides.id || 'annotation-1',
    paperId: 'paper-1',
    kind: overrides.kind || 'highlight',
    noteType: overrides.noteType || 'translation_view',
    createdInView: overrides.createdInView || 'translation',
    semanticAnchor: {
      segmentStableId: 'segment-stable-1',
      renderSegmentIdAtCreation: 'segment-render-1',
      sourceRevisionId: 'revision-1',
      segmentTextHash: 'hash-1',
      sourceRefs: {
        pageIndexes: [0],
        blockIndexes: [1]
      },
      ...(overrides.semanticAnchor || {})
    },
    originalAnchor,
    translationAnchor: overrides.translationAnchor,
    selectedTextSnapshot: overrides.selectedTextSnapshot || originalAnchor?.selectedText || '',
    contextBefore: overrides.contextBefore || originalAnchor?.prefixText || '',
    contextAfter: overrides.contextAfter || originalAnchor?.suffixText || '',
    comment: overrides.comment || '',
    colorKey: overrides.colorKey || 'blue',
    status: overrides.status || 'active',
    recoveryMeta: {
      recoveryFailureCount: 0,
      lastResolvedAt: '2026-05-06T00:00:00.000Z'
    },
    createdAt: '2026-05-06T00:00:00.000Z',
    updatedAt: '2026-05-06T00:00:00.000Z'
  }
}

function getNodeTextLength(node) {
  return node.textContent.length
}

function getOffsetInAncestor(ancestor, boundary) {
  let offset = 0
  let found = false

  function walk(node) {
    if (found) {
      return
    }

    if (node === boundary.node) {
      if (node.nodeType === 3) {
        offset += boundary.offset
      } else {
        for (let index = 0; index < boundary.offset; index += 1) {
          offset += getNodeTextLength(node.childNodes[index])
        }
      }
      found = true
      return
    }

    if (node.nodeType === 3) {
      offset += node.textContent.length
      return
    }

    node.childNodes.forEach(walk)
  }

  walk(ancestor)
  return offset
}

class FakeRange {
  setStart(node, offset) {
    this.start = { node, offset }
  }

  setEnd(node, offset) {
    this.end = { node, offset }
  }

  toString() {
    const ancestor =
      this.start.node.nodeType === 1 && this.start.offset === 0 ? this.start.node : this.end.node
    const startOffset = getOffsetInAncestor(ancestor, this.start)
    const endOffset = getOffsetInAncestor(ancestor, this.end)

    return ancestor.textContent.slice(startOffset, endOffset)
  }
}

test('highlight boundary 会在尾部子区间提升到已有标记外侧', () => {
  const noteText = new FakeText('FGHIJ')
  const noteMark = createMark([noteText])
  const root = new FakeElement('div', '', [new FakeText('ABCDE'), noteMark])

  const boundary = __paperHighlightRendererTestHooks.normalizeHighlightBoundary(root, {
    node: noteText,
    offset: noteText.textContent.length
  })

  assert.deepEqual(boundary, { node: root, offset: 2 })
})

test('original_span 标注会渲染到原文视图', () => {
  const segment = createSegment()
  const annotation = createAnnotation({
    noteType: 'original_span',
    createdInView: 'original'
  })

  const result = __paperHighlightRendererTestHooks.collectOriginalHighlights(segment, [
    annotation
  ])

  assert.equal(result.highlights.length, 1)
  assert.equal(result.highlights[0].id, annotation.id)
  assert.equal(result.highlights[0].anchor.selectedText, 'Synapse-CT')
  assert.equal(result.failedIds.length, 0)
})

test('collectOriginalHighlights 使用 semanticAnchor 判断归属并保留 canonical anchor', () => {
  const segment = createSegment('loss = $ L_{train} $ defined')
  const canonicalText = 'loss = $L_{train}$ defined'
  const annotation = createAnnotation({
    noteType: 'original_span',
    createdInView: 'original',
    originalText: canonicalText,
    originalAnchor: createAnchor(canonicalText, '$L_{train}$')
  })

  const result = __paperHighlightRendererTestHooks.collectOriginalHighlights(segment, [
    annotation
  ])

  assert.equal(result.highlights.length, 1)
  assert.equal(result.highlights[0].id, annotation.id)
  assert.equal(result.highlights[0].anchor, annotation.originalAnchor)
  assert.equal(result.highlights[0].anchor.selectedText, '$L_{train}$')
  assert.equal(result.failedIds.length, 0)
})

test('collectOriginalHighlights 跳过 segmentStableId 不匹配的标注', () => {
  const segment = createSegment()
  const annotation = createAnnotation({
    noteType: 'original_span',
    createdInView: 'original',
    semanticAnchor: {
      segmentStableId: 'other-segment'
    }
  })

  const result = __paperHighlightRendererTestHooks.collectOriginalHighlights(segment, [
    annotation
  ])

  assert.equal(result.highlights.length, 0)
  assert.equal(result.failedIds.length, 0)
})

test('active 的译文标注不会重复渲染到原文视图', () => {
  const segment = createSegment()
  const annotation = createAnnotation()

  const result = __paperHighlightRendererTestHooks.collectOriginalHighlights(segment, [
    annotation
  ])

  assert.equal(result.highlights.length, 0)
  assert.equal(result.failedIds.length, 0)
})

test('highlight boundary 会在开头子区间提升到已有标记外侧', () => {
  const noteText = new FakeText('ABCDE')
  const noteMark = createMark([noteText])
  const root = new FakeElement('div', '', [noteMark, new FakeText('FGHIJ')])

  const boundary = __paperHighlightRendererTestHooks.normalizeHighlightBoundary(root, {
    node: noteText,
    offset: 0
  })

  assert.deepEqual(boundary, { node: root, offset: 0 })
})

test('highlight boundary 会连续提升同区间嵌套标记', () => {
  const text = new FakeText('ABCDEFGHIJ')
  const innerMark = createMark([text])
  const outerMark = createMark([innerMark])
  const root = new FakeElement('div', '', [outerMark])

  const startBoundary = __paperHighlightRendererTestHooks.normalizeHighlightBoundary(root, {
    node: text,
    offset: 0
  })
  const endBoundary = __paperHighlightRendererTestHooks.normalizeHighlightBoundary(root, {
    node: text,
    offset: text.textContent.length
  })

  assert.deepEqual(startBoundary, { node: root, offset: 0 })
  assert.deepEqual(endBoundary, { node: root, offset: 1 })
})

test('highlight boundary 不会提升已有标记内部的中间选区', () => {
  const text = new FakeText('ABCDEFGHIJ')
  const noteMark = createMark([text])
  const root = new FakeElement('div', '', [noteMark])

  const boundary = __paperHighlightRendererTestHooks.normalizeHighlightBoundary(root, {
    node: text,
    offset: 4
  })

  assert.deepEqual(boundary, { node: text, offset: 4 })
})

test('highlight range 可解析公式空格不同的混合文本锚点', () => {
  const prefix = new FakeText('the loss ')
  const math = createKatexElement('L_{train}', 'LL_{train}L\u200b')
  const suffix = new FakeText(' is defined')
  const root = new FakeElement('div', '', [prefix, math, suffix])
  const anchorText = 'the loss $ L_{train} $ is defined'
  const selectedText = 'loss $ L_{train} $ is'
  const range = __paperHighlightRendererTestHooks.resolveHighlightRange(root, {
    id: 'annotation-formula-mixed',
    startOffset: anchorText.indexOf(selectedText),
    endOffset: anchorText.indexOf(selectedText) + selectedText.length,
    kind: 'highlight',
    colorKey: 'blue',
    anchor: createAnchor(anchorText, selectedText)
  })

  assert.ok(range)
  assert.deepEqual(range.startPoint, {
    node: prefix,
    offset: prefix.textContent.indexOf('loss')
  })
  assert.deepEqual(range.endPoint, { node: suffix, offset: ' is'.length })
})

test('公式整块批注会写到行内公式可见层', () => {
  const prefix = new FakeText('loss = ')
  const math = createKatexElement('L_{train}', 'LL_{train}L\u200b')
  const suffix = new FakeText(' defined')
  const root = new FakeElement('div', '', [prefix, math, suffix])
  const target = math.querySelector('.katex-html')
  const anchorText = 'loss = $L_{train}$ defined'
  const selectedText = '$L_{train}$'

  const applied = __paperHighlightRendererTestHooks.applyFormulaHighlight(root, {
    id: 'annotation-inline-formula',
    startOffset: anchorText.indexOf(selectedText),
    endOffset: anchorText.indexOf(selectedText) + selectedText.length,
    kind: 'highlight',
    colorKey: 'orange',
    anchor: createAnchor(anchorText, selectedText)
  })

  assert.equal(applied, true)
  assert.ok(target.className.split(/\s+/).includes('paper-annotation-formula-highlight'))
  assert.ok(target.className.split(/\s+/).includes('paper-annotation-highlight--highlight'))
  assert.ok(target.className.split(/\s+/).includes('paper-annotation-highlight--orange'))
  assert.equal(target.attrs['data-annotation-id'], 'annotation-inline-formula')
  assert.equal(target.attrs['data-annotation-kind'], 'highlight')
  assert.equal(target.attrs['data-color-key'], 'orange')
})

test('公式整块批注会写到块级公式内部 katex-html', () => {
  const displayMath = createKatexDisplayElement('\\sigma', 'sigma visual')
  const root = new FakeElement('div', '', [displayMath])
  const target = displayMath.querySelector('.katex-html')
  const anchorText = '$\\sigma$'

  const applied = __paperHighlightRendererTestHooks.applyFormulaHighlight(root, {
    id: 'annotation-display-formula',
    startOffset: 0,
    endOffset: anchorText.length,
    kind: 'note',
    colorKey: 'green',
    anchor: createAnchor(anchorText, anchorText)
  })

  assert.equal(applied, true)
  assert.equal(displayMath.className, 'katex-display')
  assert.ok(target.className.split(/\s+/).includes('paper-annotation-formula-highlight'))
  assert.ok(target.className.split(/\s+/).includes('paper-annotation-highlight--note'))
  assert.ok(target.className.split(/\s+/).includes('paper-annotation-highlight--green'))
  assert.equal(target.attrs['data-annotation-id'], 'annotation-display-formula')
  assert.equal(target.attrs['data-annotation-kind'], 'note')
  assert.equal(target.attrs['data-color-key'], 'green')
})

test('文本和公式混合选区不会走公式整块背景分支', () => {
  const prefix = new FakeText('the loss ')
  const math = createKatexElement('L_{train}', 'LL_{train}L\u200b')
  const suffix = new FakeText(' is defined')
  const root = new FakeElement('div', '', [prefix, math, suffix])
  const target = math.querySelector('.katex-html')
  const anchorText = 'the loss $L_{train}$ is defined'
  const selectedText = 'loss $L_{train}$ is'

  const applied = __paperHighlightRendererTestHooks.applyFormulaHighlight(root, {
    id: 'annotation-mixed-formula',
    startOffset: anchorText.indexOf(selectedText),
    endOffset: anchorText.indexOf(selectedText) + selectedText.length,
    kind: 'highlight',
    colorKey: 'blue',
    anchor: createAnchor(anchorText, selectedText)
  })

  assert.equal(applied, false)
  assert.equal(target.className, 'katex-html')
  assert.equal(target.attrs['data-annotation-id'], undefined)
})

test('highlight range 可解析正文公式空格多于 anchor 的混合文本', () => {
  const text = new FakeText('the loss $ L_{train} $ is defined')
  const root = new FakeElement('div', '', [text])
  const anchorText = 'the loss $L_{train}$ is defined'
  const selectedText = 'loss $L_{train}$ is'
  const range = __paperHighlightRendererTestHooks.resolveHighlightRange(root, {
    id: 'annotation-formula-source-space',
    startOffset: anchorText.indexOf(selectedText),
    endOffset: anchorText.indexOf(selectedText) + selectedText.length,
    kind: 'highlight',
    colorKey: 'blue',
    anchor: createAnchor(anchorText, selectedText)
  })

  assert.ok(range)
  assert.deepEqual(range.startPoint, { node: text, offset: text.textContent.indexOf('loss') })
  assert.deepEqual(range.endPoint, { node: text, offset: text.textContent.indexOf(' defined') })
})

test('collectTranslationHighlights 可解析公式空格不同的 originalAnchor', () => {
  const originalText = 'loss = $L_{train}$ defined'
  const translationText = 'loss = $ L_{train} $ defined'
  const annotation = createAnnotation({
    noteType: 'translation_view',
    createdInView: 'translation',
    originalText,
    originalAnchor: createAnchor(originalText, '$L_{train}$')
  })

  const result = __paperHighlightRendererTestHooks.collectTranslationHighlights(
    translationText,
    [annotation],
    originalText
  )

  assert.equal(result.failedIds.length, 0)
  assert.equal(result.highlights.length, 1)
  assert.equal(result.highlights[0].anchor.selectedText, '$ L_{train} $')
  assert.equal(result.highlights[0].startOffset, translationText.indexOf('$'))
  assert.equal(result.highlights[0].endOffset, translationText.indexOf(' defined'))
})

test('highlight range 会跳过 Markdown 列表项周围的空白节点', () => {
  const listItemText = new FakeText('随机粘贴与上下文线索中断：')
  const listItem = new FakeElement('li', '', [listItemText])
  const orderedList = new FakeElement('ol', '', [new FakeText('\n'), listItem, new FakeText('\n')])
  const root = new FakeElement('div', '', [new FakeText('\n'), orderedList, new FakeText('\n')])

  const selectedText = `\n${listItemText.textContent}\n`
  const range = __paperHighlightRendererTestHooks.resolveHighlightRange(root, {
    id: 'annotation-list-start',
    startOffset: 0,
    endOffset: selectedText.length,
    kind: 'highlight',
    colorKey: 'blue',
    anchor: {
      selectedText,
      prefixText: '',
      suffixText: '',
      startOffset: 1,
      endOffset: 1 + selectedText.length,
      normalizedText: listItemText.textContent
    }
  })

  assert.ok(range)
  assert.deepEqual(range.startPoint, { node: listItemText, offset: 0 })
  assert.deepEqual(range.endPoint, {
    node: listItemText,
    offset: listItemText.textContent.length
  })
})

test('highlight range 会跳过段首不可见格式字符', () => {
  const text = new FakeText('\u200b其中 H_k 和后续文字')
  const root = new FakeElement('div', '', [text])
  const selectedText = '\u200b其中'
  const range = __paperHighlightRendererTestHooks.resolveHighlightRange(root, {
    id: 'annotation-hidden-prefix',
    startOffset: 0,
    endOffset: selectedText.length,
    kind: 'highlight',
    colorKey: 'blue',
    anchor: {
      selectedText,
      prefixText: '',
      suffixText: ' H_k 和后续文字',
      startOffset: 0,
      endOffset: selectedText.length,
      normalizedText: '其中'
    }
  })

  assert.ok(range)
  assert.deepEqual(range.startPoint, { node: text, offset: 1 })
  assert.deepEqual(range.endPoint, { node: text, offset: selectedText.length })
})

test('highlight range 会把历史隐藏字符锚点恢复到当前可见文本', () => {
  const text = new FakeText('其中 H_k 和后续文字')
  const root = new FakeElement('div', '', [text])
  const range = __paperHighlightRendererTestHooks.resolveHighlightRange(root, {
    id: 'annotation-legacy-hidden-prefix',
    startOffset: 0,
    endOffset: 3,
    kind: 'highlight',
    colorKey: 'blue',
    anchor: {
      selectedText: '\u200b其中',
      prefixText: '',
      suffixText: ' H_k 和后续文字',
      startOffset: 0,
      endOffset: 3,
      normalizedText: '其中'
    }
  })

  assert.ok(range)
  assert.deepEqual(range.startPoint, { node: text, offset: 0 })
  assert.deepEqual(range.endPoint, { node: text, offset: 2 })
})

test('highlight renderer 会移除没有文本内容的空标记', () => {
  const emptyMark = createMark([])
  const filledMark = createMark([new FakeText('ABCDE')])
  const root = new FakeElement('div', '', [emptyMark, filledMark])

  __paperHighlightRendererTestHooks.removeEmptyHighlightMarks(root)

  assert.deepEqual(root.childNodes, [filledMark])
})
