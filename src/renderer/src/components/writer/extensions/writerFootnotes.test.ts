import assert from 'node:assert/strict'
import test from 'node:test'
import { Editor } from '@tiptap/core'
import type { WriterJsonDocument } from '@shared/types/writer'
import { createWriterExtensions } from './createWriterExtensions'
import {
  deriveFootnoteNumbers,
  deriveFootnoteReferenceCounts,
  isFootnoteReferenced,
  selectNearestFootnoteReference
} from './writerFootnotes'

function createFootnoteDocument(referenceIds: string[]): WriterJsonDocument {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: referenceIds.map((footnoteId) => ({
          type: 'footnoteReference',
          attrs: { footnoteId }
        }))
      }
    ]
  }
}

test('脚注编号按引用首次出现顺序派生', () => {
  const numbers = deriveFootnoteNumbers(createFootnoteDocument(['note-b', 'note-a', 'note-b']))
  assert.equal(numbers.get('note-b'), 1)
  assert.equal(numbers.get('note-a'), 2)
})

test('同一脚注被多次引用只占用一个编号', () => {
  const numbers = deriveFootnoteNumbers(createFootnoteDocument(['note-a', 'note-a', 'note-a']))
  assert.equal(numbers.size, 1)
  assert.equal(numbers.get('note-a'), 1)
})

test('没有引用的文档不产生任何编号', () => {
  const numbers = deriveFootnoteNumbers({ type: 'doc', content: [{ type: 'paragraph' }] })
  assert.equal(numbers.size, 0)
})

test('引用次数统计用于判断脚注定义是否仍被引用', () => {
  const document = createFootnoteDocument(['note-a', 'note-a'])
  assert.equal(deriveFootnoteReferenceCounts(document).get('note-a'), 2)
  assert.equal(isFootnoteReferenced(document, 'note-a'), true)
  assert.equal(isFootnoteReferenced(document, 'note-b'), false)
})

test('删除最后一个引用后定义仍保留内容，且不再被视为已引用', () => {
  const beforeDelete = createFootnoteDocument(['note-a'])
  assert.equal(isFootnoteReferenced(beforeDelete, 'note-a'), true)

  const afterDeletingReference: WriterJsonDocument = {
    type: 'doc',
    content: [
      { type: 'paragraph' },
      {
        type: 'footnoteDefinition',
        attrs: { footnoteId: 'note-a' },
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '定义内容仍在' }] }]
      }
    ]
  }
  assert.equal(isFootnoteReferenced(afterDeletingReference, 'note-a'), false)
  assert.equal(
    afterDeletingReference.content?.[1]?.content?.[0]?.content?.[0]?.text,
    '定义内容仍在'
  )
})

test('点击定义跳回定义之前最近一次出现的引用', () => {
  assert.equal(selectNearestFootnoteReference([5, 20, 40], 30), 20)
  assert.equal(selectNearestFootnoteReference([5, 20, 40], 3), 5)
  assert.equal(selectNearestFootnoteReference([], 30), undefined)
  assert.equal(selectNearestFootnoteReference([10], undefined), 10)
})

test('插入脚注命令生成共享同一 footnoteId 的引用与定义', () => {
  const editor = new Editor({
    element: null,
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
    extensions: createWriterExtensions()
  })
  editor.commands.setTextSelection(1)

  const inserted = editor.commands.insertFootnote()
  assert.equal(inserted, true)

  const json = editor.getJSON() as WriterJsonDocument
  const reference = json.content
    ?.find((node) => node.type === 'paragraph')
    ?.content?.find((node) => node.type === 'footnoteReference')
  const definition = json.content?.find((node) => node.type === 'footnoteDefinition')

  assert.ok(reference?.attrs?.footnoteId)
  assert.equal(reference?.attrs?.footnoteId, definition?.attrs?.footnoteId)
  assert.equal(deriveFootnoteNumbers(json).get(reference?.attrs?.footnoteId as string), 1)

  editor.destroy()
})
