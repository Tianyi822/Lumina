import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { CapabilityManager } from './CapabilityManager'
import { presetRegistry } from './presets/PresetRegistry'
import { CHAT_PAPER_PRESET, CHAT_DEFAULT_PRESET } from './presets/builtinPresets'

describe('CapabilityManager', () => {
  let manager: CapabilityManager

  beforeEach(() => {
    manager = new CapabilityManager()
    presetRegistry.register(CHAT_PAPER_PRESET)
    presetRegistry.register(CHAT_DEFAULT_PRESET)
  })

  it('initCapabilities 创建默认能力状态', () => {
    const state = manager.initCapabilities('s1')
    assert.equal(state.presetId, 'chat.default')
    assert.deepEqual(state.activeCapabilities, [])
  })

  it('initCapabilities 恢复已有状态', () => {
    const existing = { presetId: 'chat.paper', activeCapabilities: ['paper'] }
    const state = manager.initCapabilities('s1', existing)
    assert.equal(state.presetId, 'chat.paper')
    assert.deepEqual(state.activeCapabilities, ['paper'])
  })

  it('initCapabilitiesForSessionType paper 类型使用 paper 预设', () => {
    const state = manager.initCapabilitiesForSessionType('s1', 'paper')
    assert.equal(state.presetId, 'chat.paper')
    assert.deepEqual(state.activeCapabilities, ['paper', 'knowledge'])
  })

  it('initCapabilitiesForSessionType 未知类型使用 default 预设', () => {
    const state = manager.initCapabilitiesForSessionType('s1', 'unknown_type')
    assert.equal(state.presetId, 'chat.default')
    assert.deepEqual(state.activeCapabilities, [])
  })

  it('addCapability 追加新能力', () => {
    manager.initCapabilities('s1')
    const state = manager.addCapability('s1', 'lab')
    assert.deepEqual(state!.activeCapabilities, ['lab'])
  })

  it('addCapability 不重复添加', () => {
    manager.initCapabilities('s1')
    manager.addCapability('s1', 'lab')
    const state = manager.addCapability('s1', 'lab')
    assert.deepEqual(state!.activeCapabilities, ['lab'])
  })

  it('removeCapability 移除能力', () => {
    manager.initCapabilities('s1')
    manager.addCapability('s1', 'lab')
    manager.addCapability('s1', 'paper')
    const state = manager.removeCapability('s1', 'lab')
    assert.deepEqual(state!.activeCapabilities, ['paper'])
  })

  it('removeCapability 移除不存在的能力无影响', () => {
    manager.initCapabilities('s1')
    const state = manager.removeCapability('s1', 'nonexistent')
    assert.deepEqual(state!.activeCapabilities, [])
  })

  it('addCapability 对未知会话返回 null', () => {
    const state = manager.addCapability('unknown', 'lab')
    assert.equal(state, null)
  })

  it('removeCapability 对未知会话返回 null', () => {
    const state = manager.removeCapability('unknown', 'lab')
    assert.equal(state, null)
  })

  it('clearSession 清理会话状态', () => {
    manager.initCapabilities('s1')
    manager.clearSession('s1')
    assert.equal(manager.getCapabilities('s1'), undefined)
  })

  it('getCapabilities 返回 undefined 对未知会话', () => {
    assert.equal(manager.getCapabilities('unknown'), undefined)
  })
})
