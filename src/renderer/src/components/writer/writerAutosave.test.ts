import test from 'node:test'
import assert from 'node:assert/strict'
import {
  WriterAutosaveController,
  WriterAutosaveFlushRegistry,
  WriterRevisionCoordinator,
  flushWriterAutosaveAndAcknowledge
} from './writerAutosave'
import type { WriterAutosaveClock } from './writerAutosave'

interface ManualTimer {
  id: number
  dueAt: number
  callback: () => void
}

function createManualAutosaveClock(): WriterAutosaveClock & {
  advance: (milliseconds: number) => void
} {
  let now = 0
  let nextId = 1
  const timers = new Map<number, ManualTimer>()

  return {
    setTimeout: (callback, delayMs) => {
      const id = nextId
      nextId += 1
      timers.set(id, { id, dueAt: now + delayMs, callback })
      return id
    },
    clearTimeout: (timerId) => {
      timers.delete(timerId as number)
    },
    advance: (milliseconds) => {
      now += milliseconds
      const dueTimers = [...timers.values()]
        .filter((timer) => timer.dueAt <= now)
        .sort((left, right) => left.dueAt - right.dueAt || left.id - right.id)
      for (const timer of dueTimers) {
        if (!timers.delete(timer.id)) continue
        timer.callback()
      }
    }
  }
}

