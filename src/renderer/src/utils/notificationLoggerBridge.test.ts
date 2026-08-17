import test from 'node:test'
import assert from 'node:assert/strict'
import { notificationLoggerBridge } from './notificationLoggerBridge'
import type { Notification } from '@renderer/types/notification'

function makeNotification(overrides: Partial<Notification>): Notification {
  return {
    id: 'test-id',
    type: 'info',
    title: '标题',
    duration: 1000,
    source: 'system',
    timestamp: Date.now(),
    persistence: 'auto',
    dismissible: true,
    ...overrides
  }
}

test('通知标题为空值时不抛错（pre-init i18n 防御）', async (t) => {
  const logs: string[] = []
  ;(globalThis as { window?: unknown }).window = {
    api: { logger: { info: (message: string) => logs.push(message) } }
  }
  t.after(() => {
    delete (globalThis as { window?: unknown }).window
  })

  assert.doesNotThrow(() => {
    notificationLoggerBridge.log(makeNotification({ title: undefined as unknown as string }))
  })
  assert.match(logs[0] ?? '', /\[Notification\]/)
})
