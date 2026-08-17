import './assets/main.css'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { shouldIgnoreGlobalErrorMessage } from './utils/benignBrowserErrors'
import { initI18n } from './i18n'

async function loadPlatformStyles(): Promise<void> {
  if (window.electron?.process?.platform === 'win32') {
    await import('./styles/platform-windows.css')
  }
}

async function bootstrap(): Promise<void> {
  await loadPlatformStyles()
  // Pinia 已完全迁移为 Zustand，不再需要 setActivePinia

  // i18n 资源同步内嵌，await 保证首帧即为正确语言；失败时按默认中文继续渲染
  try {
    await initI18n()
  } catch (error) {
    window.api.logger?.error('[main] i18n 初始化失败，按默认中文继续', {
      error: error instanceof Error ? error.message : String(error)
    })
  }

  const rootEl = document.getElementById('root')
  if (!rootEl) {
    document.body.innerHTML =
      '<pre style="color:red;padding:2rem;">Fatal: #root element not found</pre>'
    return
  }

  try {
    const root = createRoot(rootEl)
    root.render(
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    )
  } catch (error) {
    rootEl.innerHTML = `<pre style="color:red;padding:2rem;">React Error:\n${error instanceof Error ? error.stack : String(error)}</pre>`
  }
}

// Global error handlers
window.addEventListener('error', (event) => {
  if (shouldIgnoreGlobalErrorMessage(event.message)) {
    event.preventDefault()
    return
  }
  const rootEl = document.getElementById('root')
  if (rootEl) {
    rootEl.innerHTML = `<pre style="color:red;padding:2rem;">Global Error:\n${event.message}\n\n${event.filename}:${event.lineno}:${event.colno}\n\n${event.error?.stack || ''}</pre>`
  }
})

window.addEventListener('unhandledrejection', (event) => {
  const rootEl = document.getElementById('root')
  if (rootEl) {
    rootEl.innerHTML = `<pre style="color:red;padding:2rem;">Unhandled Promise Rejection:\n${String(event.reason)}\n\n${event.reason?.stack || ''}</pre>`
  }
})

void bootstrap()
