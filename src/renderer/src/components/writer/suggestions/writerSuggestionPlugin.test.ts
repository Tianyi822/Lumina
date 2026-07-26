import assert from 'node:assert/strict'
import test from 'node:test'
import { parseHTML } from 'linkedom'
import { getSchema } from '@tiptap/core'
import { EditorState, TextSelection } from '@tiptap/pm/state'
import type { Decoration } from '@tiptap/pm/view'
import type { WriterAiProposal } from '@shared/types/writer'
import { hashWriterText } from '@shared/utils/writerText'
import { createWriterExtensions } from '../extensions/createWriterExtensions'
import { useWriterSuggestionStore } from '@renderer/stores/writer/writerSuggestionStore'
import {
  buildPluginDecorationsForTest,
  createWriterSuggestionExtension
} from './writerSuggestionPlugin'

const { window: testWindow } = parseHTML('<html><head></head><body></body></html>')
for (const [name, value] of Object.entries({
  window: testWindow,
  document: testWindow.document,
  HTMLElement: testWindow.HTMLElement
})) {
  Object.defineProperty(globalThis, name, { configurable: true, value })
}

const suggestionDoc = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      attrs: { nodeId: 'p1' },
      content: [{ type: 'text', text: '正文内容' }]
    }
  ]
} as const

type DecorationWithWidgetType = Decoration & {
  type?: {
    toDOM?: (view?: unknown) => Node
    spec?: { key?: string }
  }
}

function getWidgetDom(decoration: Decoration): HTMLElement | null {
  const type = (decoration as DecorationWithWidgetType).type
  const node = type?.toDOM?.()
  return node instanceof HTMLElement ? node : null
}

function getWidgetKey(decoration: Decoration): string | undefined {
  return (decoration as DecorationWithWidgetType).type?.spec?.key
}

function createSuggestionState(selection?: { from: number; to: number }): EditorState {
  const schema = getSchema([
    ...createWriterExtensions('writer-doc-pending'),
    createWriterSuggestionExtension()
  ])
  let state = EditorState.create({
    schema,
    doc: schema.nodeFromJSON(suggestionDoc)
  })
  if (selection) {
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, selection.from, selection.to))
    )
  }
  return state
}

test('pending 状态在选区渲染 loading decoration', () => {
  useWriterSuggestionStore.getState().reset()
  const state = createSuggestionState({ from: 2, to: 6 })
  useWriterSuggestionStore.getState().beginRequest('writer-doc-pending', 1, 'continue', 6)
  const decorations = buildPluginDecorationsForTest(state)
  assert.notEqual(decorations.find().length, 0)
  const widget = decorations.find()[0]
  assert.ok(widget)
  assert.equal(widget.from, 6)
  const element = getWidgetDom(widget)
  assert.ok(element)
  assert.equal(element.className, 'sm-writer-diff-pending')
  assert.match(element.textContent ?? '', /AI 正在续写/)
  useWriterSuggestionStore.getState().reset()
})

test('pending 骨架锚定在请求时选区，不随后续点击移动', () => {
  useWriterSuggestionStore.getState().reset()
  const state = createSuggestionState({ from: 2, to: 6 })
  useWriterSuggestionStore.getState().beginRequest('writer-doc-pending', 1, 'continue', 6)
  const stateMoved = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, 2, 3))
  )
  const decorations = buildPluginDecorationsForTest(stateMoved)
  const widget = decorations.find()[0]
  assert.ok(widget)
  assert.equal(widget.from, 6)
  useWriterSuggestionStore.getState().reset()
})

test('insert_blocks 预览按块拆分而非 join 拼接', () => {
  useWriterSuggestionStore.getState().reset()
  const state = createSuggestionState()
  const proposal: WriterAiProposal = {
    proposalId: 'proposal-blocks',
    documentId: 'writer-doc-pending',
    baseRevision: 1,
    createdAt: new Date().toISOString(),
    anchor: {
      documentId: 'writer-doc-pending',
      baseRevision: 1,
      scope: 'selection',
      startBlockId: 'p1',
      endBlockId: 'p1',
      startOffset: 0,
      endOffset: 4,
      expectedTextHash: hashWriterText('正文内容')
    },
    operations: [
      {
        kind: 'insert_blocks',
        afterBlockId: 'p1',
        blocks: [
          { nodeId: 'new-1', type: 'paragraph', text: '第一段' },
          { nodeId: 'new-2', type: 'heading', text: '标题', level: 2 }
        ]
      }
    ]
  }
  useWriterSuggestionStore.getState().beginRequest(proposal.documentId, proposal.baseRevision)
  assert.equal(
    useWriterSuggestionStore
      .getState()
      .ingestProposal(proposal, proposal.documentId, 1, state),
    true
  )
  const decorations = buildPluginDecorationsForTest(state)
  const found = decorations.find()
  assert.ok(found.length > 0)
  const widget = found.find((item) => getWidgetKey(item)?.startsWith('insert-blocks-'))
  assert.ok(widget)
  const element = getWidgetDom(widget)
  assert.ok(element)
  const blocks = element.querySelectorAll('.sm-writer-diff-add-block')
  assert.equal(blocks.length, 2)
  assert.equal(blocks[0]?.textContent, '第一段')
  assert.equal(blocks[1]?.getAttribute('data-block-type'), 'heading')
  assert.ok(element.querySelector('.sm-writer-diff-toolbar'))
  assert.ok(element.querySelector('[aria-label="全部接受建议"]'))
  useWriterSuggestionStore.getState().reset()
})
