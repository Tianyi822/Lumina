import type { ActiveCapabilityState } from '@shared/types/session'
import { presetRegistry } from './presets/PresetRegistry'
import { SESSION_TYPE_TO_PRESET } from './presets/builtinPresets'

/**
 * 能力管理器
 * 管理每个会话已激活的能力状态，支持按会话类型初始化默认能力
 */
export class CapabilityManager {
  /** 会话 ID -> 活跃能力状态 */
  private sessionCapabilities = new Map<string, ActiveCapabilityState>()

  /**
   * 初始化会话能力（默认使用 'default' 会话类型）
   * @param sessionId 会话 ID
   * @param existingState 已有的能力状态（用于恢复旧会话）
   */
  initCapabilities(
    sessionId: string,
    existingState?: ActiveCapabilityState
  ): ActiveCapabilityState {
    return this.initCapabilitiesForSessionType(sessionId, 'default', existingState)
  }

  /**
   * 按会话类型初始化能力状态
   * 根据会话类型查找预设，加载默认激活的能力列表
   * @param sessionId 会话 ID
   * @param sessionType 会话类型
   * @param existingState 已有的能力状态
   */
  initCapabilitiesForSessionType(
    sessionId: string,
    sessionType: string,
    existingState?: ActiveCapabilityState
  ): ActiveCapabilityState {
    if (existingState) {
      this.sessionCapabilities.set(sessionId, existingState)
      return existingState
    }

    const presetId = SESSION_TYPE_TO_PRESET[sessionType] ?? 'chat.default'
    const preset = presetRegistry.get(presetId)
    const state: ActiveCapabilityState = {
      presetId,
      activeCapabilities: preset ? [...preset.defaultCapabilities] : []
    }
    this.sessionCapabilities.set(sessionId, state)
    return state
  }

  /**
   * 为会话添加一项能力（去重）
   * @returns 更新后的能力状态，会话不存在时返回 null
   */
  addCapability(sessionId: string, capabilityId: string): ActiveCapabilityState | null {
    const state = this.sessionCapabilities.get(sessionId)
    if (!state) return null
    if (state.activeCapabilities.includes(capabilityId)) return state
    state.activeCapabilities.push(capabilityId)
    return state
  }

  /**
   * 从会话移除一项能力
   * @returns 更新后的能力状态，会话不存在时返回 null
   */
  removeCapability(sessionId: string, capabilityId: string): ActiveCapabilityState | null {
    const state = this.sessionCapabilities.get(sessionId)
    if (!state) return null
    state.activeCapabilities = state.activeCapabilities.filter((id) => id !== capabilityId)
    return state
  }

  /** 获取会话当前的能力状态 */
  getCapabilities(sessionId: string): ActiveCapabilityState | undefined {
    return this.sessionCapabilities.get(sessionId)
  }

  /** 清除会话的能力状态（会话关闭时调用） */
  clearSession(sessionId: string): void {
    this.sessionCapabilities.delete(sessionId)
  }
}

export const capabilityManager = new CapabilityManager()
