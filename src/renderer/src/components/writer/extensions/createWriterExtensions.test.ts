import assert from 'node:assert/strict'
import test from 'node:test'
import type { JSONContent } from '@tiptap/core'
import { generateUniqueIds } from '@tiptap/extension-unique-id'
import { createWriterExtensions } from './createWriterExtensions'

test('稳定顶层块生成互不重复的 nodeId', () => {
  const document: JSONContent = {
    type: 'doc',
    content: [
      { type: 'horizontalRule' },
      { type: 'image', attrs: { src: 'https://example.com/image.png' } },
      {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                content: [{ type: 'paragraph' }]
              }
            ]
          }
        ]
      }
    ]
  }

  const withIds = generateUniqueIds(document, createWriterExtensions())
  const topLevelIds = withIds.content?.map((node) => node.attrs?.nodeId)

  assert.equal(topLevelIds?.length, 3)
  assert.ok(topLevelIds?.every((nodeId) => typeof nodeId === 'string' && nodeId.length > 0))
  assert.equal(new Set(topLevelIds).size, 3)
})
