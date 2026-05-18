import './assets/main.css'
import { createRoot } from 'react-dom/client'
import App from './App'

function bootstrap(): void {
  const root = document.getElementById('root')
  if (!root) {
    throw new Error('Root element not found')
  }
  createRoot(root).render(<App />)
}

bootstrap()
