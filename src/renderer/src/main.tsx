import './assets/main.css'
import { createRoot } from 'react-dom/client'
import App from './App'

async function loadPlatformStyles(): Promise<void> {
  if (window.electron?.process?.platform === 'win32') {
    await import('./styles/platform-windows.css')
  }
}

async function bootstrap(): Promise<void> {
  await loadPlatformStyles()

  const root = document.getElementById('root')
  if (!root) {
    throw new Error('Root element not found')
  }
  createRoot(root).render(<App />)
}

void bootstrap()
