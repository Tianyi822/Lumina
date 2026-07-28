import { Extension, InputRule } from '@tiptap/core'
import type { InputRuleMatch, Range } from '@tiptap/core'
import { Plugin, Selection } from '@tiptap/pm/state'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import { normalizeWriterCodeLanguage } from './writerMath'

export type WriterMarkdownMatch =
  | { kind: 'heading'; level: number }
  | { kind: 'blockquote' }
  | { kind: 'bulletList' }
  | { kind: 'orderedList'; start: number }
  | { kind: 'taskList'; checked: boolean }
  | { kind: 'codeBlock'; language: string | null }
  | { kind: 'horizontalRule' }
  | { kind: 'bold'; content: string }
  | { kind: 'italic'; content: string }
  | { kind: 'strike'; content: string }
  | { kind: 'inlineMath'; content: string }
  | { kind: 'blockMath'; content: string }

export interface WriterInputRuleContext {
  composing: boolean
  eventIsComposing?: boolean
  textBeforeCursor: string
}

export type WriterCompositionTransition = 'compositionstart' | 'compositionend' | 'release'

interface WriterMarkdownRuleStorage {
  eventIsComposing: boolean
}

interface RuleDefinition {
  expression: RegExp
  match: (result: RegExpMatchArray) => WriterMarkdownMatch
}

// 即时规则：闭合符触发（行内语法与块公式），维持输入即转换
const INSTANT_RULE_DEFINITIONS: RuleDefinition[] = [
  {
    expression: /^\$\$([^$\n]+)\$\$$/,
    match: (result) => ({ kind: 'blockMath', content: result[1] })
  },
  {
    expression: /\*\*([^*\n]+)\*\*$/,
    match: (result) => ({ kind: 'bold', content: result[1] })
  },
  {
    expression: /~~([^~\n]+)~~$/,
    match: (result) => ({ kind: 'strike', content: result[1] })
  },
  {
    expression: /(?<!\*)\*([^*\n]+)\*$/,
    match: (result) => ({ kind: 'italic', content: result[1] })
  },
  {
    expression: /(?<!_)_([^_\n]+)_(?!_)$/,
    match: (result) => ({ kind: 'italic', content: result[1] })
  },
  {
    expression: /(?<!\$)\$([^$\n]+)\$(?!\$)$/,
    match: (result) => ({ kind: 'inlineMath', content: result[1] })
  }
]

