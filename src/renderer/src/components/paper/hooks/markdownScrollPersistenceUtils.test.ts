import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { PaperReadingProgress } from '@shared/types/paper'
import {
  buildReadingProgressPatch,
  computeScrollPercent,
  isScrollContainerReady,
  isScrollTopSettled,
  resolveScrollPercentForRestore
} from './markdownScrollPersistenceUtils'

describe('computeScrollPercent', () => {
  it('returns 0 when content is not scrollable', () => {
    assert.equal(
      computeScrollPercent({
        scrollTop: 10,
        scrollHeight: 400,
        clientHeight: 400
      }),
      0
    )
  })

  it('returns clamped percentage for scrollable content', () => {
    assert.equal(
      computeScrollPercent({
        scrollTop: 250,
        scrollHeight: 1000,
        clientHeight: 500
      }),
      50
    )
  })
})

describe('isScrollContainerReady', () => {
  it('returns false when content is not scrollable', () => {
    assert.equal(
      isScrollContainerReady({
        scrollHeight: 400,
        clientHeight: 400
      }),
      false
    )
  })

  it('returns true when content is scrollable', () => {
    assert.equal(
      isScrollContainerReady({
        scrollHeight: 1000,
        clientHeight: 500
      }),
      true
    )
  })
})

describe('isScrollTopSettled', () => {
  it('returns false when layout is not scrollable yet', () => {
    assert.equal(
      isScrollTopSettled(
        {
          scrollTop: 0,
          scrollHeight: 400,
          clientHeight: 400
        },
        120
      ),
      false
    )
  })

  it('returns false when target scrollTop exceeds current layout height', () => {
    assert.equal(
      isScrollTopSettled(
        {
          scrollTop: 120,
          scrollHeight: 620,
          clientHeight: 500
        },
        800
      ),
      false
    )
  })

  it('returns false when scrollTop has not reached target yet', () => {
    assert.equal(
      isScrollTopSettled(
        {
          scrollTop: 120,
          scrollHeight: 1500,
          clientHeight: 500
        },
        800
      ),
      false
    )
  })

  it('returns true when scrollTop matches target within tolerance', () => {
    assert.equal(
      isScrollTopSettled(
        {
          scrollTop: 498,
          scrollHeight: 1500,
          clientHeight: 500
        },
        500
      ),
      true
    )
  })
})

describe('resolveScrollPercentForRestore', () => {
  const progress: PaperReadingProgress = {
    scrollPercentOriginal: 20,
    scrollPercentTranslated: 80,
    zoomLevel: 1,
    readAt: '2026-01-01T00:00:00.000Z',
    translationVisible: false
  }

  it('uses translated percent when translation is currently visible', () => {
    assert.equal(resolveScrollPercentForRestore(progress, true), 80)
  })

  it('uses original percent when translation is currently hidden', () => {
    assert.equal(resolveScrollPercentForRestore(progress, false), 20)
  })
})

describe('buildReadingProgressPatch', () => {
  it('updates only the active translation mode field', () => {
    const existing: PaperReadingProgress = {
      scrollPercentOriginal: 10,
      scrollPercentTranslated: 90,
      zoomLevel: 1,
      readAt: '2026-01-01T00:00:00.000Z',
      translationVisible: false
    }

    const next = buildReadingProgressPatch(existing, {
      percent: 55.555,
      translationVisible: false,
      zoomLevel: 1.25
    })

    assert.equal(next.scrollPercentOriginal, 55.56)
    assert.equal(next.scrollPercentTranslated, 90)
    assert.equal(next.zoomLevel, 1.25)
    assert.equal(next.translationVisible, false)
  })
})
