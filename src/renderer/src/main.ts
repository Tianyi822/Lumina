import './assets/main.css'

import { createApp } from 'vue'
import App from './App.vue'

async function loadPlatformStyles(): Promise<void> {
  if (window.electron?.process?.platform === 'win32') {
    await import('./styles/platform-windows.css')
  }
}

async function bootstrap(): Promise<void> {
  await loadPlatformStyles()

  const app = createApp(App)

  // Pinia 已完全迁移为 Zustand，不再需要 app.use(pinia)

  app.mount('#app')
}

void bootstrap()
