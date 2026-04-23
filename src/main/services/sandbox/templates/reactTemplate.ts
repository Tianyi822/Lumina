import type { ProjectTemplate } from '@shared/types/sandbox'

/**
 * React 最小运行模板
 */
export const reactTemplate: ProjectTemplate = {
  id: 'react-vite',
  name: 'React Vite Template',
  description: '基于 React 和 Vite 的最小可运行模板',
  framework: 'react',
  packageManager: 'bun',
  installCommand: 'bun install',
  startCommand: 'bun run dev',
  buildCommand: 'bun run build',
  files: [
    {
      path: 'package.json',
      content: `{
  "name": "{{projectName}}",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0 --port 5173",
    "build": "vite build"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^5.0.0",
    "vite": "^7.2.6"
  }
}`
    },
    {
      path: 'vite.config.js',
      content: `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173
  }
})
`
    },
    {
      path: 'index.html',
      content: `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{{projectName}}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`
    },
    {
      path: 'src/main.jsx',
      content: `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './style.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
`
    },
    {
      path: 'src/App.jsx',
      content: `const steps = ['创建容器', '写入模板', '安装依赖', '启动预览']

export default function App() {
  return (
    <main className="app-shell">
      <section className="hero-card">
        <p className="eyebrow">Lumina Sandbox</p>
        <h1>{{projectName}}</h1>
        <p className="summary">
          React 模板已经准备完成，现在可以继续生成页面、组件和业务逻辑。
        </p>

        <div className="timeline">
          {steps.map((step, index) => (
            <div key={step} className="timeline-item">
              <span className="timeline-index">{String(index + 1).padStart(2, '0')}</span>
              <span>{step}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
`
    },
    {
      path: 'src/style.css',
      content: `:root {
  color: #1d2433;
  background:
    radial-gradient(circle at 20% 0%, rgba(249, 115, 22, 0.18), transparent 28%),
    linear-gradient(180deg, #fff8ef 0%, #eef4ff 100%);
  font-family: "SF Pro Display", "PingFang SC", "Segoe UI", sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
}

.app-shell {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 28px;
}

.hero-card {
  width: min(760px, 100%);
  padding: 42px;
  border-radius: 30px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(29, 36, 51, 0.08);
  box-shadow: 0 28px 72px rgba(29, 36, 51, 0.12);
}

.eyebrow {
  margin: 0 0 10px;
  color: #c15c19;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  font-size: 12px;
}

h1 {
  margin: 0;
  font-size: clamp(34px, 5vw, 58px);
  line-height: 1.02;
}

.summary {
  margin: 18px 0 0;
  font-size: 18px;
  line-height: 1.7;
  color: rgba(29, 36, 51, 0.76);
}

.timeline {
  margin-top: 28px;
  display: grid;
  gap: 14px;
}

.timeline-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 18px;
  border-radius: 18px;
  background: linear-gradient(135deg, rgba(249, 115, 22, 0.11), rgba(59, 130, 246, 0.08));
}

.timeline-index {
  display: inline-grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  font-size: 13px;
  font-weight: 600;
}
`
    }
  ]
}
