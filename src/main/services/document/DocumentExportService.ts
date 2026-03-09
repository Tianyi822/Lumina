import { BrowserWindow } from 'electron'
import JSZip from 'jszip'
import MarkdownIt from 'markdown-it'
import { logger } from '@main/services/logger'
import type { ExportFormat, ExportMessageRequest, ExportMessageResult } from '@shared/types'

interface InlineSegment {
  text: string
  bold?: boolean
  italic?: boolean
  code?: boolean
  link?: string
}

type ExportBlock =
  | {
      type: 'heading'
      level: number
      segments: InlineSegment[]
    }
  | {
      type: 'paragraph'
      segments: InlineSegment[]
    }
  | {
      type: 'blockquote'
      segments: InlineSegment[]
    }
  | {
      type: 'list'
      items: Array<{
        level: number
        ordered: boolean
        marker: string
        segments: InlineSegment[]
      }>
    }
  | {
      type: 'code'
      language?: string
      lines: string[]
    }
  | {
      type: 'table'
      headers: InlineSegment[][]
      rows: InlineSegment[][][]
    }
  | {
      type: 'separator'
    }

interface ParagraphRunStyle {
  bold?: boolean
  italic?: boolean
  color?: string
  fontSize?: number
  monospace?: boolean
}

interface WordParagraphOptions {
  indentLeft?: number
  indentHanging?: number
  spacingBefore?: number
  spacingAfter?: number
  shadeFill?: string
  borderLeftColor?: string
  runStyle?: ParagraphRunStyle
}

const DEFAULT_EXPORT_TITLE = '教案内容'
const DEFAULT_WORD_FONT = 'PingFang SC'
const DEFAULT_CODE_FONT = 'Menlo'
const WORD_PAGE_WIDTH = 9360

/**
 * 文档导出服务
 * 负责将 AI 消息内容导出为 Markdown、Word、PDF、TXT
 */
export class DocumentExportService {
  private readonly markdown = new MarkdownIt({
    html: false,
    breaks: true,
    linkify: true,
    typographer: true
  })

