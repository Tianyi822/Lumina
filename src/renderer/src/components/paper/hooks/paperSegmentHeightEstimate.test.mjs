import test from 'node:test'
import assert from 'node:assert/strict'
import { estimateSegmentHeight } from './paperSegmentHeightEstimate.ts'

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createSegment(kind, originalText) {
  return {
    renderId: 'r1',
    stableId: 's1',
    sourceRevisionId: '',
    textHash: 'h1',
    kind,
    originalText,
    originalHtml: '',
    translationHtml: null,
    translationText: '',
    translationStatus: 'idle',
    showTranslation: false,
    isCenteredMeta: false,
    annotations: []
  }
}

test('长 bullet 列表估算应明显高于单项占位', () => {
  const items = Array.from(
    { length: 15 },
    (_, index) => `- a photo template line number ${index + 1} with extra words`
  )
  const text = items.join('\n')
  const height = estimateSegmentHeight(createSegment('list', text))

  assert.ok(height >= 15 * 27 + 20, `expected tall list estimate, got ${height}`)
})

test('含多 display math 的段落估算应包含公式块加成', () => {
  const text = ['$$', 'F_t^n = \\sum', '$$', '$$', 'F_t^a = \\sum', '$$'].join('\n')
  const height = estimateSegmentHeight(createSegment('paragraph', text))

  assert.ok(height >= 56 * 2 + 40, `expected math-heavy paragraph estimate, got ${height}`)
})

test('带宽表与单元格公式的表格估算应高于最小占位', () => {
  const text = [
    '<table border="1">',
    '<tr><td>Method</td><td>P</td><td>R</td><td>F1</td></tr>',
    '<tr><td>Ours</td><td>$82.9 \\pm 0.1$</td><td>$84.5 \\pm 0.2$</td><td>$91.6$</td></tr>',
    '<tr><td>Base</td><td>$$x^2$$</td><td>$$y^2$$</td><td>$$z^2$$</td></tr>',
    '</table>'
  ].join('')
  const height = estimateSegmentHeight(createSegment('table', text))

  assert.ok(height >= 80 + 32 * 2, `expected table estimate with math, got ${height}`)
})
