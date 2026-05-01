import test from 'node:test'
import assert from 'node:assert/strict'

import { PromptBuilder } from './PromptBuilder.ts'

test('PromptBuilder 会注入匹配到的 Skill 指令', async () => {
  const builder = new PromptBuilder()
  const prompt = await builder.buildSystemPrompt(
    { base_url: 'http://localhost', api_key: 'key', model_name: 'model' },
    false,
    [],
    [
      {
        skillId: 'paper.skill',
        name: 'Paper Skill',
        directoryPath: '/tmp/paper-skill',
        score: 2,
        reasons: ['匹配关键词: paper'],
        instructions: '始终先核对论文证据。'
      }
    ]
  )

  assert.match(prompt, /自动匹配的 Skill 指令/)
  assert.match(prompt, /Paper Skill/)
  assert.match(prompt, /始终先核对论文证据/)
})

test('PromptBuilder 未匹配 Skill 时不注入 Skill 段落', async () => {
  const builder = new PromptBuilder()
  const prompt = await builder.buildSystemPrompt(
    { base_url: 'http://localhost', api_key: 'key', model_name: 'model' },
    false
  )

  assert.doesNotMatch(prompt, /自动匹配的 Skill 指令/)
})