  /**
   * 导出消息内容
   */
  async exportMessage(request: ExportMessageRequest): Promise<ExportMessageResult> {
    const normalizedContent = request.content.replace(/\r\n?/g, '\n').trim()
    const fileName = this.buildFileName(
      request.title,
      normalizedContent,
      request.format,
      request.timestamp
    )

    try {
      if (!normalizedContent) {
        return {
          success: false,
          error: '导出内容为空，无法生成文件'
        }
      }

      let buffer: Buffer

      switch (request.format) {
        case 'markdown':
          buffer = Buffer.from(normalizedContent, 'utf-8')
          break
        case 'txt':
          buffer = Buffer.from(this.buildPlainText(normalizedContent), 'utf-8')
          break
        case 'word':
          buffer = await this.buildWordDocument(normalizedContent, request)
          break
        case 'pdf':
          buffer = await this.buildPdfDocument(normalizedContent, request)
          break
        default:
          return {
            success: false,
            error: `不支持的导出格式: ${request.format}`
          }
      }

      logger.info('消息导出成功', 'main', {
        format: request.format,
        fileName,
        size: buffer.length
      })

      return {
        success: true,
        data: Array.from(buffer),
        fileName,
        mimeType: this.getMimeType(request.format)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('消息导出失败', 'main', {
        format: request.format,
        error: errorMessage
      })

      return {
        success: false,
        error: `导出失败: ${errorMessage}`
      }
    }
  }

  // ==================== 文本构建 ====================

  /**
   * 构建 TXT 内容
   */
  private buildPlainText(content: string): string {
    const blocks = this.parseMarkdownBlocks(content)
    const sections = blocks.map((block) => {
      switch (block.type) {
        case 'heading':
          return this.renderPlainHeading(block.level, this.segmentsToText(block.segments))
        case 'paragraph':
          return this.segmentsToText(block.segments)
        case 'blockquote':
          return this.segmentsToText(block.segments)
            .split('\n')
            .map((line) => `> ${line}`)
            .join('\n')
        case 'list':
          return block.items
            .map((item) => {
              const prefix = item.ordered ? item.marker : '•'
              return `${'  '.repeat(item.level)}${prefix} ${this.segmentsToText(item.segments)}`
            })
            .join('\n')
        case 'code':
          return ['```' + (block.language || ''), ...block.lines, '```'].join('\n')
        case 'table': {
          const headerLine = block.headers.map((cell) => this.segmentsToText(cell)).join(' | ')
          const separator = block.headers.map(() => '---').join(' | ')
          const rows = block.rows.map((row) =>
            row.map((cell) => this.segmentsToText(cell)).join(' | ')
          )
          return [headerLine, separator, ...rows].join('\n')
        }
        case 'separator':
          return '----------------------------------------'
      }
    })

    return sections.join('\n\n').trim() + '\n'
  }

  /**
   * 渲染纯文本标题
   */
  private renderPlainHeading(level: number, text: string): string {
    if (level === 1) {
      return `${text}\n${'='.repeat(Math.max(3, Math.min(40, text.length || 3)))}`
    }

    if (level === 2) {
      return `${text}\n${'-'.repeat(Math.max(3, Math.min(40, text.length || 3)))}`
    }

    return `${'#'.repeat(level)} ${text}`
  }

  // ==================== Word 导出 ====================

  /**
   * 构建 Word 文档
   */
  private async buildWordDocument(content: string, request: ExportMessageRequest): Promise<Buffer> {
    const blocks = this.parseMarkdownBlocks(content)
    const zip = new JSZip()
    const createdAt = new Date().toISOString()
    const documentXml = this.buildWordDocumentXml(blocks)

    zip.file('[Content_Types].xml', this.buildContentTypesXml())
    zip.folder('_rels')?.file('.rels', this.buildRootRelationshipsXml())
    zip.folder('docProps')?.file('app.xml', this.buildAppPropertiesXml())
    zip.folder('docProps')?.file('core.xml', this.buildCorePropertiesXml(request.title, createdAt))
    zip.folder('word')?.file('document.xml', documentXml)

    return zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE'
    })
  }

  /**
   * 构建 Word 主文档 XML
   */
  private buildWordDocumentXml(blocks: ExportBlock[]): string {
    const bodyXml = blocks
      .map((block) => {
        switch (block.type) {
          case 'heading':
            return this.renderWordParagraphXml(block.segments, {
              spacingBefore: block.level === 1 ? 240 : 180,
              spacingAfter: 120,
              runStyle: {
                bold: true,
                fontSize: this.getHeadingFontSize(block.level)
              }
            })
          case 'paragraph':
            return this.renderWordParagraphXml(block.segments, {
              spacingAfter: 120
            })
          case 'blockquote':
            return this.renderWordParagraphXml(block.segments, {
              indentLeft: 360,
              spacingAfter: 120,
              shadeFill: 'F6F8FA',
              borderLeftColor: '94A3B8',
              runStyle: {
                color: '475569'
              }
            })
          case 'list':
            return block.items
              .map((item) => {
                const markerPrefix = item.ordered ? `${item.marker} ` : '• '
                return this.renderWordParagraphXml([{ text: markerPrefix }, ...item.segments], {
                  indentLeft: 360 + item.level * 360,
                  indentHanging: 240,
                  spacingAfter: 80
                })
              })
              .join('')
          case 'code':
            return block.lines
              .map((line) =>
                this.renderWordParagraphXml(
                  [
                    {
                      text: line || ' ',
                      code: true
                    }
                  ],
                  {
                    indentLeft: 240,
                    spacingAfter: 20,
                    shadeFill: 'F3F4F6',
                    runStyle: {
                      monospace: true,
                      fontSize: 20
                    }
                  }
                )
              )
              .join('')
          case 'table':
            return this.renderWordTableXml(block.headers, block.rows)
          case 'separator':
            return this.renderWordParagraphXml([{ text: '────────────────────────' }], {
              spacingBefore: 60,
              spacingAfter: 120,
              runStyle: {
                color: 'CBD5E1'
              }
            })
        }
      })
      .join('')

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${bodyXml}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838" />
      <w:pgMar
        w:top="1440"
        w:right="1440"
        w:bottom="1440"
        w:left="1440"
        w:header="720"
        w:footer="720"
        w:gutter="0"
      />
    </w:sectPr>
  </w:body>
</w:document>`
  }

  /**
   * 渲染 Word 段落
   */
  private renderWordParagraphXml(
    segments: InlineSegment[],
    options: WordParagraphOptions = {}
  ): string {
    const paragraphProps: string[] = []

    if (options.indentLeft !== undefined || options.indentHanging !== undefined) {
      const indentParts: string[] = []
      if (options.indentLeft !== undefined) {
        indentParts.push(`w:left="${options.indentLeft}"`)
      }
      if (options.indentHanging !== undefined) {
        indentParts.push(`w:hanging="${options.indentHanging}"`)
      }
      paragraphProps.push(`<w:ind ${indentParts.join(' ')} />`)
    }

    if (options.spacingBefore !== undefined || options.spacingAfter !== undefined) {
      paragraphProps.push(
        `<w:spacing w:before="${options.spacingBefore ?? 0}" w:after="${
          options.spacingAfter ?? 0
        }" />`
      )
    }

    if (options.shadeFill) {
      paragraphProps.push(`<w:shd w:val="clear" w:fill="${options.shadeFill}" />`)
    }

    if (options.borderLeftColor) {
      paragraphProps.push(
        `<w:pBdr><w:left w:val="single" w:sz="16" w:space="8" w:color="${options.borderLeftColor}" /></w:pBdr>`
      )
    }

    const runsXml = this.renderWordRunsXml(segments, options.runStyle)

    return `<w:p>${paragraphProps.length > 0 ? `<w:pPr>${paragraphProps.join('')}</w:pPr>` : ''}${
      runsXml || this.renderEmptyWordRunXml()
    }</w:p>`
  }

  /**
   * 渲染 Word 运行内容
   */
  private renderWordRunsXml(
    segments: InlineSegment[],
    paragraphStyle: ParagraphRunStyle = {}
  ): string {
    return segments
      .map((segment) => this.renderWordRunXml(segment, paragraphStyle))
      .filter(Boolean)
      .join('')
  }

  /**
   * 渲染单个 Word 运行
   */
  private renderWordRunXml(segment: InlineSegment, paragraphStyle: ParagraphRunStyle = {}): string {
    if (!segment.text) return ''

    const runProps: string[] = []
    const isBold = paragraphStyle.bold || segment.bold
    const isItalic = paragraphStyle.italic || segment.italic
    const color = segment.link ? '0563C1' : paragraphStyle.color
    const fontSize = paragraphStyle.fontSize
    const useMonospace = paragraphStyle.monospace || segment.code

    if (isBold) {
      runProps.push('<w:b />')
    }

    if (isItalic) {
      runProps.push('<w:i />')
    }

    if (useMonospace) {
      runProps.push(
        `<w:rFonts w:ascii="${DEFAULT_CODE_FONT}" w:hAnsi="${DEFAULT_CODE_FONT}" w:eastAsia="${DEFAULT_CODE_FONT}" />`
      )
    } else {
      runProps.push(
        `<w:rFonts w:ascii="${DEFAULT_WORD_FONT}" w:hAnsi="${DEFAULT_WORD_FONT}" w:eastAsia="${DEFAULT_WORD_FONT}" />`
      )
    }

    if (color) {
      runProps.push(`<w:color w:val="${color}" />`)
    }

    if (segment.link) {
      runProps.push('<w:u w:val="single" />')
    }

    if (fontSize) {
      runProps.push(`<w:sz w:val="${fontSize}" />`)
      runProps.push(`<w:szCs w:val="${fontSize}" />`)
    }

    if (segment.code) {
      runProps.push('<w:highlight w:val="lightGray" />')
    }

    const textXml = segment.text
      .split('\n')
      .map((part) => `<w:t xml:space="preserve">${this.escapeXml(part)}</w:t>`)
      .join('<w:br />')

    return `<w:r>${runProps.length > 0 ? `<w:rPr>${runProps.join('')}</w:rPr>` : ''}${textXml}</w:r>`
  }

  /**
   * 渲染 Word 空运行，避免空段落丢失
   */
  private renderEmptyWordRunXml(): string {
    return '<w:r><w:t xml:space="preserve"> </w:t></w:r>'
  }

  /**
   * 渲染 Word 表格
   */
  private renderWordTableXml(headers: InlineSegment[][], rows: InlineSegment[][][]): string {
    const columnCount = Math.max(1, headers.length, ...rows.map((row) => row.length))
    const cellWidth = Math.floor(WORD_PAGE_WIDTH / columnCount)
    const tableRows = [headers, ...rows]

    return `<w:tbl>
      <w:tblPr>
        <w:tblW w:w="0" w:type="auto" />
        <w:tblBorders>
          <w:top w:val="single" w:sz="8" w:color="CBD5E1" />
          <w:left w:val="single" w:sz="8" w:color="CBD5E1" />
          <w:bottom w:val="single" w:sz="8" w:color="CBD5E1" />
          <w:right w:val="single" w:sz="8" w:color="CBD5E1" />
          <w:insideH w:val="single" w:sz="8" w:color="E2E8F0" />
          <w:insideV w:val="single" w:sz="8" w:color="E2E8F0" />
        </w:tblBorders>
      </w:tblPr>
      <w:tblGrid>
        ${Array.from({ length: columnCount }, () => `<w:gridCol w:w="${cellWidth}" />`).join('')}
      </w:tblGrid>
      ${tableRows
        .map((row, rowIndex) => {
          const cells = Array.from({ length: columnCount }, (_, cellIndex) => row[cellIndex] || [])
          return `<w:tr>${cells
            .map((cell) => {
              const contentXml = this.renderWordParagraphXml(cell, {
                spacingAfter: 60,
                runStyle: rowIndex === 0 ? { bold: true } : undefined
              })

              return `<w:tc>
                <w:tcPr>
                  <w:tcW w:w="${cellWidth}" w:type="dxa" />
                  ${rowIndex === 0 ? '<w:shd w:val="clear" w:fill="E8EEF3" />' : ''}
                </w:tcPr>
                ${contentXml}
              </w:tc>`
            })
            .join('')}</w:tr>`
        })
        .join('')}
    </w:tbl>`
  }

  /**
   * 获取标题字号
   */
  private getHeadingFontSize(level: number): number {
    switch (level) {
      case 1:
        return 34
      case 2:
        return 30
      case 3:
        return 26
      case 4:
        return 24
      default:
        return 22
    }
  }

  /**
   * 构建 Content Types XML
   */
  private buildContentTypesXml(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />
  <Default Extension="xml" ContentType="application/xml" />
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml" />
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml" />
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml" />
</Types>`
  }

  /**
   * 构建根关系 XML
   */
  private buildRootRelationshipsXml(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml" />
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml" />
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml" />
</Relationships>`
  }

  /**
   * 构建应用属性 XML
   */
  private buildAppPropertiesXml(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties
  xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
  xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"
>
  <Application>Sparrow Manus</Application>
</Properties>`
  }

  /**
   * 构建核心属性 XML
   */
  private buildCorePropertiesXml(title: string | undefined, createdAt: string): string {
    const safeTitle = this.escapeXml(title || DEFAULT_EXPORT_TITLE)

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties
  xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:dcterms="http://purl.org/dc/terms/"
  xmlns:dcmitype="http://purl.org/dc/dcmitype/"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
>
  <dc:title>${safeTitle}</dc:title>
  <dc:creator>Sparrow Manus</dc:creator>
  <cp:lastModifiedBy>Sparrow Manus</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${createdAt}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${createdAt}</dcterms:modified>
</cp:coreProperties>`
  }

  // ==================== PDF 导出 ====================

  /**
   * 构建 PDF 文档
   */
  private async buildPdfDocument(content: string, request: ExportMessageRequest): Promise<Buffer> {
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
      const html = this.buildPdfHtml(content, request)
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
  private buildPdfHtml(content: string, request: ExportMessageRequest): string {
    const renderedHtml = this.markdown.render(content)
    const safeTitle = this.escapeHtml(
      this.deriveBaseTitle(request.title, content) || DEFAULT_EXPORT_TITLE
    )

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

  // ==================== Markdown 解析 ====================

  /**
   * 解析 Markdown 为导出块
   */
  private parseMarkdownBlocks(content: string): ExportBlock[] {
    const lines = content.replace(/\r\n?/g, '\n').split('\n')
    const blocks: ExportBlock[] = []
    let paragraphLines: string[] = []
    let index = 0

    const flushParagraph = (): void => {
      const paragraph = paragraphLines.join('\n').trim()
      if (paragraph) {
        blocks.push({
          type: 'paragraph',
          segments: this.parseInlineSegments(paragraph)
        })
      }
      paragraphLines = []
    }

    while (index < lines.length) {
      const line = lines[index]

      if (!line.trim()) {
        flushParagraph()
        index++
        continue
      }

      const fenceMatch = line.match(/^(```+|~~~+)\s*([\w-]+)?\s*$/)
      if (fenceMatch) {
        flushParagraph()
        const fence = fenceMatch[1]
        const language = fenceMatch[2]
        const codeLines: string[] = []
        index++

        while (index < lines.length && !lines[index].startsWith(fence)) {
          codeLines.push(lines[index])
          index++
        }

        if (index < lines.length) {
          index++
        }

        blocks.push({
          type: 'code',
          language,
          lines: codeLines.length > 0 ? codeLines : ['']
        })
        continue
      }

      const headingMatch = line.match(/^(#{1,6})\s+(.*)$/)
      if (headingMatch) {
        flushParagraph()
        blocks.push({
          type: 'heading',
          level: headingMatch[1].length,
          segments: this.parseInlineSegments(headingMatch[2].trim())
        })
        index++
        continue
      }

      if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
        flushParagraph()
        blocks.push({ type: 'separator' })
        index++
        continue
      }

      if (
        index + 1 < lines.length &&
        line.includes('|') &&
        this.isMarkdownTableSeparator(lines[index + 1])
      ) {
        flushParagraph()
        const headerCells = this.splitMarkdownTableRow(line).map((cell) =>
          this.parseInlineSegments(cell)
        )
        index += 2
        const rowCells: InlineSegment[][][] = []

        while (index < lines.length && lines[index].trim() && lines[index].includes('|')) {
          rowCells.push(
            this.splitMarkdownTableRow(lines[index]).map((cell) => this.parseInlineSegments(cell))
          )
          index++
        }

        blocks.push({
          type: 'table',
          headers: headerCells,
          rows: rowCells
        })
        continue
      }

      const blockquoteMatch = line.match(/^\s*>\s?(.*)$/)
      if (blockquoteMatch) {
        flushParagraph()
        const quoteLines: string[] = []

        while (index < lines.length) {
          const current = lines[index]
          const currentQuoteMatch = current.match(/^\s*>\s?(.*)$/)
          if (currentQuoteMatch) {
            quoteLines.push(currentQuoteMatch[1])
            index++
            continue
          }

          if (!current.trim()) {
            quoteLines.push('')
            index++
            continue
          }

          break
        }

        blocks.push({
          type: 'blockquote',
          segments: this.parseInlineSegments(quoteLines.join('\n').trim())
        })
        continue
      }

      if (this.matchListItem(line)) {
        flushParagraph()
        const items: Array<{
          level: number
          ordered: boolean
          marker: string
          segments: InlineSegment[]
        }> = []

        while (index < lines.length) {
          const listMatch = this.matchListItem(lines[index])
          if (listMatch) {
            items.push({
              level: listMatch.level,
              ordered: listMatch.ordered,
              marker: listMatch.marker,
              segments: this.parseInlineSegments(listMatch.content)
            })
            index++
            continue
          }

          if (items.length > 0 && lines[index].trim() && !this.isMarkdownBlockStart(lines, index)) {
            const lastItem = items[items.length - 1]
            lastItem.segments = this.parseInlineSegments(
              `${this.segmentsToText(lastItem.segments)}\n${lines[index].trim()}`
            )
            index++
            continue
          }

          break
        }

        blocks.push({
          type: 'list',
          items
        })
        continue
      }

      paragraphLines.push(line)
      index++
    }

    flushParagraph()
    return blocks
  }

  /**
   * 解析 Markdown 行内样式
   */
  private parseInlineSegments(
    text: string,
    inherited: Omit<InlineSegment, 'text'> = {}
  ): InlineSegment[] {
    if (!text) return []

    const segments: InlineSegment[] = []
    let index = 0

    const pushPlainText = (value: string): void => {
      if (!value) return
      segments.push({
        text: value,
        ...inherited
      })
    }

    while (index < text.length) {
      if (text[index] === '`') {
        const closingIndex = text.indexOf('`', index + 1)
        if (closingIndex > index + 1) {
          segments.push({
            text: text.slice(index + 1, closingIndex),
            ...inherited,
            code: true
          })
          index = closingIndex + 1
          continue
        }
      }

      if (text[index] === '[') {
        const labelEnd = text.indexOf('](', index)
        if (labelEnd !== -1) {
          const urlEnd = text.indexOf(')', labelEnd + 2)
          if (urlEnd !== -1) {
            const label = text.slice(index + 1, labelEnd)
            const url = text.slice(labelEnd + 2, urlEnd)
            segments.push(
              ...this.parseInlineSegments(label, {
                ...inherited,
                link: url
              })
            )
            index = urlEnd + 1
            continue
          }
        }
      }

      if (text.startsWith('**', index) || text.startsWith('__', index)) {
        const delimiter = text.slice(index, index + 2)
        const closingIndex = text.indexOf(delimiter, index + 2)
        if (closingIndex > index + 2) {
          const content = text.slice(index + 2, closingIndex)
          segments.push(
            ...this.parseInlineSegments(content, {
              ...inherited,
              bold: true
            })
          )
          index = closingIndex + 2
          continue
        }
      }

      if (text[index] === '*' || text[index] === '_') {
        const delimiter = text[index]
        const closingIndex = text.indexOf(delimiter, index + 1)
        if (closingIndex > index + 1) {
          const content = text.slice(index + 1, closingIndex)
          segments.push(
            ...this.parseInlineSegments(content, {
              ...inherited,
              italic: true
            })
          )
          index = closingIndex + 1
          continue
        }
      }

      let nextIndex = index + 1
      while (nextIndex < text.length && !['`', '[', '*', '_'].includes(text[nextIndex])) {
        nextIndex++
      }

      pushPlainText(text.slice(index, nextIndex))
      index = nextIndex
    }

    return this.mergeInlineSegments(segments)
  }

  /**
   * 合并样式一致的相邻行内片段
   */
  private mergeInlineSegments(segments: InlineSegment[]): InlineSegment[] {
    return segments.reduce<InlineSegment[]>((acc, segment) => {
      if (!segment.text) return acc

      const previous = acc[acc.length - 1]
      if (
        previous &&
        previous.bold === segment.bold &&
        previous.italic === segment.italic &&
        previous.code === segment.code &&
        previous.link === segment.link
      ) {
        previous.text += segment.text
      } else {
        acc.push({ ...segment })
      }

      return acc
    }, [])
  }

  /**
   * 判断是否为 Markdown 表格分隔行
   */
  private isMarkdownTableSeparator(line: string): boolean {
    return /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/.test(line)
  }

  /**
   * 判断当前位置是否为 Markdown 块起始
   */
  private isMarkdownBlockStart(lines: string[], index: number): boolean {
    const line = lines[index]
    if (!line.trim()) return false
    if (/^(#{1,6})\s+/.test(line)) return true
    if (/^(```+|~~~+)/.test(line)) return true
    if (/^\s*>\s?/.test(line)) return true
    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) return true
    if (this.matchListItem(line)) return true

    return (
      index + 1 < lines.length &&
      line.includes('|') &&
      this.isMarkdownTableSeparator(lines[index + 1])
    )
  }

  /**
   * 匹配列表项
   */
  private matchListItem(
    line: string
  ): { level: number; ordered: boolean; marker: string; content: string } | null {
    const match = line.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/)
    if (!match) return null

    return {
      level: Math.floor(match[1].length / 2),
      ordered: /\d+\./.test(match[2]),
      marker: match[2],
      content: match[3]
    }
  }

  /**
   * 拆分 Markdown 表格行
   */
  private splitMarkdownTableRow(line: string): string[] {
    const normalized = line.trim().replace(/^\|/, '').replace(/\|$/, '')
    const cells: string[] = []
    let current = ''
    let escaped = false

    for (const char of normalized) {
      if (escaped) {
        current += char
        escaped = false
        continue
      }

      if (char === '\\') {
        escaped = true
        continue
      }

      if (char === '|') {
        cells.push(current.trim())
        current = ''
        continue
      }

      current += char
    }

    cells.push(current.trim())
    return cells
  }

  /**
   * 将片段合并为纯文本
   */
  private segmentsToText(segments: InlineSegment[]): string {
    return segments.map((segment) => segment.text).join('')
  }

  // ==================== 文件命名与工具 ====================

  /**
   * 构建下载文件名
   */
  private buildFileName(
    title: string | undefined,
    content: string,
    format: ExportFormat,
    timestamp?: string
  ): string {
    const baseTitle = this.deriveBaseTitle(title, content)
    const safeTitle = this.sanitizeFileNameSegment(baseTitle || DEFAULT_EXPORT_TITLE)
    const fileTimestamp = this.formatFileTimestamp(timestamp)

    return `${safeTitle}_${fileTimestamp}.${this.getFileExtension(format)}`
  }

  /**
   * 推断导出标题
   */
  private deriveBaseTitle(title: string | undefined, content: string): string {
    const normalizedTitle = title?.trim()
    if (normalizedTitle && normalizedTitle !== '新对话') {
      return normalizedTitle
    }

    const blocks = this.parseMarkdownBlocks(content)
    const heading = blocks.find((block) => block.type === 'heading')
    if (heading && heading.type === 'heading') {
      const headingText = this.segmentsToText(heading.segments).trim()
      if (headingText) {
        return headingText
      }
    }

    const paragraph = blocks.find((block) => block.type === 'paragraph')
    if (paragraph && paragraph.type === 'paragraph') {
      const paragraphText = this.segmentsToText(paragraph.segments).trim()
      if (paragraphText) {
        return paragraphText.slice(0, 24)
      }
    }

    return DEFAULT_EXPORT_TITLE
  }

  /**
   * 获取文件扩展名
   */
  private getFileExtension(format: ExportFormat): string {
    switch (format) {
      case 'markdown':
        return 'md'
      case 'word':
        return 'docx'
      case 'pdf':
        return 'pdf'
      case 'txt':
        return 'txt'
    }
  }

  /**
   * 获取 MIME 类型
   */
  private getMimeType(format: ExportFormat): string {
    switch (format) {
      case 'markdown':
        return 'text/markdown;charset=utf-8'
      case 'word':
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      case 'pdf':
        return 'application/pdf'
      case 'txt':
        return 'text/plain;charset=utf-8'
    }
  }

  /**
   * 格式化时间戳
   */
  private formatFileTimestamp(timestamp?: string): string {
    const date = timestamp ? new Date(timestamp) : new Date()
    const safeDate = Number.isNaN(date.getTime()) ? new Date() : date

    const year = safeDate.getFullYear()
    const month = String(safeDate.getMonth() + 1).padStart(2, '0')
    const day = String(safeDate.getDate()).padStart(2, '0')
    const hours = String(safeDate.getHours()).padStart(2, '0')
    const minutes = String(safeDate.getMinutes()).padStart(2, '0')
    const seconds = String(safeDate.getSeconds()).padStart(2, '0')

    return `${year}${month}${day}_${hours}${minutes}${seconds}`
  }

  /**
   * 清洗文件名
   */
  private sanitizeFileNameSegment(value: string): string {
    const withoutControlChars = Array.from(value)
      .filter((char) => char.charCodeAt(0) >= 32)
      .join('')

    const cleaned = withoutControlChars
      .replace(/[<>:"/\\|?*]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\.$/, '')

    return (cleaned || DEFAULT_EXPORT_TITLE).slice(0, 48)
  }

  /**
   * XML 转义
   */
  private escapeXml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
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

// ==================== 单例实例 ====================

let documentExportServiceInstance: DocumentExportService | null = null

/**
 * 获取文档导出服务单例
 */
export function getDocumentExportService(): DocumentExportService {
  if (!documentExportServiceInstance) {
    documentExportServiceInstance = new DocumentExportService()
  }

  return documentExportServiceInstance
}
