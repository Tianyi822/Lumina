import test from 'node:test'
import assert from 'node:assert/strict'
import { shouldUsePlanExecute } from './chatRouting.ts'

test('论文会话开启实验室工具但未开启规划模式时走 ReAct', async () => {
  assert.equal(shouldUsePlanExecute({ sessionType: 'paper', enablePlanMode: false }), false)
  assert.equal(shouldUsePlanExecute({ sessionType: 'paper' }), false)
})

test('论文会话显式开启规划模式时才走 Plan-Execute', async () => {
  assert.equal(shouldUsePlanExecute({ sessionType: 'paper', enablePlanMode: true }), true)
  assert.equal(shouldUsePlanExecute({ sessionType: 'default', enablePlanMode: true }), false)
})
