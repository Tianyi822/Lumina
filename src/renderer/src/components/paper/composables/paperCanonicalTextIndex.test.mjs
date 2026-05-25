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
import {
  clearSelectedFormulas,
  markSelectedFormulas,
  normalizeCanonicalSelectionRange
} from './paperDragSelectionSync.ts'

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
  const classes = new Set(
    String(attrs.class || '')
      .split(/\s+/)
      .filter(Boolean)
  )

  function hasClass(className) {
    return classes.has(className)
  }

  const element = {
    nodeType: 1,
    tagName: tagName.toUpperCase(),
    attrs,
    childNodes: children,
    parentNode: null,
    parentElement: null,
    classList: {
      add(cls) {
        classes.add(cls)
      },
      remove(cls) {
        classes.delete(cls)
      },
      contains(cls) {
        return classes.has(cls)
      }
    },
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
    },
    querySelectorAll(selector) {
      const results = []
      const classMatch = selector.match(/^\.([\w-]+)$/)
      if (classMatch && element.classList.contains(classMatch[1])) {
        results.push(element)
      }
      for (const child of children) {
        if (child.nodeType !== 1 || typeof child.querySelectorAll !== 'function') {
          continue
        }
        results.push(...child.querySelectorAll(selector))
      }
      return results
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

function createKatexDisplayElement(tex, duplicateText, options = {}) {
  return createElement('span', { class: 'katex-display' }, [
    createKatexElement(tex, duplicateText, options)
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

test('canonical text index 只把 display KaTeX wrapper 计入一次', () => {
  const displayMath = createKatexDisplayElement(
    'P ^ {\\mathrm {source}} = \\left\\{ x \\right\\}',
    'duplicate visual text',
    {
      htmlRects: [createRect(16, 20, 260, 42)]
    }
  )
  const root = createElement('div', {}, [
    createTextNode('Before '),
    displayMath,
    createTextNode(' after.')
  ])
  const index = buildCanonicalTextIndex(root)
  const mathStartOffset = index.text.indexOf('$P')
  const rect = getCanonicalRangeClientRect(index, mathStartOffset + 1, mathStartOffset + 8)

  assert.equal(index.text, 'Before $P ^ {\\mathrm {source}} = \\left\\{ x \\right\\}$ after.')
  assert.equal(index.segments.filter((segment) => segment.kind === 'display_math').length, 1)
  assert.equal(index.segments.filter((segment) => segment.kind === 'math').length, 0)
  assert.deepEqual(rect, createRect(16, 20, 260, 42))
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

test('canonical text range 会跳过段首段尾不可见格式字符', () => {
  assert.deepEqual(trimCanonicalTextRange('\u200b其中 H_k 和 \ufeff', 0, 11), {
    startOffset: 1,
    endOffset: 9
  })
  assert.deepEqual(trimCanonicalTextRange('\u2066\u034f其中\u2069', 0, 5), {
    startOffset: 2,
    endOffset: 4
  })
})

test('markSelectedFormulas 标记被完整覆盖的行内公式', () => {
  const math = createKatexElement('t_{v}', 'tvt_{v}tv\u200b')
  const mathHtml = math.querySelector('.katex-html')
  const root = createElement('div', {}, [createTextNode('函数 '), math, createTextNode('。')])
  const index = buildCanonicalTextIndex(root)
  markSelectedFormulas(root, index, 0, index.text.length)
  assert.equal(math.classList.contains('katex--selected'), false)
  assert.equal(mathHtml.classList.contains('katex--selected'), true)
})

test('段首隐藏字符不会阻止跨公式选区标记完整行内公式', () => {
  const math = createKatexElement('H_k^{high}', 'H high visual')
  const mathHtml = math.querySelector('.katex-html')
  const root = createElement('div', {}, [
    createTextNode('\u200b其中 '),
    math,
    createTextNode(' 和后续文字')
  ])
  const index = buildCanonicalTextIndex(root)
  const mathSegment = index.segments.find((segment) => segment.kind === 'math')
  assert.ok(mathSegment)
  const trimmedRange = trimCanonicalTextRange(index.text, 0, mathSegment.endOffset)
  assert.deepEqual(trimmedRange, {
    startOffset: 1,
    endOffset: mathSegment.endOffset
  })

  markSelectedFormulas(root, index, trimmedRange.startOffset, trimmedRange.endOffset)
  assert.equal(math.classList.contains('katex--selected'), false)
  assert.equal(mathHtml.classList.contains('katex--selected'), true)
})

test('段首隐藏字符导致选区起点落到首个可见字后时会回退一个字', () => {
  const root = createElement('div', {}, [createTextNode('\u200b这里，后续文字')])
  const index = buildCanonicalTextIndex(root)

  const normalizedRange = normalizeCanonicalSelectionRange(index, {
    startOffset: 2,
    endOffset: index.text.length
  })

  assert.deepEqual(normalizedRange, {
    startOffset: 1,
    endOffset: index.text.length
  })

  const trimmedRange = trimCanonicalTextRange(
    index.text,
    normalizedRange.startOffset,
    normalizedRange.endOffset
  )
  assert.deepEqual(trimmedRange, {
    startOffset: 1,
    endOffset: index.text.length
  })
})

test('普通段首选区不会被额外回退', () => {
  const root = createElement('div', {}, [createTextNode('这里，后续文字')])
  const index = buildCanonicalTextIndex(root)

  const normalizedRange = normalizeCanonicalSelectionRange(index, {
    startOffset: 1,
    endOffset: index.text.length
  })

  assert.deepEqual(normalizedRange, {
    startOffset: 1,
    endOffset: index.text.length
  })
})

test('markSelectedFormulas 不标记仅被部分覆盖的公式', () => {
  const math = createKatexElement('t_{v}', 'tvt_{v}tv\u200b')
  const root = createElement('div', {}, [createTextNode('函数 '), math, createTextNode('。')])
  const index = buildCanonicalTextIndex(root)
  const mathStartOffset = index.text.indexOf('$t_{v}$')
  // 选区从公式前开始，但结束在公式内部（未覆盖完整公式）
  markSelectedFormulas(root, index, 0, mathStartOffset + 2)
  assert.equal(math.classList.contains('katex--selected'), false)
})

test('markSelectedFormulas 对 display 公式只标记 katex-html', () => {
  const displayMath = createKatexDisplayElement('\\sigma', 'sigma')
  const innerMath = displayMath.childNodes[0]
  const mathHtml = displayMath.querySelector('.katex-html')
  const root = createElement('div', {}, [displayMath])
  const index = buildCanonicalTextIndex(root)
  markSelectedFormulas(root, index, 0, index.text.length)
  assert.equal(displayMath.classList.contains('katex--selected'), false)
  assert.equal(innerMath.classList.contains('katex--selected'), false)
  assert.equal(mathHtml.classList.contains('katex--selected'), true)
})

test('clearSelectedFormulas 清除所有公式选中标记', () => {
  const math1 = createKatexElement('a', 'a')
  const math2 = createKatexElement('b', 'b')
  const mathHtml1 = math1.querySelector('.katex-html')
  const mathHtml2 = math2.querySelector('.katex-html')
  const root = createElement('div', {}, [math1, math2])
  mathHtml1.classList.add('katex--selected')
  mathHtml2.classList.add('katex--selected')
  clearSelectedFormulas(root)
  assert.equal(mathHtml1.classList.contains('katex--selected'), false)
  assert.equal(mathHtml2.classList.contains('katex--selected'), false)
})
