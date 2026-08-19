import test from 'node:test'
import assert from 'node:assert/strict'
import { t, setLanguageProvider } from '@main/services/i18n'

test('未注入语言读取器时缺省中文', () => {
  assert.equal(t('common.close'), '关闭')
})

test('注入 en 后返回英文', () => {
  setLanguageProvider(() => 'en')
  assert.equal(t('common.close'), 'Close')
  setLanguageProvider(() => 'zh')
})

test('插值与既有复数 key 可用', () => {
  assert.equal(
    t('notifications.paper.restoreMessage', { count: 2 }),
    '2 条批注因文本变化未能恢复高亮'
  )
})