function createDeferred(): {
  promise: Promise<void>
  resolve: () => void
} {
  let resolve: () => void = () => undefined
  const promise = new Promise<void>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

test('连续修改只保存最后快照，flush 立即等待当前保存', async () => {
  const saved: string[] = []
  const clock = createManualAutosaveClock()
  const controller = new WriterAutosaveController<string>({
    delayMs: 600,
    clock,
    save: async (value) => {
      saved.push(value)
      return { success: true }
    }
  })

  controller.schedule('a')
  controller.schedule('ab')
  clock.advance(599)
  assert.deepEqual(saved, [])

  clock.advance(1)
  await controller.flush()

  assert.deepEqual(saved, ['ab'])
})

test('保存进行中产生的新快照由同一次 flush 保存并等待完成', async () => {
  const firstSave = createDeferred()
  const saved: string[] = []
  const clock = createManualAutosaveClock()
  const controller = new WriterAutosaveController<string>({
    delayMs: 600,
    clock,
    save: async (value) => {
      saved.push(value)
      if (value === 'a') await firstSave.promise
      return { success: true }
    }
  })

  controller.schedule('a')
  clock.advance(600)
  controller.schedule('ab')
  const flushPromise = controller.flush()
  await Promise.resolve()
  assert.deepEqual(saved, ['a'])

  firstSave.resolve()
  await flushPromise

  assert.deepEqual(saved, ['a', 'ab'])
})

test('dispose 保存最后待处理快照并忽略后续修改', async () => {
  const saved: string[] = []
  const clock = createManualAutosaveClock()
  const controller = new WriterAutosaveController<string>({
    delayMs: 600,
    clock,
    save: async (value) => {
      saved.push(value)
      return { success: true }
    }
  })

  controller.schedule('卸载前')
  await controller.dispose()
  controller.schedule('卸载后')
  clock.advance(600)
  await controller.flush()

  assert.deepEqual(saved, ['卸载前'])
})

test('普通失败不自动重试，但下一次修改可保存新快照', async () => {
  const saved: string[] = []
  const clock = createManualAutosaveClock()
  const controller = new WriterAutosaveController<string>({
    delayMs: 600,
    clock,
    save: async (value) => {
      saved.push(value)
      return { success: value === '新快照' }
    }
  })

  controller.schedule('失败快照')
  clock.advance(600)
  await controller.flush()
  await controller.flush()
  controller.schedule('新快照')
  clock.advance(600)
  await controller.flush()

  assert.deepEqual(saved, ['失败快照', '新快照'])
})

test('revision conflict 后停止接受自动保存快照', async () => {
  const saved: string[] = []
  const clock = createManualAutosaveClock()
  const controller = new WriterAutosaveController<string>({
    delayMs: 600,
    clock,
    save: async (value) => {
      saved.push(value)
      return { success: false, code: 'revision_conflict' }
    }
  })

  controller.schedule('冲突快照')
  clock.advance(600)
  await controller.flush()
  controller.schedule('不得覆盖的新快照')
  clock.advance(600)
  await controller.flush()

  assert.deepEqual(saved, ['冲突快照'])
})

test('退出 ACK 只在最后快照完成保存后发送', async () => {
  const saveDeferred = createDeferred()
  const events: string[] = []
  const clock = createManualAutosaveClock()
  const controller = new WriterAutosaveController<string>({
    delayMs: 600,
    clock,
    save: async () => {
      events.push('save:start')
      await saveDeferred.promise
      events.push('save:end')
      return { success: true }
    }
  })
  controller.schedule('退出前快照')

  const handshakePromise = flushWriterAutosaveAndAcknowledge(controller, async () => {
    events.push('ack')
  })
  await Promise.resolve()
  assert.deepEqual(events, ['save:start'])

  saveDeferred.resolve()
  await handshakePromise

  assert.deepEqual(events, ['save:start', 'save:end', 'ack'])
})

test('新 controller 尚未挂载时退出仍等待旧 controller dispose 完成', async () => {
  const oldSave = createDeferred()
  const events: string[] = []
  const registry = new WriterAutosaveFlushRegistry<string>()
  const oldController = new WriterAutosaveController<string>({
    delayMs: 600,
    clock: createManualAutosaveClock(),
    save: async () => {
      events.push('old:start')
      await oldSave.promise
      events.push('old:end')
      return { success: true }
    }
  })
  registry.register(oldController)
  oldController.schedule('旧文档最后快照')
  void registry.dispose(oldController)

  const handshakePromise = flushWriterAutosaveAndAcknowledge(registry, async () => {
    events.push('ack')
  })
  await Promise.resolve()
  assert.deepEqual(events, ['old:start'])

  oldSave.resolve()
  await handshakePromise

  assert.deepEqual(events, ['old:start', 'old:end', 'ack'])
})

test('快速切换文档后退出同时等待旧 controller dispose 和新 controller flush', async () => {
  const oldSave = createDeferred()
  const newSave = createDeferred()
  const events: string[] = []
  const registry = new WriterAutosaveFlushRegistry<string>()
  const oldController = new WriterAutosaveController<string>({
    delayMs: 600,
    clock: createManualAutosaveClock(),
    save: async () => {
      events.push('old:start')
      await oldSave.promise
      events.push('old:end')
      return { success: true }
    }
  })
  const newController = new WriterAutosaveController<string>({
    delayMs: 600,
    clock: createManualAutosaveClock(),
    save: async () => {
      events.push('new:start')
      await newSave.promise
      events.push('new:end')
      return { success: true }
    }
  })

  registry.register(oldController)
  oldController.schedule('旧文档最后快照')
  void registry.dispose(oldController)
  registry.register(newController)
  newController.schedule('新文档最后快照')

  const handshakePromise = flushWriterAutosaveAndAcknowledge(registry, async () => {
    events.push('ack')
  })
  await Promise.resolve()
  assert.deepEqual(new Set(events), new Set(['old:start', 'new:start']))

  newSave.resolve()
  await Promise.resolve()
  assert.equal(events.includes('ack'), false)

  oldSave.resolve()
  await handshakePromise
  assert.equal(events.at(-1), 'ack')
})

test('外部元数据 revision 更新后下一次正文保存使用新 revision', async () => {
  const expectedRevisions: number[] = []
  const coordinator = new WriterRevisionCoordinator<string>({
    initialRevision: 3,
    save: async (_snapshot, expectedRevision) => {
      expectedRevisions.push(expectedRevision)
      return { success: true, revision: expectedRevision + 1 }
    }
  })

  await coordinator.save('第一次正文')
  coordinator.syncExternalRevision(8)
  await coordinator.save('元数据更新后的正文')

  assert.deepEqual(expectedRevisions, [3, 8])
  assert.equal(coordinator.revision, 9)
})
