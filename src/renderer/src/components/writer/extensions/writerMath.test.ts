import assert from 'node:assert/strict'
import test from 'node:test'
import { Editor } from '@tiptap/core'
import {
  createWriterMathDraft,
  createBlockMathJson,
  normalizeWriterCodeBlockJson,
  normalizeWriterCodeLanguage,
  openWriterMathDraft,
  reconcileWriterMathDraft,
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

test('编辑公式时双击预览或选中文本不会重置草稿', () => {
  const opened = createWriterMathDraft('x')
  const edited = { ...opened, draft: 'x^2' }

  assert.deepEqual(openWriterMathDraft(edited, 'x'), edited)
})

test('公式节点被外部事务更新时关闭草稿，避免确认覆盖新源码', () => {
  const opened = { ...createWriterMathDraft('x'), draft: 'x^2' }

  assert.deepEqual(reconcileWriterMathDraft(opened, 'y'), {
    editing: false,
    draft: 'y',
    sourceLatex: 'y'
  })
})

test('导入持久化代码块时未知语言归一为 null 并保留稳定 ID', () => {
  assert.deepEqual(
    normalizeWriterCodeBlockJson({
      type: 'codeBlock',
      attrs: { language: 'sql', nodeId: 'code-1' },
      content: [{ type: 'text', text: 'SELECT 1' }]
    }),
    {
      type: 'codeBlock',
      attrs: { language: null, nodeId: 'code-1' },
      content: [{ type: 'text', text: 'SELECT 1' }]
    }
  )
})

test('Editor 初始加载持久化代码块时立即归一未知语言', () => {
  const editor = new Editor({
    element: null,
    content: {
      type: 'doc',
      content: [
        {
          type: 'codeBlock',
          attrs: { language: 'sql', nodeId: 'code-1' },
          content: [{ type: 'text', text: 'SELECT 1' }]
        }
      ]
    },
    extensions: createWriterExtensions()
  })

  assert.equal(editor.getJSON().content?.[0]?.attrs?.language, null)
  assert.equal(editor.getJSON().content?.[0]?.attrs?.nodeId, 'code-1')
  editor.destroy()
})
