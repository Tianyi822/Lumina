import assert from 'node:assert/strict'
import test from 'node:test'
import type { WriterJsonDocument } from '@shared/types/writer'
import { deriveWriterOutline } from './writerOutline'

function createHeadingDocument(): WriterJsonDocument {
  return {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 1, nodeId: 'h-1' },
        content: [{ type: 'text', text: '第一章' }]
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: '正文段落不出现在大纲中' }]
      },
      {
        type: 'heading',
        attrs: { level: 2, nodeId: 'h-2' },
        content: [{ type: 'text', text: '背景' }]
      }
    ]
  }
}

test('大纲只包含标题并保留层级与 nodeId', () => {
  const outline = deriveWriterOutline(createHeadingDocument())
  assert.deepEqual(outline, [
    { nodeId: 'h-1', level: 1, text: '第一章' },
    { nodeId: 'h-2', level: 2, text: '背景' }
  ])
})

test('标题文本按内联节点顺序拼接，不受加粗等标记影响', () => {
  const document: WriterJsonDocument = {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 3, nodeId: 'h-3' },
        content: [
          { type: 'text', text: '带' },
          { type: 'text', text: '格式', marks: [{ type: 'bold' }] },
          { type: 'text', text: '的标题' }
        ]
      }
    ]
  }

  assert.deepEqual(deriveWriterOutline(document), [
    { nodeId: 'h-3', level: 3, text: '带格式的标题' }
  ])
})

test('嵌套在引用块等容器中的标题仍会被收集，保持文档序', () => {
  const document: WriterJsonDocument = {
    type: 'doc',
    content: [
      {
        type: 'blockquote',
        content: [
          {
            type: 'heading',
            attrs: { level: 2, nodeId: 'h-nested' },
            content: [{ type: 'text', text: '引用中的标题' }]
          }
        ]
      },
      {
        type: 'heading',
        attrs: { level: 1, nodeId: 'h-top' },
        content: [{ type: 'text', text: '顶层标题' }]
      }
    ]
  }

  assert.deepEqual(deriveWriterOutline(document), [
    { nodeId: 'h-nested', level: 2, text: '引用中的标题' },
    { nodeId: 'h-top', level: 1, text: '顶层标题' }
  ])
})

test('缺少稳定 nodeId 或 level 的标题不会进入大纲', () => {
  const document: WriterJsonDocument = {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 1 },
        content: [{ type: 'text', text: '缺少 nodeId' }]
      }
    ]
  }

  assert.deepEqual(deriveWriterOutline(document), [])
})

test('空文档返回空大纲', () => {
  assert.deepEqual(deriveWriterOutline({ type: 'doc', content: [] }), [])
})
