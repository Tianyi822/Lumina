import type { ProjectTemplate } from '@shared/types/sandbox'

/**
 * Vanilla 最小运行模板
 */
export const vanillaTemplate: ProjectTemplate = {
  id: 'vanilla-vite',
  name: 'Vanilla Vite Template',
  description: '基于原生 JavaScript 和 Vite 的最小可运行模板',
  framework: 'vanilla',
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
  "devDependencies": {
    "vite": "^7.2.6"
  }
}`
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
      content: `import './style.css'

const app = document.querySelector('#app')

if (app) {
  app.innerHTML = \`
    <main class="app-shell">
      <section class="hero-card">
        <p class="eyebrow">Sparrow Sandbox</p>
        <h1>{{projectName}}</h1>
        <p class="summary">原生 Vite 模板已经完成初始化，可以直接继续生成页面与脚本。</p>
        <div class="grid">
          <article>文件批量写入</article>
          <article>依赖自动安装</article>
          <article>开发服务启动</article>
        </div>
      </section>
    </main>
  \`
}
`
    },
    {
      path: 'src/style.css',
      content: `:root {
  color: #1e1f24;
  background:
    radial-gradient(circle at top right, rgba(14, 165, 233, 0.18), transparent 24%),
    linear-gradient(180deg, #f5f7fa 0%, #eef8f4 100%);
  font-family: "IBM Plex Sans", "PingFang SC", sans-serif;
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
  padding: 24px;
}

.hero-card {
  width: min(720px, 100%);
  padding: 40px;
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(30, 31, 36, 0.08);
  box-shadow: 0 22px 58px rgba(30, 31, 36, 0.1);
}

.eyebrow {
  margin: 0 0 12px;
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #0b7285;
}

h1 {
  margin: 0;
  font-size: clamp(34px, 5vw, 60px);
}

.summary {
  margin-top: 18px;
  font-size: 18px;
  line-height: 1.7;
  color: rgba(30, 31, 36, 0.74);
}

.grid {
  margin-top: 28px;
  display: grid;
  gap: 14px;
}

.grid article {
  padding: 16px 18px;
  border-radius: 18px;
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.12), rgba(34, 197, 94, 0.1));
}
`
    }
  ]
}
