import assert from 'node:assert/strict'
import test from 'node:test'
import { Editor, getSchema } from '@tiptap/core'
import type { JSONContent } from '@tiptap/core'
import { createWriterExtensions } from './createWriterExtensions'

function createTableDocument(rows: number, cols: number): JSONContent {
  return {
    type: 'doc',
    content: [
      {
        type: 'table',
        content: Array.from({ length: rows }, () => ({
          type: 'tableRow',
          content: Array.from({ length: cols }, () => ({
            type: 'tableCell',
            content: [{ type: 'paragraph' }]
          }))
        }))
      }
    ]
  }
}

function createTableEditor(content: JSONContent): Editor {
  return new Editor({
    element: null,
    content,
    extensions: createWriterExtensions()
  })
}

test('表格未注册合并/拆分单元格命令', () => {
  const editor = createTableEditor(createTableDocument(2, 2))

  assert.equal(typeof editor.commands.mergeCells, 'undefined')
  assert.equal(typeof editor.commands.splitCell, 'undefined')
  assert.equal(typeof editor.commands.mergeOrSplit, 'undefined')

  editor.destroy()
})

test('单元格 Schema 拒绝嵌套表格', () => {
  const schema = getSchema(createWriterExtensions())
  const nestedTableDocument: JSONContent = {
    type: 'doc',
    content: [
      {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                content: [
                  {
                    type: 'table',
                    content: [
                      {
                        type: 'tableRow',
                        content: [{ type: 'tableCell', content: [{ type: 'paragraph' }] }]
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  }

  assert.throws(() => schema.nodeFromJSON(nestedTableDocument).check())
})

test('删除唯一一列会删除整张表，不留下非法空表', () => {
  const editor = createTableEditor(createTableDocument(2, 1))
  // doc(0) table(0) tableRow(1) tableCell(2) paragraph(3)
  editor.commands.setTextSelection(3)

  const deleted = editor.commands.deleteColumn()

  assert.equal(deleted, true)
  assert.equal(
    editor.getJSON().content?.some((node) => node.type === 'table'),
    false
  )

  editor.destroy()
})

test('删除唯一一行会删除整张表，不留下非法空表', () => {
  const editor = createTableEditor(createTableDocument(1, 2))
  editor.commands.setTextSelection(3)

  const deleted = editor.commands.deleteRow()

  assert.equal(deleted, true)
  assert.equal(
    editor.getJSON().content?.some((node) => node.type === 'table'),
    false
  )

  editor.destroy()
})

test('多列时删除一列只移除该列，表格仍然存在', () => {
  const editor = createTableEditor(createTableDocument(2, 2))
  editor.commands.setTextSelection(3)

  const deleted = editor.commands.deleteColumn()

  assert.equal(deleted, true)
  const json = editor.getJSON() as JSONContent
  const table = json.content?.find((node) => node.type === 'table')
  assert.ok(table)
  assert.equal(table?.content?.[0]?.content?.length, 1)

  editor.destroy()
})

test('多行时删除一行只移除该行，表格仍然存在', () => {
  const editor = createTableEditor(createTableDocument(2, 2))
  editor.commands.setTextSelection(3)

  const deleted = editor.commands.deleteRow()

  assert.equal(deleted, true)
  const json = editor.getJSON() as JSONContent
  const table = json.content?.find((node) => node.type === 'table')
  assert.ok(table)
  assert.equal(table?.content?.length, 1)

  editor.destroy()
})
