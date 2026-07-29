import test from 'node:test'
import assert from 'node:assert/strict'
import { WriterSessionFactory } from './WriterSessionFactory'

test('WriterSessionFactory 创建带文档资源引用的独立会话', () => {
  const factory = new WriterSessionFactory()
  const session = factory.create('写作对话', {
    kind: 'writer',
    id: 'writer-12345678'
  })
  assert.equal(session.sessionType, 'writer')
  assert.deepEqual(session.resourceRef, {
    kind: 'writer',
    id: 'writer-12345678'
  })
})
