import type { ActiveCapabilityState } from '@shared/types/session'
import { presetRegistry } from './presets/PresetRegistry'
import { SESSION_TYPE_TO_PRESET } from './presets/builtinPresets'

export class CapabilityManager {
  private sessionCapabilities = new Map<string, ActiveCapabilityState>()

  initCapabilities(sessionId: string, existingState?: ActiveCapabilityState): ActiveCapabilityState {
    return this.initCapabilitiesForSessionType(sessionId, 'default', existingState)
  }

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

  addCapability(sessionId: string, capabilityId: string): ActiveCapabilityState | null {
    const state = this.sessionCapabilities.get(sessionId)
    if (!state) return null
    if (state.activeCapabilities.includes(capabilityId)) return state
    state.activeCapabilities.push(capabilityId)
    return state
  }

  removeCapability(sessionId: string, capabilityId: string): ActiveCapabilityState | null {
    const state = this.sessionCapabilities.get(sessionId)
    if (!state) return null
    state.activeCapabilities = state.activeCapabilities.filter((id) => id !== capabilityId)
    return state
  }

  getCapabilities(sessionId: string): ActiveCapabilityState | undefined {
    return this.sessionCapabilities.get(sessionId)
  }

  clearSession(sessionId: string): void {
    this.sessionCapabilities.delete(sessionId)
  }
}

export const capabilityManager = new CapabilityManager()
