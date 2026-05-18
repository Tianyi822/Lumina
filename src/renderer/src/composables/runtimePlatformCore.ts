export type Platform = 'darwin' | 'win32' | 'linux' | 'unknown'

export interface RuntimePlatformInfo {
  platform: Platform
  isMac: boolean
  isWindows: boolean
  isLinux: boolean
  usesNativeTrafficLights: boolean
  usesCustomWindowControls: boolean
}

export function getRuntimePlatform(): RuntimePlatformInfo {
  const raw: string = window.electron?.process?.platform ?? 'unknown'
  const platform: Platform =
    raw === 'win32' ? 'win32' : raw === 'linux' ? 'linux' : raw === 'darwin' ? 'darwin' : 'unknown'
  const isMac = platform === 'darwin'
  const isWindows = platform === 'win32'
  const isLinux = platform === 'linux'

  return {
    platform,
    isMac,
    isWindows,
    isLinux,
    usesNativeTrafficLights: isMac,
    usesCustomWindowControls: isWindows
  }
}
