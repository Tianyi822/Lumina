export type ThemeChangeCallback = (theme: string) => void

export interface ThemeCallbacks {
  callbacks: Set<ThemeChangeCallback>
  notify: (currentTheme: string) => void
  subscribe: (callback: ThemeChangeCallback) => () => void
}

export function createThemeCallbacks(): ThemeCallbacks {
  const callbacks = new Set<ThemeChangeCallback>()

  return {
    callbacks,
    notify: (currentTheme) => {
      callbacks.forEach((cb) => cb(currentTheme))
    },
    subscribe: (callback) => {
      callbacks.add(callback)
      return () => {
        callbacks.delete(callback)
      }
    }
  }
}
