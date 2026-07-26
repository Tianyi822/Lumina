import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import katex from 'katex'
import type { WriterResult } from '@shared/types/writer'

const require = createRequire(import.meta.url)

export interface WriterFormulaCapturePort {
  captureHtmlToPng: (html: string) => Promise<Buffer>
}

export interface WriterFormulaRasterizerOptions {
  captureHtmlToPng?: WriterFormulaCapturePort['captureHtmlToPng']
  katexCssPath?: string
}

/**
 * 将 LaTeX 公式栅格化为 PNG。
 * 默认经隐藏 BrowserWindow + capturePage；测试可注入 captureHtmlToPng。
 */
export class WriterFormulaRasterizer {
  private readonly captureHtmlToPng: WriterFormulaCapturePort['captureHtmlToPng']
  private readonly katexCssPath: string

  constructor(options: WriterFormulaRasterizerOptions = {}) {
    this.captureHtmlToPng = options.captureHtmlToPng ?? captureHtmlWithHiddenWindow
    this.katexCssPath = options.katexCssPath ?? resolveKatexCssPath()
  }

  async rasterize(latex: string, displayMode: boolean): Promise<WriterResult<Buffer>> {
    const trimmed = latex.trim()
    if (!trimmed) {
      return { success: false, code: 'invalid_input', error: '公式内容为空' }
    }

    try {
      const html = this.buildFormulaHtml(trimmed, displayMode)
      const png = await this.captureHtmlToPng(html)
      if (!isPngBuffer(png)) {
        return { success: false, code: 'io_error', error: '公式截图未返回有效 PNG' }
      }
      return { success: true, data: png }
    } catch (error) {
      return {
        success: false,
        code: 'io_error',
        error: error instanceof Error ? error.message : '公式栅格化失败'
      }
    }
  }

  /** 构造离线公式 HTML：内联 KaTeX CSS + 严格 CSP，无网络依赖。 */
  buildFormulaHtml(latex: string, displayMode: boolean): string {
    let rendered: string
    try {
      rendered = katex.renderToString(latex, {
        displayMode,
        throwOnError: false,
        output: 'htmlAndMathml',
        strict: 'ignore'
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      rendered = `<span class="katex-error">${escapeHtml(latex)} (${escapeHtml(message)})</span>`
    }

    const katexCss = readFileSync(this.katexCssPath, 'utf8')
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:" />
<style>
${katexCss}
html, body {
  margin: 0;
  padding: 0;
  background: #ffffff;
  color: #111111;
}
body {
  display: inline-block;
  padding: 8px;
}
.formula-root {
  display: inline-block;
  line-height: 1.2;
  white-space: nowrap;
}
.katex-error {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: #111111;
  white-space: pre-wrap;
}
</style>
</head>
<body>
<div class="formula-root" id="formula">${rendered}</div>
</body>
</html>`
  }
}

function resolveKatexCssPath(): string {
  return join(dirname(require.resolve('katex/package.json')), 'dist', 'katex.min.css')
}

function isPngBuffer(png: Buffer | undefined): png is Buffer {
  return Boolean(png && png.length >= 8 && png[0] === 0x89 && png[1] === 0x50)
}

async function captureHtmlWithHiddenWindow(html: string): Promise<Buffer> {
  // 延迟加载，避免测试环境 electron stub 缺少 BrowserWindow
  const { BrowserWindow } = await import('electron')
  const window = new BrowserWindow({
    show: false,
    width: 1200,
    height: 800,
    webPreferences: {
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
      offscreen: true
    }
  })

  try {
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    await waitForRendererIdle(window)

    const bounds = (await window.webContents.executeJavaScript(`
      (() => {
        const el = document.getElementById('formula')
        if (!el) return null
        const rect = el.getBoundingClientRect()
        return {
          x: Math.max(0, Math.floor(rect.x)),
          y: Math.max(0, Math.floor(rect.y)),
          width: Math.max(1, Math.ceil(rect.width)),
          height: Math.max(1, Math.ceil(rect.height))
        }
      })()
    `)) as { x: number; y: number; width: number; height: number } | null

    if (!bounds) {
      throw new Error('未找到公式渲染节点')
    }

    const image = await window.webContents.capturePage(bounds)
    const size = image.getSize()
    const scale = 3
    const resized = image.resize({
      width: Math.max(1, size.width * scale),
      height: Math.max(1, size.height * scale),
      quality: 'best'
    })
    return resized.toPNG()
  } finally {
    if (!window.isDestroyed()) {
      window.destroy()
    }
  }
}

function waitForRendererIdle(window: {
  webContents: { executeJavaScript: (code: string) => Promise<unknown> }
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('公式渲染超时')), 8_000)
    window.webContents
      .executeJavaScript('document.fonts ? document.fonts.ready.then(() => true) : true')
      .then(() => {
        clearTimeout(timer)
        resolve()
      })
      .catch((error: unknown) => {
        clearTimeout(timer)
        reject(error)
      })
  })
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
