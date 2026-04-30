import './assets/main.css'

import { createApp } from 'vue'
import App from './App.vue'
import { pinia } from './stores'

async function loadPlatformStyles(): Promise<void> {
  if (window.electron?.process?.platform === 'win32') {
    await import('./styles/platform-windows.css')
  }
}

async function bootstrap(): Promise<void> {
  await loadPlatformStyles()

  const app = createApp(App)

  // 注册 Pinia
  app.use(pinia)

  app.mount('#app')
}

void bootstrap()
