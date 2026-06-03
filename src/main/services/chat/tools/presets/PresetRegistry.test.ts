import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { PresetRegistry } from './PresetRegistry'
import { CHAT_PAPER_PRESET, CHAT_DEFAULT_PRESET, SESSION_TYPE_TO_PRESET } from './builtinPresets'

describe('PresetRegistry', () => {
  it('注册和获取预设', () => {
    const registry = new PresetRegistry()
    registry.register(CHAT_PAPER_PRESET)
    assert.equal(registry.get('chat.paper'), CHAT_PAPER_PRESET)
    assert.equal(registry.get('unknown'), undefined)
  })

  it('getAll 返回所有已注册的预设', () => {
    const registry = new PresetRegistry()
    registry.register(CHAT_PAPER_PRESET)
    registry.register(CHAT_DEFAULT_PRESET)
    assert.equal(registry.getAll().length, 2)
  })
})

describe('builtinPresets', () => {
  it('chat.paper 预设包含 paper 和 knowledge 能力', () => {
    assert.deepEqual(CHAT_PAPER_PRESET.defaultCapabilities, ['paper', 'knowledge'])
  })

  it('chat.paper 预设有两阶段组合', () => {
    assert.equal(CHAT_PAPER_PRESET.defaultComposition.stages.length, 2)
    assert.equal(CHAT_PAPER_PRESET.defaultComposition.stages[0].capabilityId, 'paper')
    assert.equal(CHAT_PAPER_PRESET.defaultComposition.stages[0].mode, 'required')
    assert.equal(CHAT_PAPER_PRESET.defaultComposition.stages[1].capabilityId, 'knowledge')
    assert.equal(CHAT_PAPER_PRESET.defaultComposition.stages[1].mode, 'conditional')
  })

  it('chat.paper 预设的 knowledge 阶段有 condition 函数', () => {
    const knowledgeStage = CHAT_PAPER_PRESET.defaultComposition.stages[1]
    assert.equal(typeof knowledgeStage.condition, 'function')
  })

  it('chat.default 预设无默认能力', () => {
    assert.deepEqual(CHAT_DEFAULT_PRESET.defaultCapabilities, [])
    assert.equal(CHAT_DEFAULT_PRESET.defaultComposition.stages.length, 0)
  })

  it('SESSION_TYPE_TO_PRESET 映射完整', () => {
    assert.equal(SESSION_TYPE_TO_PRESET['paper'], 'chat.paper')
    assert.equal(SESSION_TYPE_TO_PRESET['default'], 'chat.default')
    assert.equal(SESSION_TYPE_TO_PRESET['knowledge'], 'chat.default')
    assert.equal(SESSION_TYPE_TO_PRESET['tool'], 'chat.default')
  })
})
