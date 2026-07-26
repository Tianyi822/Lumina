import { Extension, InputRule } from '@tiptap/core'
import type { InputRuleMatch, Range } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import type { EditorState } from '@tiptap/pm/state'

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

const RULE_DEFINITIONS: RuleDefinition[] = [
  {
    expression: /^(#{1,6}) $/,
    match: (result) => ({ kind: 'heading', level: result[1].length })
  },
  {
    expression: /^> $/,
    match: () => ({ kind: 'blockquote' })
  },
  {
    expression: /^- \[([ xX])\] $/,
    match: (result) => ({ kind: 'taskList', checked: result[1].toLowerCase() === 'x' })
  },
  {
    expression: /^(?:[-+*]) $/,
    match: () => ({ kind: 'bulletList' })
  },
  {
    expression: /^(\d+)\. $/,
    match: (result) => ({ kind: 'orderedList', start: Number(result[1]) })
  },
  {
    expression: /^```([a-zA-Z0-9_+-]*)$/,
    match: (result) => ({ kind: 'codeBlock', language: result[1] || null })
  },
  {
    expression: /^(?:---|\*\*\*|___)$/,
    match: () => ({ kind: 'horizontalRule' })
  },
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
    expression: /\$([^$\n]+)\$$/,
    match: (result) => ({ kind: 'inlineMath', content: result[1] })
  }
]

export function matchWriterMarkdownRule(textBeforeCursor: string): WriterMarkdownMatch | null {
  for (const definition of RULE_DEFINITIONS) {
    const result = textBeforeCursor.match(definition.expression)
    if (result) return definition.match(result)
  }
  return null
}

export function shouldApplyWriterInputRule(context: WriterInputRuleContext): boolean {
  if (context.composing || context.eventIsComposing) return false
  return matchWriterMarkdownRule(context.textBeforeCursor) !== null
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

    return RULE_DEFINITIONS.map(
      (definition) =>
        new InputRule({
          find: createRuleFinder(definition.expression, definition.match, isComposing),
          handler: ({ state, range, match, chain }) => {
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
              return
            }

            const command = chain().deleteRange(range)
            if (writerMatch.kind === 'heading') {
              command.setHeading({ level: writerMatch.level as 1 | 2 | 3 | 4 | 5 | 6 }).run()
            } else if (writerMatch.kind === 'blockquote') {
              command.toggleBlockquote().run()
            } else if (writerMatch.kind === 'bulletList') {
              command.toggleBulletList().run()
            } else if (writerMatch.kind === 'orderedList') {
              command
                .toggleOrderedList()
                .updateAttributes('orderedList', { start: writerMatch.start })
                .run()
            } else if (writerMatch.kind === 'taskList') {
              command
                .toggleTaskList()
                .updateAttributes('taskItem', { checked: writerMatch.checked })
                .run()
            } else if (writerMatch.kind === 'codeBlock') {
              command.setCodeBlock({ language: writerMatch.language ?? '' }).run()
            } else if (writerMatch.kind === 'horizontalRule') {
              command.setHorizontalRule().run()
            }
            return
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
