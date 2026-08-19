import assert from 'node:assert/strict'
import test from 'node:test'
import { initI18n } from '@renderer/i18n'
import { getWriterSuggestionPendingLabel } from './writerSuggestionLabels'

// 文案改走 i18n.t：先初始化（测试环境默认 zh，既有中文断言不变）
await initI18n()

test('pending 文案按动作区分', () => {
  assert.equal(getWriterSuggestionPendingLabel('rewrite'), 'AI 正在改写...')
  assert.equal(getWriterSuggestionPendingLabel('continue'), 'AI 正在续写...')
  assert.equal(getWriterSuggestionPendingLabel(undefined), 'AI 正在生成建议...')
  assert.equal(getWriterSuggestionPendingLabel(null), 'AI 正在生成建议...')
})
