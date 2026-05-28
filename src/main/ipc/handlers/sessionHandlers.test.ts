import test from 'node:test'
import assert from 'node:assert/strict'
import { validateSessionTitle } from './sessionValidation'

test('validateSessionTitle', async (t) => {
  await t.test('undefined 返回 null（标题可选）', () => {
    assert.equal(validateSessionTitle(undefined), null)
  })

  await t.test('null 返回 null（标题可选）', () => {
    assert.equal(validateSessionTitle(null), null)
  })

  await t.test('空字符串合法', () => {
    assert.equal(validateSessionTitle(''), null)
  })

  await t.test('正常标题合法', () => {
    assert.equal(validateSessionTitle('测试会话'), null)
  })

  await t.test('200 字符标题合法', () => {
    assert.equal(validateSessionTitle('x'.repeat(200)), null)
  })

  await t.test('201 字符标题返回错误', () => {
    assert.equal(
      validateSessionTitle('x'.repeat(201)),
      '标题长度不能超过 200 个字符'
    )
  })

  await t.test('数字类型返回错误', () => {
    assert.equal(validateSessionTitle(123), '标题必须是字符串')
  })

  await t.test('布尔类型返回错误', () => {
    assert.equal(validateSessionTitle(true), '标题必须是字符串')
  })

  await t.test('对象类型返回错误', () => {
    assert.equal(validateSessionTitle({}), '标题必须是字符串')
  })

  await t.test('数组类型返回错误', () => {
    assert.equal(validateSessionTitle([1, 2, 3]), '标题必须是字符串')
  })
})
