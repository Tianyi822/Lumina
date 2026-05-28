import test from 'node:test'
import assert from 'node:assert/strict'
import { validateSaveConfig, validateImportContent } from './mcpValidation'

test('validateSaveConfig', async (t) => {
  await t.test('config 为 null 时返回错误', () => {
    assert.equal(validateSaveConfig(null), '配置参数无效')
  })

  await t.test('config 为 undefined 时返回错误', () => {
    assert.equal(validateSaveConfig(undefined), '配置参数无效')
  })

  await t.test('config 为字符串时返回错误', () => {
    assert.equal(validateSaveConfig('string'), '配置参数无效')
  })

  await t.test('name 为空字符串时返回错误', () => {
    assert.equal(validateSaveConfig({ name: '' }), '配置名称不能为空')
  })

  await t.test('name 为纯空格时返回错误', () => {
    assert.equal(validateSaveConfig({ name: '   ' }), '配置名称不能为空')
  })

  await t.test('name 不存在时返回错误', () => {
    assert.equal(validateSaveConfig({}), '配置名称不能为空')
  })

  await t.test('有效 config 返回 null', () => {
    assert.equal(validateSaveConfig({ name: 'test-server' }), null)
  })
})

test('validateImportContent', async (t) => {
  await t.test('空字符串返回错误', () => {
    assert.equal(validateImportContent(''), '导入内容不能为空')
  })

  await t.test('纯空格返回错误', () => {
    assert.equal(validateImportContent('   '), '导入内容不能为空')
  })

  await t.test('数字类型返回错误', () => {
    assert.equal(validateImportContent(123), '导入内容不能为空')
  })

  await t.test('null 类型返回错误', () => {
    assert.equal(validateImportContent(null), '导入内容不能为空')
  })

  await t.test('有效 JSON 字符串返回 null', () => {
    assert.equal(validateImportContent('{"servers":[]}'), null)
  })
})
