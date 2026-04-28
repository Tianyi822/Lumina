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
  constructor(tagName, className = '', children = []) {
    this.nodeType = 1
    this.tagName = tagName.toUpperCase()
    this.className = className
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

  matches(selector) {
    if (selector === 'mark.paper-annotation-highlight') {
      return (
        this.tagName === 'MARK' &&
        this.className.split(/\s+/).includes('paper-annotation-highlight')
      )
    }

    return false
  }

  closest(selector) {
    function findClosest(element) {
      if (!element) {
        return null
      }

      return element.matches(selector) ? element : findClosest(element.parentElement)
    }

    return findClosest(this)
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

test('highlight range 会跳过 Markdown 列表项周围的空白节点', () => {
  const listItemText = new FakeText('随机粘贴与上下文线索中断：')
  const listItem = new FakeElement('li', '', [listItemText])
  const orderedList = new FakeElement('ol', '', [
    new FakeText('\n'),
    listItem,
    new FakeText('\n')
  ])
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

test('highlight renderer 会移除没有文本内容的空标记', () => {
  const emptyMark = createMark([])
  const filledMark = createMark([new FakeText('ABCDE')])
  const root = new FakeElement('div', '', [emptyMark, filledMark])

  __paperHighlightRendererTestHooks.removeEmptyHighlightMarks(root)

  assert.deepEqual(root.childNodes, [filledMark])
})
