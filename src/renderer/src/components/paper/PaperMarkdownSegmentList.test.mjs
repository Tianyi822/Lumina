import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
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
