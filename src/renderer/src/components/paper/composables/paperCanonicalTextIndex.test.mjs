import test from 'node:test'
import assert from 'node:assert/strict'
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import {
  buildCanonicalTextIndex,
  getCanonicalRangeClientRect,
  getCanonicalRangeOffsets,
  getCanonicalOffsetForDomPoint,
  resolveCanonicalTextPoint,
  trimCanonicalTextRange
} from './paperCanonicalTextIndex.ts'

function createRect(left, top, width, height) {
  return {
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height
  }
}

function createTextNode(text) {
  return {
    nodeType: 3,
    textContent: text,
    childNodes: [],
    parentNode: null,
    parentElement: null
  }
}

function createElement(tagName, attrs = {}, children = []) {
  function hasClass(className) {
    return String(attrs.class || '')
      .split(/\s+/)
      .includes(className)
  }

  const element = {
    nodeType: 1,
    tagName: tagName.toUpperCase(),
    attrs,
    childNodes: children,
    parentNode: null,
    parentElement: null,
    matches(selector) {
      if (selector === '.katex') {
        return hasClass('katex')
      }
      if (selector.startsWith('.')) {
        return hasClass(selector.slice(1))
      }
      return false
    },
    querySelector(selector) {
      if (
        selector === 'annotation[encoding="application/x-tex"]' &&
        tagName === 'annotation' &&
        attrs.encoding === 'application/x-tex'
      ) {
        return element
      }
      if (selector.startsWith('.') && element.matches(selector)) {
        return element
      }

      for (const child of children) {
        if (child.nodeType !== 1 || typeof child.querySelector !== 'function') {
          continue
        }
        const found = child.querySelector(selector)
        if (found) {
          return found
        }
      }

      return null
    },
    getBoundingClientRect() {
      return attrs.rect || createRect(0, 0, 0, 0)
    },
    getClientRects() {
      return attrs.rects || (attrs.rect ? [attrs.rect] : [])
    },
    contains(node) {
      if (node === element) {
        return true
      }

      return children.some((child) => {
        if (child === node) {
          return true
        }
        return child.nodeType === 1 && typeof child.contains === 'function'
          ? child.contains(node)
          : false
      })
    }
  }

  Object.defineProperty(element, 'textContent', {
    get() {
      return children.map((child) => child.textContent || '').join('')
    }
  })

  for (const child of children) {
    child.parentNode = element
    child.parentElement = element
  }

  return element
}

function createKatexElement(tex, duplicateText, options = {}) {
  const htmlText = createTextNode(duplicateText)
  const html = createElement('span', { class: 'katex-html', rects: options.htmlRects }, [htmlText])
  return createElement('span', { class: 'katex' }, [
    createElement('span', { class: 'katex-mathml' }, [
      createElement('math', {}, [
        createElement('semantics', {}, [
          createElement('annotation', { encoding: 'application/x-tex' }, [createTextNode(tex)])
        ])
      ])
    ]),
    html
  ])
}

test('canonical text index 只把 KaTeX 公式计入一次', () => {
  const tail = createTextNode(
    '。训练中使用的唯一数据增强方法是从调整尺寸后的图像中随机裁剪正方形区域。'
  )
  const root = createElement('div', {}, [
    createTextNode('函数 '),
    createKatexElement('t_{u}', 'tut_{u}tu\u200b'),
    createTextNode(' 和 '),
    createKatexElement('t_{v}', 'tvt_{v}tv\u200b'),
    tail
  ])

  const index = buildCanonicalTextIndex(root)
  const selectedText = '训练中使用的唯一数据增强方法是从调整尺寸后的图像中随机裁剪正方形区域。'
  const expectedText = `函数 $t_{u}$ 和 $t_{v}$。${selectedText}`
  const selectedStartOffset = expectedText.indexOf(selectedText)
  const domTailOffset = tail.textContent.indexOf(selectedText)

  assert.equal(index.text, expectedText)
  assert.equal(
    getCanonicalOffsetForDomPoint(index, tail, domTailOffset, 'start'),
    selectedStartOffset
  )
})

test('canonical text point 会把公式内部偏移扩展到完整公式节点', () => {
  const math = createKatexElement('t_{v}', 'tvt_{v}tv\u200b')
  const root = createElement('div', {}, [createTextNode('函数 '), math, createTextNode('。')])
  const index = buildCanonicalTextIndex(root)
  const mathStartOffset = index.text.indexOf('$t_{v}$')

  const startPoint = resolveCanonicalTextPoint(index, mathStartOffset + 2, 'start')
  const endPoint = resolveCanonicalTextPoint(index, mathStartOffset + 2, 'end')

  assert.deepEqual(startPoint, { node: root, offset: 1 })
  assert.deepEqual(endPoint, { node: root, offset: 2 })
})

test('canonical range 会把 display 公式内部选区扩展为完整 LaTeX', () => {
  const math = createKatexElement(
    '\\begin{array}{l} \\sigma_l = \\sqrt{E(I^2) - \\mu_l^2} \\end{array}',
    'sigma visual text'
  )
  const root = createElement('div', {}, [createTextNode('Since '), math, createTextNode('.')])
  const index = buildCanonicalTextIndex(root)
  const htmlText = math.childNodes[1].childNodes[0]
  const offsets = getCanonicalRangeOffsets(index, {
    startContainer: htmlText,
    startOffset: 2,
    endContainer: htmlText,
    endOffset: 8
  })

  assert.ok(offsets)
  assert.equal(
    index.text.slice(offsets.startOffset, offsets.endOffset),
    '$\\begin{array}{l} \\sigma_l = \\sqrt{E(I^2) - \\mu_l^2} \\end{array}$'
  )
})

test('canonical range rect 对公式使用可见 KaTeX HTML 的矩形', () => {
  const math = createKatexElement('\\sigma_l = \\sqrt{E(I^2) - \\mu_l^2}', 'sigma visual text', {
    htmlRects: [createRect(120, 40, 160, 28), createRect(90, 76, 240, 30)]
  })
  const root = createElement('div', {}, [createTextNode('Since '), math, createTextNode('.')])
  const index = buildCanonicalTextIndex(root)
  const mathStartOffset = index.text.indexOf('$\\sigma_l')
  const rect = getCanonicalRangeClientRect(index, mathStartOffset + 3, mathStartOffset + 10, {
    getBoundingClientRect() {
      return createRect(0, 0, 1, 1)
    }
  })

  assert.deepEqual(rect, createRect(90, 40, 240, 66))
})

test('canonical range rect 对普通文本保留原生 range 矩形', () => {
  const text = createTextNode('A random square crop')
  const root = createElement('div', {}, [text])
  const index = buildCanonicalTextIndex(root)
  const nativeRect = createRect(24, 36, 128, 18)
  const rect = getCanonicalRangeClientRect(index, 2, 8, {
    getBoundingClientRect() {
      return nativeRect
    }
  })

  assert.deepEqual(rect, nativeRect)
})

test('canonical text range 会同步修剪选区首尾空白', () => {
  assert.deepEqual(trimCanonicalTextRange('  A random square crop  ', 0, 24), {
    startOffset: 2,
    endOffset: 22
  })
})
