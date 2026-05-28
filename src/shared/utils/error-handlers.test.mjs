import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getErrorMessage } from './error-handlers.ts'

describe('getErrorMessage', () => {
  it('Error 对象返回 message', () => {
    assert.equal(getErrorMessage(new Error('test error')), 'test error')
  })

  it('字符串直接返回', () => {
    assert.equal(getErrorMessage('string error'), 'string error')
  })

  it('null 返回默认消息', () => {
    assert.equal(getErrorMessage(null), '未知错误')
  })

  it('undefined 返回默认消息', () => {
    assert.equal(getErrorMessage(undefined), '未知错误')
  })

  it('带 message 属性的对象返回其 message', () => {
    assert.equal(getErrorMessage({ message: 'obj error' }), 'obj error')
  })

  it('带非字符串 message 属性的对象转为字符串', () => {
    assert.equal(getErrorMessage({ message: 404 }), '404')
  })

  it('无 message 属性的对象返回默认消息', () => {
    assert.equal(getErrorMessage({ code: 'ERR_TIMEOUT' }), '未知错误')
  })

  it('数字等非字符串原始类型返回默认消息', () => {
    assert.equal(getErrorMessage(42), '未知错误')
  })
})
