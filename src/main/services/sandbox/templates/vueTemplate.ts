import type { ProjectTemplate } from '@shared/types/sandbox'

/**
 * Vue 最小运行模板
 */
export const vueTemplate: ProjectTemplate = {
  id: 'vue-vite',
  name: 'Vue Vite Template',
  description: '基于 Vue 3 和 Vite 的最小可运行模板',
  framework: 'vue',
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
    "vue": "^3.5.25"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^6.0.2",
    "vite": "^7.2.6"
  }
}`
    },
    {
      path: 'vite.config.js',
      content: `import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
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
    <div id="app"></div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
`
    },
    {
      path: 'src/main.js',
      content: `import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

createApp(App).mount('#app')
`
    },
    {
      path: 'src/App.vue',
      content: `<script setup>
const features = ['模板初始化', '依赖安装', '开发服务器启动']
</script>

<template>
  <main class="app-shell">
    <section class="hero-card">
      <p class="eyebrow">Sparrow Sandbox</p>
      <h1>{{projectName}}</h1>
      <p class="summary">Vue 模板已经在 Docker 沙箱中成功启动，你可以直接继续让 AI 写页面和组件。</p>

      <ul class="feature-list">
        <li v-for="feature in features" :key="feature">{{ feature }}</li>
      </ul>
    </section>
  </main>
</template>
`
    },
    {
      path: 'src/style.css',
      content: `:root {
  color: #132238;
  background:
    radial-gradient(circle at top, rgba(34, 197, 94, 0.22), transparent 32%),
    linear-gradient(160deg, #f4f8f2 0%, #edf7ff 100%);
  font-family: "Avenir Next", "PingFang SC", "Hiragino Sans GB", sans-serif;
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
  padding: 32px;
}

.hero-card {
  width: min(680px, 100%);
  padding: 40px;
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid rgba(19, 34, 56, 0.08);
  box-shadow: 0 24px 60px rgba(26, 59, 93, 0.12);
  backdrop-filter: blur(10px);
}

.eyebrow {
  margin: 0 0 12px;
  font-size: 13px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #1f7a45;
}

h1 {
  margin: 0;
  font-size: clamp(36px, 6vw, 56px);
  line-height: 1.05;
}

.summary {
  margin: 20px 0 0;
  font-size: 18px;
  line-height: 1.7;
  color: rgba(19, 34, 56, 0.78);
}

.feature-list {
  margin: 28px 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 12px;
}

.feature-list li {
  padding: 14px 16px;
  border-radius: 16px;
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.12), rgba(59, 130, 246, 0.08));
}
`
    }
  ]
}