// 延迟规则：块级语法，光标离开文本块后才转换；前缀匹配兼容「触发符 + 内容」
const DEFERRED_BLOCK_RULE_DEFINITIONS: RuleDefinition[] = [
  {
    expression: /^(#{1,6}) /,
    match: (result) => ({ kind: 'heading', level: result[1].length })
  },
  {
    expression: /^> /,
    match: () => ({ kind: 'blockquote' })
  },
  {
    expression: /^- \[([ xX])\] /,
    match: (result) => ({ kind: 'taskList', checked: result[1].toLowerCase() === 'x' })
  },
  {
    expression: /^(?:[-+*]) /,
    match: () => ({ kind: 'bulletList' })
  },
  {
    expression: /^(\d+)\. /,
    match: (result) => ({ kind: 'orderedList', start: Number(result[1]) })
  },
  {
    expression: /^```([a-zA-Z0-9_+-]*)$/,
    match: (result) => ({ kind: 'codeBlock', language: result[1] || null })
  },
  {
    expression: /^(?:---|\*\*\*|___)$/,
    match: () => ({ kind: 'horizontalRule' })
  }
]

export function matchWriterBlockRule(text: string): WriterMarkdownMatch | null {
  for (const definition of DEFERRED_BLOCK_RULE_DEFINITIONS) {
    const result = text.match(definition.expression)
    if (result) return definition.match(result)
  }
  return null
}

export function matchWriterInstantRule(text: string): WriterMarkdownMatch | null {
  for (const definition of INSTANT_RULE_DEFINITIONS) {
    const result = text.match(definition.expression)
    if (result) return definition.match(result)
  }
  return null
}

export function matchWriterMarkdownRule(textBeforeCursor: string): WriterMarkdownMatch | null {
  return matchWriterBlockRule(textBeforeCursor) ?? matchWriterInstantRule(textBeforeCursor)
}

export function shouldApplyWriterInputRule(context: WriterInputRuleContext): boolean {
  if (context.composing || context.eventIsComposing) return false
  return matchWriterInstantRule(context.textBeforeCursor) !== null
}

// ---------------------------------------------------------------------------
// 延迟块级转换：离块检测
// ---------------------------------------------------------------------------

// 光标所在 textblock 的起点位置（position before 该块）；doc 顶层无 depth 时返回 null
function getSelectionTextblockFrom(state: EditorState): number | null {
  const { $from } = state.selection
  if ($from.depth < 1) return null
  return $from.before($from.depth)
}

// 光标已离开 prevBlockFrom 指向的 paragraph 块时返回该块位置与完整文本，否则返回 null
export function getWriterBlockConversionTarget(
  prevBlockFrom: number | null,
  state: EditorState
): { from: number; text: string } | null {
  if (prevBlockFrom === null) return null
  if (prevBlockFrom < 0 || prevBlockFrom >= state.doc.content.size) return null
  if (getSelectionTextblockFrom(state) === prevBlockFrom) return null
  const prevBlock = state.doc.nodeAt(prevBlockFrom)
  if (!prevBlock || prevBlock.type.name !== 'paragraph') return null
  return { from: prevBlockFrom, text: prevBlock.textContent }
}

// ---------------------------------------------------------------------------
// 延迟块级转换：转换事务构造
// ---------------------------------------------------------------------------

// 转换完成后把选区恢复到原光标位置（经步骤映射），保证用户光标不因后台转换跳动
function restoreSelectionAfterConversion(tr: Transaction, selectionFrom: number): void {
  const mapped = Math.min(tr.mapping.map(selectionFrom), tr.doc.content.size)
  tr.setSelection(Selection.near(tr.doc.resolve(mapped)))
}

// 对 blockFrom 处的 paragraph 构造块级 Markdown 转换事务；状态不符或不支持的类型返回 null
export function buildWriterBlockConversion(
  state: EditorState,
  blockFrom: number,
  match: WriterMarkdownMatch
): Transaction | null {
  if (blockFrom < 0 || blockFrom >= state.doc.content.size) return null
  const block = state.doc.nodeAt(blockFrom)
  if (!block || block.type.name !== 'paragraph') return null
  const selectionFrom = state.selection.from

  if (match.kind === 'heading') {
    const tr = state.tr
    // 触发前缀为 level 个 '#' 加 1 个空格
    tr.delete(blockFrom + 1, blockFrom + 1 + match.level + 1)
    tr.setNodeMarkup(blockFrom, state.schema.nodes.heading, { level: match.level })
    restoreSelectionAfterConversion(tr, selectionFrom)
    return tr
  }

  if (match.kind === 'codeBlock') {
    const tr = state.tr
    // 删除围栏文本（块内全部内容），再变更节点类型并归一化语言
    tr.delete(blockFrom + 1, blockFrom + block.nodeSize - 1)
    tr.setNodeMarkup(blockFrom, state.schema.nodes.codeBlock, {
      language: normalizeWriterCodeLanguage(match.language)
    })
    restoreSelectionAfterConversion(tr, selectionFrom)
    return tr
  }

  if (match.kind === 'horizontalRule') {
    const hr = state.schema.nodes.horizontalRule.create()
    const tr = state.tr
    tr.replaceWith(blockFrom, blockFrom + block.nodeSize, hr)
    // 分割线位于文末时补一个空段落，保证其后有可编辑位置
    const hrEnd = blockFrom + hr.nodeSize
    if (hrEnd >= tr.doc.content.size) {
      tr.insert(hrEnd, state.schema.nodes.paragraph.create())
    }
    restoreSelectionAfterConversion(tr, selectionFrom)
    return tr
  }

  return null
}

export function nextWriterCompositionState(
  current: boolean,
  transition: WriterCompositionTransition
): boolean {
  if (transition === 'release') return false
  if (transition === 'compositionstart' || transition === 'compositionend') return true
  return current
}

function createRuleFinder(
  expression: RegExp,
  matchResult: (result: RegExpMatchArray) => WriterMarkdownMatch,
  isComposing: () => boolean
) {
  return (text: string): InputRuleMatch | null => {
    if (
      !shouldApplyWriterInputRule({
        composing: isComposing(),
        textBeforeCursor: text
      })
    ) {
      return null
    }

    const result = text.match(expression)
    if (!result || result.index === undefined) return null
    return {
      index: result.index,
      text: result[0],
      data: { writerMatch: matchResult(result) }
    }
  }
}

function getRuleMatch(data: Record<string, unknown> | undefined): WriterMarkdownMatch | null {
  const writerMatch = data?.writerMatch
  if (!writerMatch || typeof writerMatch !== 'object' || !('kind' in writerMatch)) return null
  return writerMatch as WriterMarkdownMatch
}

function replaceTextWithMark(
  state: EditorState,
  range: Range,
  markName: 'bold' | 'italic' | 'strike',
  content: string
): void {
  const mark = state.schema.marks[markName]
  if (!mark || !content) return
  state.tr.replaceWith(range.from, range.to, state.schema.text(content, [mark.create()]))
}

function replaceWithMath(
  state: EditorState,
  range: Range,
  nodeName: 'inlineMath' | 'blockMath',
  content: string
): void {
  const type = state.schema.nodes[nodeName]
  if (!type || !content) return

  if (nodeName === 'inlineMath') {
    state.tr.replaceWith(range.from, range.to, type.create({ latex: content }))
    return
  }

  const $from = state.doc.resolve(range.from)
  const replacesWholeTextBlock =
    $from.depth > 0 &&
    $from.parent.isTextblock &&
    range.from === $from.start() &&
    range.to === $from.end()
  if (!replacesWholeTextBlock) return
  state.tr.replaceWith($from.before(), $from.after(), type.create({ latex: content }))
}

export const WriterMarkdownRules = Extension.create<
  Record<string, never>,
  WriterMarkdownRuleStorage
>({
  name: 'writerMarkdownRules',

  addStorage() {
    return { eventIsComposing: false }
  },

  addInputRules() {
    const isComposing = (): boolean => this.editor.view.composing || this.storage.eventIsComposing

    return INSTANT_RULE_DEFINITIONS.map(
      (definition) =>
        new InputRule({
          find: createRuleFinder(definition.expression, definition.match, isComposing),
          handler: ({ state, range, match }) => {
            if (isComposing()) return
            const writerMatch = getRuleMatch(match.data)
            if (!writerMatch) return

            if (
              writerMatch.kind === 'bold' ||
              writerMatch.kind === 'italic' ||
              writerMatch.kind === 'strike'
            ) {
              replaceTextWithMark(state, range, writerMatch.kind, writerMatch.content)
              return
            }

            if (writerMatch.kind === 'inlineMath' || writerMatch.kind === 'blockMath') {
              replaceWithMath(state, range, writerMatch.kind, writerMatch.content)
            }
          }
        })
    )
  },

  addProseMirrorPlugins() {
    let releaseTimer: ReturnType<typeof setTimeout> | undefined
    return [
      new Plugin({
        view: () => ({
          destroy: () => {
            if (releaseTimer !== undefined) clearTimeout(releaseTimer)
          }
        }),
        props: {
          handleDOMEvents: {
            beforeinput: (_view, event) => {
              this.storage.eventIsComposing = 'isComposing' in event && event.isComposing === true
              return false
            },
            compositionstart: () => {
              this.storage.eventIsComposing = nextWriterCompositionState(
                this.storage.eventIsComposing,
                'compositionstart'
              )
              return false
            },
            compositionend: () => {
              this.storage.eventIsComposing = nextWriterCompositionState(
                this.storage.eventIsComposing,
                'compositionend'
              )
              releaseTimer = setTimeout(() => {
                this.storage.eventIsComposing = nextWriterCompositionState(
                  this.storage.eventIsComposing,
                  'release'
                )
              })
              return false
            }
          }
        }
      })
    ]
  }
})
