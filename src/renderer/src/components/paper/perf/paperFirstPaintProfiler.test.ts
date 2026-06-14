import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createFirstPaintProbe, type ProbeDeps } from './paperFirstPaintProfiler.ts'

function makeFakeDeps(overrides: Partial<ProbeDeps> = {}): ProbeDeps {
  return {
    isDev: true,
    getFlag: () => '1',
    now: () => 0,
    mark: () => {},
    measure: () => 0,
    getMarkTime: () => 0,
    observeLongTasks: () => null,
    scheduleIdle: () => {},
    scheduleTimeout: () => {},
    report: () => {},
    ...overrides
  }
}

test('disabled（flag 关闭）时 start 不 mark 不 observe', () => {
  const marks: string[] = []
  let observed = false
  const probe = createFirstPaintProbe(
    makeFakeDeps({
      getFlag: () => null,
      mark: (n) => marks.push(n),
      observeLongTasks: () => {
        observed = true
        return () => {}
      }
    })
  )
  probe.start()
  probe.mark('pr:x')
  assert.equal(observed, false)
  assert.deepEqual(marks, [])
})

test('disabled 时 recordSample 不收集、不 report', () => {
  const reports: unknown[] = []
  const probe = createFirstPaintProbe(
    makeFakeDeps({ getFlag: () => null, report: (r) => reports.push(r) })
  )
  probe.recordSample(50)
  probe.start()
  assert.equal(reports.length, 0)
})

test('enabled start 后收集 longtask，idle 触发时 report 含归类结果', () => {
  const marks: string[] = []
  const reports: Array<{ longTasksClassified: unknown[] }> = []
  let longtaskCb: ((s: number, d: number) => void) | null = null
  const probe = createFirstPaintProbe(
    makeFakeDeps({
      mark: (n) => marks.push(n),
      getMarkTime: (n) => (n === 'pr:metas-start' ? 100 : n === 'pr:metas-end' ? 200 : 0),
      observeLongTasks: (cb) => {
        longtaskCb = cb
        return () => {
          longtaskCb = null
        }
      },
      scheduleIdle: (cb) => cb(), // 立即触发结束
      report: (r) => reports.push(r as never)
    })
  )
  probe.start()
  assert.ok(longtaskCb, 'observer 应已注册')
  ;(longtaskCb as (s: number, d: number) => void)(150, 60) // 落在 [100,200] → pr:metas
  assert.equal(reports.length, 1)
  assert.equal(reports[0].longTasksClassified.length, 1)
  assert.equal(marks[0], 'pr:mount')
})

test('start 打 pr:mount，idle 结束打 pr:idle', () => {
  const marks: string[] = []
  const probe = createFirstPaintProbe(
    makeFakeDeps({ mark: (n) => marks.push(n), scheduleIdle: (cb) => cb() })
  )
  probe.start()
  assert.ok(marks.includes('pr:mount'))
  assert.ok(marks.includes('pr:idle'))
})

test('end 后再次到达的 idle 回调不重复 report（runId 防重）', () => {
  const reports: unknown[] = []
  let idleCb: (() => void) | null = null
  const probe = createFirstPaintProbe(
    makeFakeDeps({
      scheduleIdle: (cb) => {
        idleCb = cb
      },
      scheduleTimeout: () => {},
      report: (r) => reports.push(r)
    })
  )
  probe.start()
  ;(idleCb as unknown as () => void)() // 第一次结束
  ;(idleCb as unknown as () => void)() // 模拟超时兜底再次触发
  assert.equal(reports.length, 1)
})
