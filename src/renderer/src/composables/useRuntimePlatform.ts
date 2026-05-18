import { computed, type ComputedRef } from 'vue'
import { getRuntimePlatform } from './runtimePlatformCore'

export type { RuntimePlatformInfo } from './runtimePlatformCore'

export interface RuntimePlatformState {
  platform: ComputedRef<string>
  isMac: ComputedRef<boolean>
  isWindows: ComputedRef<boolean>
  usesNativeTrafficLights: ComputedRef<boolean>
  usesCustomWindowControls: ComputedRef<boolean>
}

export function useRuntimePlatform(): RuntimePlatformState {
  const info = getRuntimePlatform()
  const isMac = computed(() => info.isMac)
  const isWindows = computed(() => info.isWindows)

  return {
    platform: computed(() => info.platform),
    isMac,
    isWindows,
    usesNativeTrafficLights: isMac,
    usesCustomWindowControls: isWindows
  }
}
