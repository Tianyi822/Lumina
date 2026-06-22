import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getTranslationBlockDisplay } from './composables/paperTranslationBlockDisplay.ts'

describe('getTranslationBlockDisplay', () => {
  it('已有译文缓存、段落 HTML 懒渲染未完成时不应显示正在翻译', () => {
    assert.equal(
      getTranslationBlockDisplay({
        htmlStatus: 'pending',
        originalHtml: '',
        translationHtml: null,
        translationStatus: 'completed'
      }),
      'rendering'
    )
  })

  it('译文 HTML 就绪时显示正文', () => {
  assert.equal(
    getTranslationBlockDisplay({
      htmlStatus: 'ready',
      originalHtml: '<p>原文</p>',
      translationHtml: '<p>译文</p>',
      translationStatus: 'completed'
    }),
    'content'
  )
})

it('段落重渲染 pending 但已有译文 HTML 时继续显示正文', () => {
  assert.equal(
    getTranslationBlockDisplay({
      htmlStatus: 'pending',
      originalHtml: '<p>原文</p>',
      translationHtml: '<p>旧译文</p>',
      translationStatus: 'completed'
    }),
    'content'
  )
})

it('API 翻译进行中时显示正在翻译', () => {
    assert.equal(
      getTranslationBlockDisplay({
        htmlStatus: 'pending',
        originalHtml: '',
        translationHtml: null,
        translationStatus: 'translating'
      }),
      'translating'
    )
  })

  it('排队等待翻译时显示正在翻译', () => {
    assert.equal(
      getTranslationBlockDisplay({
        htmlStatus: 'pending',
        originalHtml: '',
        translationHtml: null,
        translationStatus: 'queued'
      }),
      'translating'
    )
  })

  it('翻译失败时显示失败态', () => {
    assert.equal(
      getTranslationBlockDisplay({
        htmlStatus: 'ready',
        originalHtml: '<p>原文</p>',
        translationHtml: null,
        translationStatus: 'failed'
      }),
      'failed'
    )
  })
})

describe('PaperMarkdownSegmentList 翻译失败态', () => {
  it('应提供可点击的重新翻译入口', () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'PaperMarkdownSegmentList.tsx'),
      'utf8'
    )
    const failedBranchStart = source.indexOf("translationDisplay === 'failed'")
    const nextBranchStart = source.indexOf(
      "translationDisplay === 'translating'",
      failedBranchStart
    )

    assert.notEqual(failedBranchStart, -1)
    assert.notEqual(nextBranchStart, -1)

    const failedBranchSource = source.slice(failedBranchStart, nextBranchStart)

    assert.match(failedBranchSource, /paper-markdown-view__retranslate-btn/)
    assert.match(failedBranchSource, /paper-markdown-view__retranslate-btn--visible/)
    assert.match(failedBranchSource, /onRetranslateClick\(segment\)/)
  })
})
