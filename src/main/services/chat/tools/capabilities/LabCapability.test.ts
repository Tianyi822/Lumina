import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import { LabCapability } from './LabCapability'
import { labToolService } from '../../../lab'

test('无 discipline 时 createAdapter 返回 null', () => {
  const cap = new LabCapability()
  assert.equal(cap.createAdapter({}), null)
  assert.equal(cap.createAdapter({ labDiscipline: null }), null)
})

test('有 discipline 时返回非 null adapter', () => {
  const cap = new LabCapability()
  assert.ok(cap.createAdapter({ labDiscipline: 'computer', labId: 'lab-1' }))
})

test('describeTools 无 context 返回空', () => {
  assert.equal(new LabCapability().describeTools({}).length, 0)
})

test('describeTools computer 返回该学科工具清单', () => {
  const ds = new LabCapability().describeTools({ labDiscipline: 'computer' })
  const names = ds.map((d) => d.name)
  assert.ok(names.includes('lab__exec_command'))
  assert.ok(names.includes('lab__read_file'))
})

test('LabToolAdapter 传入 labId 后 getTools 返回 computer 学科工具', async () => {
  const cap = new LabCapability()
  const adapter = cap.createAdapter({ labDiscipline: 'computer', labId: 'lab-bound' })!
  const tools = await adapter.getTools()
  const names = tools.map((t) => t.toolName)
  assert.ok(names.includes('exec_command'))
})

test('execute 自动注入 lab_id（调用方未提供时）', async () => {
  const cap = new LabCapability()
  const adapter = cap.createAdapter({ labDiscipline: 'computer', labId: 'lab-injected' })!
  const callToolMock = mock.method(labToolService, 'callTool', () =>
    Promise.resolve({ success: true, content: [] })
  )
  try {
    await adapter.execute('exec_command', { command: 'ls' })
    const passedArgs = callToolMock.mock.calls[0].arguments[1] as Record<string, unknown>
    assert.equal(passedArgs.lab_id, 'lab-injected')
  } finally {
    callToolMock.mock.restore()
  }
})

test('execute 不覆盖调用方显式提供的 lab_id', async () => {
  const cap = new LabCapability()
  const adapter = cap.createAdapter({ labDiscipline: 'computer', labId: 'lab-injected' })!
  const callToolMock = mock.method(labToolService, 'callTool', () =>
    Promise.resolve({ success: true, content: [] })
  )
  try {
    await adapter.execute('exec_command', { command: 'ls', lab_id: 'lab-explicit' })
    const passedArgs = callToolMock.mock.calls[0].arguments[1] as Record<string, unknown>
    assert.equal(passedArgs.lab_id, 'lab-explicit')
  } finally {
    callToolMock.mock.restore()
  }
})
