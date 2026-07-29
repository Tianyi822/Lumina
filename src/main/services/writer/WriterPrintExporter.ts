import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdtempSync,
  openSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { WriterExportDocument, WriterResult } from '@shared/types/writer'
import type { WriterPrintHtmlRenderer } from './WriterPrintHtmlRenderer'

export interface WriterPrintPdfPort {
  /** 将完整离线 HTML 转为 PDF buffer */
  printHtmlToPdf: (html: string) => Promise<Buffer>
}

/**
 * PDF 导出：渲染离线 HTML → 隐藏窗口 printToPDF → 原子落盘。
 * 可通过 WriterPrintPdfPort 注入，便于测试失败清理路径。
 */
export class WriterPrintExporter {
  private readonly htmlRenderer: WriterPrintHtmlRenderer
  private readonly pdfPort: WriterPrintPdfPort

  constructor(htmlRenderer: WriterPrintHtmlRenderer, pdfPort?: WriterPrintPdfPort) {
    this.htmlRenderer = htmlRenderer
    this.pdfPort = pdfPort ?? createDefaultPdfPort()
  }

  async export(document: WriterExportDocument, outputPath: string): Promise<WriterResult<void>> {
    const rendered = this.htmlRenderer.render(document)
    if (!rendered.success || !rendered.data) {
      return {
        success: false,
        code: rendered.code ?? 'io_error',
        error: rendered.error ?? '打印 HTML 渲染失败'
      }
    }

    const tempPdfPath = `${outputPath}.tmp`

    try {
      if (existsSync(tempPdfPath)) {
        rmSync(tempPdfPath, { force: true })
      }

      const pdfBuffer = await this.pdfPort.printHtmlToPdf(rendered.data)
      if (!pdfBuffer || pdfBuffer.length < 4) {
        return { success: false, code: 'io_error', error: 'PDF 输出为空' }
      }

      const fd = openSync(tempPdfPath, 'w')
      try {
        writeFileSync(fd, pdfBuffer)
        fsyncSync(fd)
      } finally {
        closeSync(fd)
      }

      renameSync(tempPdfPath, outputPath)
      return { success: true }
    } catch (error) {
      if (existsSync(tempPdfPath)) {
        rmSync(tempPdfPath, { force: true })
      }
      return {
        success: false,
        code: 'io_error',
        error: error instanceof Error ? error.message : 'PDF 导出失败'
      }
    }
  }
}

function createDefaultPdfPort(): WriterPrintPdfPort {
  return {
    async printHtmlToPdf(html: string): Promise<Buffer> {
      // 延迟加载 electron，避免测试环境 stub 缺 BrowserWindow
      const { BrowserWindow, app } = await import('electron')
      const tempDir = mkdtempSync(join(app.getPath('temp') || tmpdir(), 'writer-print-'))
      const htmlPath = join(tempDir, 'print.html')
      writeFileSync(htmlPath, html, 'utf8')

      const window = new BrowserWindow({
        show: false,
        width: 1024,
        height: 768,
        webPreferences: {
          sandbox: true,
          nodeIntegration: false,
          contextIsolation: true,
          offscreen: true
        }
      })

      try {
        await window.loadFile(htmlPath)
        await waitForRendererIdle(window)
        const pdf = await window.webContents.printToPDF({
          printBackground: true,
          preferCSSPageSize: true,
          margins: { marginType: 'default' }
        })
        return Buffer.from(pdf)
      } finally {
        if (!window.isDestroyed()) {
          window.destroy()
        }
        rmSync(tempDir, { recursive: true, force: true })
      }
    }
  }
}

function waitForRendererIdle(window: {
  webContents: { executeJavaScript: (code: string) => Promise<unknown> }
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('打印页面渲染超时')), 15_000)
    window.webContents
      .executeJavaScript('document.fonts ? document.fonts.ready.then(() => true) : true')
      .then(() => {
        clearTimeout(timer)
        // 给 KaTeX 布局一帧缓冲
        setTimeout(resolve, 50)
      })
      .catch((error: unknown) => {
        clearTimeout(timer)
        reject(error)
      })
  })
}
