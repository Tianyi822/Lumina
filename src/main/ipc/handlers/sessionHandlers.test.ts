import test from 'node:test'
import assert from 'node:assert/strict'
import {
  validateAppendMessages,
  validateSessionMetaPatch,
  validateSessionTitle
} from './sessionValidation'

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
    assert.equal(validateSessionTitle('x'.repeat(201)), '标题长度不能超过 200 个字符')
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

test('validateAppendMessages', async (t) => {
  await t.test('合法消息数组返回 null', () => {
    assert.equal(
      validateAppendMessages([{ id: 'a', role: 'user', content: 'hi', timestamp: 't' }]),
      null
    )
  })

  await t.test('非数组返回错误', () => {
    assert.equal(validateAppendMessages('x'), '消息必须是数组')
  })

  await t.test('空数组返回错误', () => {
    assert.equal(validateAppendMessages([]), '消息数组不能为空')
  })

  await t.test('缺少必备字段返回错误', () => {
    assert.equal(validateAppendMessages([{ id: 'a' }]), '消息结构无效')
  })
})

test('validateSessionMetaPatch', async (t) => {
  await t.test('合法 patch 返回 null', () => {
    assert.equal(validateSessionMetaPatch({ title: '新标题' }), null)
  })

  await t.test('空对象返回 null', () => {
    assert.equal(validateSessionMetaPatch({}), null)
  })

  await t.test('title 超长返回错误', () => {
    assert.equal(validateSessionMetaPatch({ title: 'x'.repeat(201) }), '标题长度不能超过 200 个字符')
  })

  await t.test('非对象返回错误', () => {
    assert.equal(validateSessionMetaPatch('x'), '元数据补丁必须是对象')
  })
})
