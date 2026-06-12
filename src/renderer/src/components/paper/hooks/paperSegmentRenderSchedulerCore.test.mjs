import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createSegmentRenderScheduler,
  SegmentRenderPriority
} from './paperSegmentRenderSchedulerCore.ts'

test('可见段优先于 idle 段出队', async () => {
  const order = []
  const scheduler = createSegmentRenderScheduler({
    concurrency: 1,
    onRender: async (index) => {
      order.push(index)
    }
  })

  scheduler.enqueue([10, 11], SegmentRenderPriority.Idle)
  scheduler.enqueue([0, 1], SegmentRenderPriority.Visible)
  await scheduler.pump()
  await scheduler.drain()

  assert.deepEqual(order, [0, 1, 10, 11])
})

test('pause 时 pump 不执行，resume 后继续', async () => {
  const order = []
  const scheduler = createSegmentRenderScheduler({
    concurrency: 1,
    onRender: async (index) => {
      order.push(index)
    }
  })

  scheduler.enqueue([0], SegmentRenderPriority.Visible)
  scheduler.pause()
  await scheduler.pump()
  assert.deepEqual(order, [])

  scheduler.resume()
  await scheduler.pump()
  await scheduler.drain()
  assert.deepEqual(order, [0])
})
