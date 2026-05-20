import './assets/main.css'

import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

async function loadPlatformStyles(): Promise<void> {
  if (window.electron?.process?.platform === 'win32') {
    await import('./styles/platform-windows.css')
  }
}

async function bootstrap(): Promise<void> {
  await loadPlatformStyles()

  const rootEl = document.getElementById('app')
  if (!rootEl) {
    document.body.innerHTML =
      '<pre style="color:red;padding:2rem;">Fatal: #app element not found</pre>'
    return
  }

  try {
    const root = createRoot(rootEl)
    root.render(createElement(App))
  } catch (error) {
    rootEl.innerHTML = `<pre style="color:red;padding:2rem;">React Error:\n${error instanceof Error ? error.stack : String(error)}</pre>`
  }
}

window.addEventListener('error', (event) => {
  const rootEl = document.getElementById('app')
  if (rootEl) {
    rootEl.innerHTML = `<pre style="color:red;padding:2rem;">Global Error:\n${event.message}\n\n${event.filename}:${event.lineno}:${event.colno}\n\n${event.error?.stack || ''}</pre>`
  }
})

window.addEventListener('unhandledrejection', (event) => {
  const rootEl = document.getElementById('app')
  if (rootEl) {
    rootEl.innerHTML = `<pre style="color:red;padding:2rem;">Unhandled Promise Rejection:\n${String(event.reason)}\n\n${event.reason?.stack || ''}</pre>`
  }
})

void bootstrap()
