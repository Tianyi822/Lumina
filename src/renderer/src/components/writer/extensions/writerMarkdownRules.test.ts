import assert from 'node:assert/strict'
import test from 'node:test'
import {
  matchWriterMarkdownRule,
  nextWriterCompositionState,
  shouldApplyWriterInputRule
} from './writerMarkdownRules'

test('IME composition 期间不执行 Markdown 转换', () => {
  assert.equal(shouldApplyWriterInputRule({ composing: true, textBeforeCursor: '# ' }), false)
  assert.equal(shouldApplyWriterInputRule({ composing: false, textBeforeCursor: '# ' }), true)
  assert.equal(
    shouldApplyWriterInputRule({
      composing: false,
      eventIsComposing: true,
      textBeforeCursor: '# '
    }),
    false
  )
})

test('compositionend 之后保持保护直到延迟释放', () => {
  assert.equal(nextWriterCompositionState(false, 'compositionstart'), true)
  assert.equal(nextWriterCompositionState(true, 'compositionend'), true)
  assert.equal(nextWriterCompositionState(true, 'release'), false)
})

test('标题规则只识别一级到六级标题', () => {
  for (let level = 1; level <= 6; level += 1) {
    assert.deepEqual(matchWriterMarkdownRule(`${'#'.repeat(level)} `), {
      kind: 'heading',
      level
    })
  }

  assert.equal(matchWriterMarkdownRule('####### '), null)
})

test('识别引用、无序列表、有序列表和任务列表', () => {
  assert.deepEqual(matchWriterMarkdownRule('> '), { kind: 'blockquote' })
  assert.deepEqual(matchWriterMarkdownRule('- '), { kind: 'bulletList' })
  assert.deepEqual(matchWriterMarkdownRule('1. '), { kind: 'orderedList', start: 1 })
  assert.deepEqual(matchWriterMarkdownRule('12. '), { kind: 'orderedList', start: 12 })
  assert.deepEqual(matchWriterMarkdownRule('- [ ] '), {
    kind: 'taskList',
    checked: false
  })
  assert.deepEqual(matchWriterMarkdownRule('- [x] '), {
    kind: 'taskList',
    checked: true
  })
})

test('识别代码围栏和分隔线', () => {
  assert.deepEqual(matchWriterMarkdownRule('```'), { kind: 'codeBlock', language: null })
  assert.deepEqual(matchWriterMarkdownRule('```ts'), {
    kind: 'codeBlock',
    language: 'ts'
  })
  assert.deepEqual(matchWriterMarkdownRule('---'), { kind: 'horizontalRule' })
})

test('识别粗体、斜体、删除线和行内公式', () => {
  assert.deepEqual(matchWriterMarkdownRule('前 **粗体**'), {
    kind: 'bold',
    content: '粗体'
  })
  assert.deepEqual(matchWriterMarkdownRule('前 *斜体*'), {
    kind: 'italic',
    content: '斜体'
  })
  assert.deepEqual(matchWriterMarkdownRule('前 ~~删除~~'), {
    kind: 'strike',
    content: '删除'
  })
  assert.deepEqual(matchWriterMarkdownRule('前 $x^2 + y^2$'), {
    kind: 'inlineMath',
    content: 'x^2 + y^2'
  })
})

test('独占一行的双美元符号识别为块公式', () => {
  assert.deepEqual(matchWriterMarkdownRule('$$\\int_0^1 x dx$$'), {
    kind: 'blockMath',
    content: '\\int_0^1 x dx'
  })
  assert.notDeepEqual(matchWriterMarkdownRule('前 $$x$$'), {
    kind: 'blockMath',
    content: 'x'
  })
})
