import { BrowserWindow } from 'electron'
import MarkdownIt from 'markdown-it'

/**
 * PDF 导出器
 */
export class PdfExporter {
  private readonly markdown = new MarkdownIt({
    html: false,
    breaks: true,
    linkify: true,
    typographer: true
  })

  /**
   * 构建 PDF 文档
   */
  async buildDocument(content: string, title: string): Promise<Buffer> {
    const pdfWindow = new BrowserWindow({
      show: false,
      width: 1200,
      height: 1600,
      autoHideMenuBar: true,
      webPreferences: {
        sandbox: false
      }
    })

    try {
      const html = this.buildPdfHtml(content, title)
      const htmlDataUrl = `data:text/html;base64,${Buffer.from(html, 'utf-8').toString('base64')}`

      await pdfWindow.loadURL(htmlDataUrl)
      await pdfWindow.webContents.executeJavaScript(
        'document.fonts ? document.fonts.ready.then(() => true) : Promise.resolve(true)',
        true
      )

      const pdfBuffer = await pdfWindow.webContents.printToPDF({
        printBackground: true,
        preferCSSPageSize: true
      })

      return Buffer.from(pdfBuffer)
    } finally {
      if (!pdfWindow.isDestroyed()) {
        pdfWindow.close()
      }
    }
  }

  /**
   * 构建 PDF HTML
   */
  private buildPdfHtml(content: string, title: string): string {
    const renderedHtml = this.markdown.render(content)
    const safeTitle = this.escapeHtml(title)

    return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${safeTitle}</title>
    <style>
      @page {
        size: A4;
        margin: 18mm 16mm;
      }

      :root {
        color-scheme: light;
      }

      body {
        margin: 0;
        color: #1f2937;
        font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", -apple-system,
          BlinkMacSystemFont, sans-serif;
        font-size: 14px;
        line-height: 1.72;
        background: #ffffff;
      }

      .document {
        width: 100%;
      }

      .markdown-body {
        width: 100%;
        word-break: break-word;
      }

      .markdown-body > *:first-child {
        margin-top: 0;
      }

      .markdown-body > *:last-child {
        margin-bottom: 0;
      }

      h1,
      h2,
      h3,
      h4,
      h5,
      h6 {
        color: #0f172a;
        font-weight: 700;
        line-height: 1.35;
        margin: 1.2em 0 0.65em;
        page-break-after: avoid;
      }

      h1 {
        font-size: 30px;
      }

      h2 {
        font-size: 24px;
      }

      h3 {
        font-size: 20px;
      }

      p,
      ul,
      ol,
      blockquote,
      pre,
      table {
        margin: 0 0 1em;
      }

      ul,
      ol {
        padding-left: 1.5em;
      }

      li + li {
        margin-top: 0.35em;
      }

      blockquote {
        margin-left: 0;
        padding: 0.85em 1em;
        border-left: 4px solid #94a3b8;
        background: #f8fafc;
        color: #475569;
      }

      pre,
      code {
        font-family: "SFMono-Regular", Menlo, Consolas, monospace;
      }

      code {
        padding: 0.1em 0.35em;
        border-radius: 4px;
        background: #f1f5f9;
        font-size: 0.92em;
      }

      pre {
        padding: 14px 16px;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        background: #f8fafc;
        overflow: hidden;
        white-space: pre-wrap;
      }

      pre code {
        padding: 0;
        background: transparent;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }

      th,
      td {
        border: 1px solid #cbd5e1;
        padding: 10px 12px;
        vertical-align: top;
        text-align: left;
      }

      th {
        background: #e8eef3;
        font-weight: 700;
      }

      hr {
        border: none;
        border-top: 1px solid #cbd5e1;
        margin: 1.4em 0;
      }

      img {
        max-width: 100%;
      }
    </style>
  </head>
  <body>
    <div class="document">
      <div class="markdown-body">${renderedHtml}</div>
    </div>
  </body>
</html>`
  }

  /**
   * HTML 转义
   */
  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }
}
