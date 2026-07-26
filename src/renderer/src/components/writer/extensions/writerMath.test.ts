import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createBlockMathJson,
  normalizeWriterCodeLanguage,
  renderWriterMath
} from './writerMath'
import { createWriterExtensions } from './createWriterExtensions'

interface LowlightUnderTest {
  highlight: (language: string, value: string) => unknown
  listLanguages: () => string[]
}

function getWriterLowlight(): LowlightUnderTest {
  const codeBlock = createWriterExtensions().find((extension) => extension.name === 'codeBlock')
  const lowlight = codeBlock?.options.lowlight
  if (!lowlight || typeof lowlight !== 'object') throw new Error('未注册 Writer Lowlight')
  if (!('highlight' in lowlight) || !('listLanguages' in lowlight)) {
    throw new Error('Writer Lowlight 接口不完整')
  }
  if (typeof lowlight.highlight !== 'function' || typeof lowlight.listLanguages !== 'function') {
    throw new Error('Writer Lowlight 接口无效')
  }
  return lowlight as LowlightUnderTest
}

test('有效 LaTeX 使用 KaTeX 生成 HTML 与 MathML', () => {
  const result = renderWriterMath('E = mc^2', true)

  assert.equal(result.success, true)
  assert.equal(result.latex, 'E = mc^2')
  assert.match(result.html, /katex-display/)
  assert.match(result.html, /<math/)
})

test('无效 LaTeX 保留源码并返回错误，不删除节点', () => {
  const result = renderWriterMath('\\frac{', true)

  assert.equal(result.success, false)
  assert.equal(result.latex, '\\frac{')
  assert.ok(result.error)
  assert.equal(result.html, '')
})

test('公式节点 JSON 只保存 LaTeX 和稳定 ID', () => {
  const json = createBlockMathJson('E = mc^2', 'math-1')

  assert.deepEqual(json, {
    type: 'blockMath',
    attrs: { latex: 'E = mc^2', nodeId: 'math-1' }
  })
})

test('代码语言仅接受写作工作区允许的 highlighter', () => {
  assert.equal(normalizeWriterCodeLanguage('typescript'), 'typescript')
  assert.equal(normalizeWriterCodeLanguage('cpp'), 'cpp')
  assert.equal(normalizeWriterCodeLanguage('sql'), null)
  assert.equal(normalizeWriterCodeLanguage(''), null)
})

test('Lowlight 只注册允许语言且不会为 SQL 执行高亮', () => {
  const lowlight = getWriterLowlight()

  assert.deepEqual(lowlight.listLanguages().sort(), [
    'bash',
    'c',
    'cpp',
    'css',
    'go',
    'java',
    'javascript',
    'json',
    'markdown',
    'python',
    'rust',
    'typescript',
    'xml'
  ])
  assert.doesNotThrow(() => lowlight.highlight('typescript', 'const answer: number = 42'))
  assert.throws(() => lowlight.highlight('sql', 'SELECT 1'))
})
