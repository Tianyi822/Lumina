import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { WriterDocument, WriterJsonDocument } from '@shared/types/writer'
import { WriterDocumentMapper } from './WriterDocumentMapper'

function createRichWriterDocument(documentId = 'writer-export-rich-01'): WriterDocument {
  return {
    schemaVersion: 1,
    id: documentId,
    revision: 1,
    title: '通用文档',
    favorite: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    content: {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: '章节标题' }]
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: '含脚注' },
            { type: 'footnoteReference', attrs: { footnoteId: 'fn-1' } }
          ]
        },
        {
          type: 'blockMath',
          attrs: { latex: 'E = mc^2', nodeId: 'math-1' }
        },
        {
          type: 'image',
          attrs: {
            src: `lumina://writing/${documentId}/assets/hash.png`,
            assetPath: 'assets/hash.png',
            alt: '示意图',
            caption: '',
            width: 80
          }
        },
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableHeader',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: '名称' }] }]
                },
                {
                  type: 'tableHeader',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: '数值' }] }]
                }
              ]
            },
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableCell',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }]
                },
                {
                  type: 'tableCell',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: '1' }] }]
                }
              ]
            }
          ]
        },
        {
          type: 'taskList',
          content: [
            {
              type: 'taskItem',
              attrs: { checked: true },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: '已完成' }] }]
            }
          ]
        },
        {
          type: 'footnoteDefinition',
          attrs: { footnoteId: 'fn-1' },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: '脚注说明' }] }]
        }
      ]
    }
  }
}

test('统一 AST 保留标题、公式、图片、表格、任务和脚注', (t) => {
  const rootPath = mkdtempSync(join(tmpdir(), 'lumina-writer-mapper-'))
  t.after(() => rmSync(rootPath, { recursive: true, force: true }))
  const documentId = 'writer-export-rich-01'
  const assetsDir = join(rootPath, 'documents', documentId, 'assets')
  mkdirSync(assetsDir, { recursive: true })
  writeFileSync(join(assetsDir, 'hash.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))

  const mapped = new WriterDocumentMapper({ rootPath }).map(createRichWriterDocument(documentId))
  assert.equal(mapped.success, true)
  assert.equal(mapped.data?.title, '通用文档')
  assert.deepEqual(
    mapped.data?.nodes.map((node) => node.kind),
    ['heading', 'paragraph', 'math', 'image', 'table', 'taskList', 'footnotes']
  )
  assert.equal(mapped.data?.assets[0]?.exportName, 'hash.png')
  assert.equal(mapped.data?.assets[0]?.sourcePath, join(assetsDir, 'hash.png'))
})

test('标题元数据与正文 H1 并存且不自动降级', () => {
  const document = createRichWriterDocument()
  document.content = {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 1 },
        content: [{ type: 'text', text: '正文一级标题' }]
      }
    ]
  }
  const mapped = new WriterDocumentMapper().map(document)
  assert.equal(mapped.success, true)
  assert.equal(mapped.data?.title, '通用文档')
  const heading = mapped.data?.nodes.find((node) => node.kind === 'heading')
  assert.ok(heading && heading.kind === 'heading')
  assert.equal(heading.level, 1)
})

test('链接与加粗标记映射到 runs', () => {
  const document = createRichWriterDocument()
  document.content = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: '外链',
            marks: [
              { type: 'link', attrs: { href: 'https://example.com' } },
              { type: 'bold' }
            ]
          }
        ]
      }
    ]
  }
  const mapped = new WriterDocumentMapper().map(document)
  assert.equal(mapped.success, true)
  const paragraph = mapped.data?.nodes[0]
  assert.ok(paragraph && paragraph.kind === 'paragraph')
  assert.deepEqual(paragraph.runs[0], {
    kind: 'text',
    text: '外链',
    marks: { bold: true, href: 'https://example.com' }
  })
})

test('无法表达的节点输出可读警告而非丢弃', () => {
  const document = createRichWriterDocument()
  const content: WriterJsonDocument = {
    type: 'doc',
    content: [
      {
        type: 'unknownWidget',
        attrs: { label: '自定义控件' },
        content: [{ type: 'text', text: '残留文本' }]
      }
    ]
  }
  document.content = content
  const mapped = new WriterDocumentMapper().map(document)
  assert.equal(mapped.success, true)
  assert.ok((mapped.data?.warnings.length ?? 0) > 0)
  assert.match(mapped.data?.warnings[0] ?? '', /unknownWidget|无法表达|自定义/)
  assert.ok((mapped.data?.nodes.length ?? 0) > 0)
})
