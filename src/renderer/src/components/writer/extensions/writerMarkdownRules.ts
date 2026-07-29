import { Extension, InputRule } from '@tiptap/core'
import type { InputRuleMatch, Range } from '@tiptap/core'
import { wrapIn } from '@tiptap/pm/commands'
import { wrapInList } from '@tiptap/pm/schema-list'
import { Plugin, Selection, TextSelection } from '@tiptap/pm/state'
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

// 删除触发前缀后，在选区移入目标块的中间 state 上执行 ProseMirror 命令，
// 把产生的步骤重放到以 state 为基准的 tr 上（中间 state 与最终 tr 文档一致，步骤位置兼容）
function replayCommandOnBlock(
  state: EditorState,
  blockFrom: number,
  prefixLength: number,
  command: (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean
): Transaction | null {
  const intermediateTr = state.tr.delete(blockFrom + 1, blockFrom + 1 + prefixLength)
  // 选区必须绑定删除前缀后的当前文档，否则 setSelection 会因文档不一致抛错
  intermediateTr.setSelection(TextSelection.create(intermediateTr.doc, blockFrom + 1))
  const intermediateState = state.apply(intermediateTr)
  const holder: { tr: Transaction | null } = { tr: null }
  const applied = command(intermediateState, (produced) => {
    holder.tr = produced
  })
  const producedTr = holder.tr
  if (!applied || !producedTr) return null

  const tr = state.tr
  tr.delete(blockFrom + 1, blockFrom + 1 + prefixLength)
  for (const step of producedTr.steps) tr.step(step)
  return tr
}

// 在 tr 文档中定位 blockFrom 附近的目标节点并合并写入属性（如有序列表起始编号、任务勾选态）
function setListAttributeNearBlock(
  tr: Transaction,
  blockFrom: number,
  nodeName: 'orderedList' | 'taskItem',
  attributes: Record<string, unknown>
): void {
  const mappedFrom = tr.mapping.map(blockFrom)
  let nodePos: number | null = null
  tr.doc.nodesBetween(mappedFrom, mappedFrom + 1, (node, pos) => {
    if (nodePos === null && node.type.name === nodeName) {
      nodePos = pos
      return false
    }
    return true
  })
  if (nodePos === null) return
  const node = tr.doc.nodeAt(nodePos)
  if (!node) return
  tr.setNodeMarkup(nodePos, undefined, { ...node.attrs, ...attributes })
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

  if (match.kind === 'blockquote') {
    const tr = replayCommandOnBlock(state, blockFrom, 2, wrapIn(state.schema.nodes.blockquote))
    if (!tr) return null
    restoreSelectionAfterConversion(tr, selectionFrom)
    return tr
  }

  if (match.kind === 'bulletList') {
    const tr = replayCommandOnBlock(state, blockFrom, 2, wrapInList(state.schema.nodes.bulletList))
    if (!tr) return null
    restoreSelectionAfterConversion(tr, selectionFrom)
    return tr
  }

  if (match.kind === 'orderedList') {
    const tr = replayCommandOnBlock(
      state,
      blockFrom,
      String(match.start).length + 2,
      wrapInList(state.schema.nodes.orderedList)
    )
    if (!tr) return null
    setListAttributeNearBlock(tr, blockFrom, 'orderedList', { start: match.start })
    restoreSelectionAfterConversion(tr, selectionFrom)
    return tr
  }

  if (match.kind === 'taskList') {
    const tr = replayCommandOnBlock(state, blockFrom, 6, wrapInList(state.schema.nodes.taskList))
    if (!tr) return null
    setListAttributeNearBlock(tr, blockFrom, 'taskItem', { checked: match.checked })
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

// ---------------------------------------------------------------------------
// 延迟块级转换：离块决策（供插件与测试使用）
// ---------------------------------------------------------------------------

// 转换事务的 meta 键：插件据此跳过自身派发的事务，防止重入
const WRITER_DEFERRED_CONVERSION_META = 'writerDeferredMarkdownConversion'

export interface WriterDeferredConversionDecision {
  nextPrevBlockFrom: number | null
  transaction: Transaction | null
}

// 单步决策：光标离开旧块且旧块文本命中块级规则时产出转换事务（带防重入 meta）
export function decideWriterDeferredConversion(
  prevBlockFrom: number | null,
  state: EditorState,
  composing: boolean
): WriterDeferredConversionDecision {
  const nextPrevBlockFrom = getSelectionTextblockFrom(state)
  if (composing) return { nextPrevBlockFrom, transaction: null }

  const target = getWriterBlockConversionTarget(prevBlockFrom, state)
  if (!target) return { nextPrevBlockFrom, transaction: null }

  const match = matchWriterBlockRule(target.text)
  if (!match) return { nextPrevBlockFrom, transaction: null }

  const transaction = buildWriterBlockConversion(state, target.from, match)
  if (!transaction) return { nextPrevBlockFrom, transaction: null }
  transaction.setMeta(WRITER_DEFERRED_CONVERSION_META, true)
  return { nextPrevBlockFrom, transaction }
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
    // 光标上一个所在 textblock 的起点；null 表示尚未初始化
    let prevBlockFrom: number | null = null
    const isComposing = (): boolean => this.editor.view.composing || this.storage.eventIsComposing
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
      }),
      // 离块检测：光标离开 paragraph 块时，对命中块级规则的旧块同步派发转换事务
      new Plugin({
        appendTransaction: (transactions, _oldState, newState) => {
          if (prevBlockFrom !== null) {
            for (const tr of transactions) {
              prevBlockFrom = tr.mapping.map(prevBlockFrom)
            }
          }
          // 自身派发的转换事务不参与检测，防止重入
          if (transactions.some((tr) => tr.getMeta(WRITER_DEFERRED_CONVERSION_META))) {
            return null
          }
          const decision = decideWriterDeferredConversion(prevBlockFrom, newState, isComposing())
          prevBlockFrom = decision.nextPrevBlockFrom
          return decision.transaction
        }
      })
    ]
  }
})
