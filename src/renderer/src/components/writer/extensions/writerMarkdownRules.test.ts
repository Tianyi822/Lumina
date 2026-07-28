import assert from 'node:assert/strict'
import test from 'node:test'
import { getSchema } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { EditorState, TextSelection } from '@tiptap/pm/state'
import type { Schema } from '@tiptap/pm/model'
import {
  getWriterBlockConversionTarget,
  matchWriterBlockRule,
  matchWriterInstantRule,
  matchWriterMarkdownRule,
  nextWriterCompositionState,
  shouldApplyWriterInputRule
} from './writerMarkdownRules'

// ---------------------------------------------------------------------------
// 无 DOM 测试脚手架：基于真实扩展构造 ProseMirror Schema 与 EditorState
// ---------------------------------------------------------------------------

function createTestSchema(): Schema {
  return getSchema([
    StarterKit.configure({ heading: { levels: [1, 2, 3, 4, 5, 6] } }),
    TaskList,
    TaskItem.configure({ nested: true })
  ])
}

const testSchema = createTestSchema()

// cursorPos 为空时不显式设置选区（默认在文档开头）
function createStateWithDoc(docJson: unknown, cursorPos?: number): EditorState {
  const doc = testSchema.nodeFromJSON(docJson)
  const state = EditorState.create({ schema: testSchema, doc })
  if (cursorPos === undefined) return state
  return state.apply(state.tr.setSelection(TextSelection.create(doc, cursorPos)))
}

// 文档位置约定（两段：'# 标题' + '正文'）：
// 第一段 paragraph 占 [0, 6)，第二段 paragraph 占 [6, 10)，光标进第二段用 pos 8
const twoParagraphDoc = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: '# 标题' }] },
    { type: 'paragraph', content: [{ type: 'text', text: '正文' }] }
  ]
}

test('IME composition 期间不执行即时 Markdown 转换', () => {
  assert.equal(
    shouldApplyWriterInputRule({ composing: true, textBeforeCursor: '前 **粗体**' }),
    false
  )
  assert.equal(
    shouldApplyWriterInputRule({ composing: false, textBeforeCursor: '前 **粗体**' }),
    true
  )
  assert.equal(
    shouldApplyWriterInputRule({
      composing: false,
      eventIsComposing: true,
      textBeforeCursor: '前 **粗体**'
    }),
    false
  )
})

test('块级语法不再由输入规则即时转换', () => {
  assert.equal(shouldApplyWriterInputRule({ composing: false, textBeforeCursor: '# ' }), false)
  assert.equal(shouldApplyWriterInputRule({ composing: false, textBeforeCursor: '1. ' }), false)
  assert.equal(shouldApplyWriterInputRule({ composing: false, textBeforeCursor: '```' }), false)
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

test('下划线斜体不会抢占三下划线分隔线', () => {
  assert.deepEqual(matchWriterMarkdownRule('前 _斜体_'), {
    kind: 'italic',
    content: '斜体'
  })
  assert.deepEqual(matchWriterMarkdownRule('___'), { kind: 'horizontalRule' })
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

test('逐键输入双美元块公式时不会被行内公式抢先转换', () => {
  const typedPrefixes = ['$', '$$', '$$x', '$$x$', '$$x$$']

  assert.deepEqual(typedPrefixes.map(matchWriterMarkdownRule), [
    null,
    null,
    null,
    null,
    { kind: 'blockMath', content: 'x' }
  ])
})

test('块级规则前缀匹配：触发符加内容也能命中', () => {
  assert.deepEqual(matchWriterBlockRule('### 报告'), { kind: 'heading', level: 3 })
  assert.deepEqual(matchWriterBlockRule('> 引用内容'), { kind: 'blockquote' })
  assert.deepEqual(matchWriterBlockRule('- 项目'), { kind: 'bulletList' })
  assert.deepEqual(matchWriterBlockRule('+ 项目'), { kind: 'bulletList' })
  assert.deepEqual(matchWriterBlockRule('12. 项目'), { kind: 'orderedList', start: 12 })
  assert.deepEqual(matchWriterBlockRule('- [x] 买菜'), { kind: 'taskList', checked: true })
  assert.deepEqual(matchWriterBlockRule('```python'), { kind: 'codeBlock', language: 'python' })
  assert.deepEqual(matchWriterBlockRule('---'), { kind: 'horizontalRule' })
})

test('块级规则只输入触发符也命中，非行首与越界不命中', () => {
  assert.deepEqual(matchWriterBlockRule('# '), { kind: 'heading', level: 1 })
  assert.deepEqual(matchWriterBlockRule('####### 越界'), null)
  assert.equal(matchWriterBlockRule('正文 # 不是行首'), null)
  assert.equal(matchWriterBlockRule('普通文本'), null)
  assert.equal(matchWriterBlockRule(''), null)
})

test('即时规则只匹配闭合符触发的行内语法', () => {
  assert.deepEqual(matchWriterInstantRule('前 **粗体**'), { kind: 'bold', content: '粗体' })
  assert.equal(matchWriterInstantRule('# '), null)
  assert.equal(matchWriterInstantRule('---'), null)
})

test('光标未离开块时不产生转换目标', () => {
  const state = createStateWithDoc(twoParagraphDoc, 2)
  assert.equal(getWriterBlockConversionTarget(0, state), null)
})

test('光标离开后返回旧块位置与文本', () => {
  const state = createStateWithDoc(twoParagraphDoc, 8)
  assert.deepEqual(getWriterBlockConversionTarget(0, state), { from: 0, text: '# 标题' })
})

test('prevBlockFrom 为空或越界时不产生转换目标', () => {
  const state = createStateWithDoc(twoParagraphDoc, 8)
  assert.equal(getWriterBlockConversionTarget(null, state), null)
  assert.equal(getWriterBlockConversionTarget(999, state), null)
})

test('旧块已不是 paragraph 时不产生转换目标', () => {
  const headingDoc = {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '标题' }] },
      { type: 'paragraph', content: [{ type: 'text', text: '正文' }] }
    ]
  }
  const state = createStateWithDoc(headingDoc, 6)
  assert.equal(getWriterBlockConversionTarget(0, state), null)
})
