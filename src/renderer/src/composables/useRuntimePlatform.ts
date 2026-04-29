import { computed, type ComputedRef } from 'vue'

export interface RuntimePlatformState {
  platform: ComputedRef<string>
  isMac: ComputedRef<boolean>
  isWindows: ComputedRef<boolean>
  usesNativeTrafficLights: ComputedRef<boolean>
  usesCustomWindowControls: ComputedRef<boolean>
}

export function useRuntimePlatform(): RuntimePlatformState {
  const platform = computed(() => window.electron?.process?.platform || 'unknown')
  const isMac = computed(() => platform.value === 'darwin')
  const isWindows = computed(() => platform.value === 'win32')

  return {
    platform,
    isMac,
    isWindows,
    usesNativeTrafficLights: isMac,
    usesCustomWindowControls: isWindows
  }
}
