import test from 'node:test'
import assert from 'node:assert/strict'
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import {
  buildCanonicalTextIndex,
  getCanonicalOffsetForDomPoint,
  resolveCanonicalTextPoint,
  trimCanonicalTextRange
} from './paperCanonicalTextIndex.ts'

function createTextNode(text) {
  return {
    nodeType: 3,
    textContent: text,
    childNodes: [],
    parentNode: null
  }
}

function createElement(tagName, attrs = {}, children = []) {
  const element = {
    nodeType: 1,
    tagName: tagName.toUpperCase(),
    attrs,
    childNodes: children,
    parentNode: null,
    matches(selector) {
      if (selector === '.katex') {
        return String(attrs.class || '')
          .split(/\s+/)
          .includes('katex')
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
  }

  return element
}

function createKatexElement(tex, duplicateText) {
  return createElement('span', { class: 'katex' }, [
    createElement('span', { class: 'katex-mathml' }, [
      createElement('math', {}, [
        createElement('semantics', {}, [
          createElement('annotation', { encoding: 'application/x-tex' }, [createTextNode(tex)])
        ])
      ])
    ]),
    createElement('span', { class: 'katex-html' }, [createTextNode(duplicateText)])
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

test('canonical text range 会同步修剪选区首尾空白', () => {
  assert.deepEqual(trimCanonicalTextRange('  A random square crop  ', 0, 24), {
    startOffset: 2,
    endOffset: 22
  })
})
