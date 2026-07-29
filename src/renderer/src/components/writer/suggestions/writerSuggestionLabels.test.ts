import assert from 'node:assert/strict'
import test from 'node:test'
import { getWriterSuggestionPendingLabel } from './writerSuggestionLabels'

test('pending 文案按动作区分', () => {
  assert.equal(getWriterSuggestionPendingLabel('rewrite'), 'AI 正在改写…')
  assert.equal(getWriterSuggestionPendingLabel('continue'), 'AI 正在续写…')
  assert.equal(getWriterSuggestionPendingLabel(undefined), 'AI 正在生成建议…')
  assert.equal(getWriterSuggestionPendingLabel(null), 'AI 正在生成建议…')
})
