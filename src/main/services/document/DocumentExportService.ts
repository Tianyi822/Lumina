import { BrowserWindow } from 'electron'
import {
  BorderStyle,
  Document,
  ExternalHyperlink,
  FileChild,
  HighlightColor,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  UnderlineType,
  WidthType,
  type ParagraphChild
} from 'docx'
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

interface WordRunStyle {
  bold?: boolean
  italic?: boolean
  color?: string
  fontSize?: number
  monospace?: boolean
}

interface WordTextFragment {
  text: string
  useEmojiFont?: boolean
}

interface WordParagraphOptions {
  indentLeft?: number
  indentHanging?: number
  spacingBefore?: number
  spacingAfter?: number
  shadeFill?: string
  borderLeftColor?: string
  runStyle?: WordRunStyle
}

const DEFAULT_CODE_FONT = 'Menlo'
const DEFAULT_WORD_FONT = 'PingFang SC'
const DEFAULT_EMOJI_FONT = 'Apple Color Emoji'
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

    try {
      if (!normalizedContent) {
        return {
          success: false,
          error: '导出内容为空，无法生成文件'
        }
      }

      const normalizedMarkdown = this.normalizeMarkdownContent(normalizedContent)
      const fileName = this.buildFileName(
        request.title,
        normalizedMarkdown,
        request.format,
        request.timestamp
      )
      let buffer: Buffer

      switch (request.format) {
        case 'markdown':
          buffer = Buffer.from(normalizedMarkdown, 'utf-8')
          break
        case 'txt':
          buffer = Buffer.from(this.buildPlainText(normalizedMarkdown), 'utf-8')
          break
        case 'word':
          buffer = await this.buildWordDocument(normalizedMarkdown, request)
          break
        case 'pdf':
          buffer = await this.buildPdfDocument(normalizedMarkdown, request)
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
   * 归一化 Markdown 内容，确保各格式导出使用同一份结构
   */
  private normalizeMarkdownContent(content: string): string {
    const blocks = this.parseMarkdownBlocks(content)
    return this.renderMarkdownBlocks(blocks)
  }

  /**
   * 将导出块重新渲染为 Markdown
   */
  private renderMarkdownBlocks(blocks: ExportBlock[]): string {
    const sections = blocks.map((block) => {
      switch (block.type) {
        case 'heading':
          return `${'#'.repeat(block.level)} ${this.segmentsToMarkdown(block.segments)}`
        case 'paragraph':
          return this.segmentsToMarkdown(block.segments)
        case 'blockquote':
          return this.segmentsToMarkdown(block.segments)
            .split('\n')
            .map((line) => `> ${line}`)
            .join('\n')
        case 'list':
          return block.items
            .map((item) => {
              const prefix = item.ordered ? item.marker : '-'
              const indent = '  '.repeat(item.level)
              const lines = this.segmentsToMarkdown(item.segments).split('\n')

              return lines
                .map((line, lineIndex) =>
                  lineIndex === 0 ? `${indent}${prefix} ${line}` : `${indent}  ${line}`
                )
                .join('\n')
            })
            .join('\n')
        case 'code':
          return ['```' + (block.language || ''), ...block.lines, '```'].join('\n')
        case 'table': {
          const headers = `| ${block.headers
            .map((cell) => this.segmentsToMarkdown(cell, true))
            .join(' | ')} |`
          const separator = `| ${block.headers.map(() => '---').join(' | ')} |`
          const rows = block.rows.map(
            (row) =>
              `| ${row.map((cell) => this.segmentsToMarkdown(cell, true)).join(' | ')} |`
          )
          return [headers, separator, ...rows].join('\n')
        }
        case 'separator':
          return '---'
      }
    })

    return sections.join('\n\n').trimEnd() + '\n'
  }

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
    const title = this.deriveBaseTitle(request.title, content)
    const document = new Document({
      creator: 'Sparrow Manus',
      title: title || undefined,
      description: 'AI 助手导出的内容',
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: 1440,
                right: 1440,
                bottom: 1440,
                left: 1440
              }
            }
          },
          children: this.buildWordChildren(blocks)
        }
      ]
    })

    return Buffer.from(await Packer.toBuffer(document))
  }

  /**
   * 构建 Word 文档节点
   */
  private buildWordChildren(blocks: ExportBlock[]): FileChild[] {
    return blocks.flatMap((block) => {
      switch (block.type) {
        case 'heading':
          return [
            this.buildWordParagraph(block.segments, {
              spacingBefore: block.level === 1 ? 240 : 180,
              spacingAfter: 120,
              runStyle: {
                bold: true,
                fontSize: this.getHeadingFontSize(block.level)
              }
            })
          ]
        case 'paragraph':
          return [
            this.buildWordParagraph(block.segments, {
              spacingAfter: 120
            })
          ]
        case 'blockquote':
          return [
            this.buildWordParagraph(block.segments, {
              indentLeft: 360,
              spacingAfter: 120,
              shadeFill: 'F8FAFC',
              borderLeftColor: '94A3B8',
              runStyle: {
                color: '475569'
              }
            })
          ]
        case 'list':
          return block.items.map((item) => {
            const markerPrefix = item.ordered ? `${item.marker} ` : '• '
            return this.buildWordParagraph([{ text: markerPrefix }, ...item.segments], {
              indentLeft: 360 + item.level * 360,
              indentHanging: 240,
              spacingAfter: 80
            })
          })
        case 'code':
          return block.lines.map((line) =>
            this.buildWordParagraph(
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
        case 'table':
          return [this.buildWordTable(block.headers, block.rows)]
        case 'separator':
          return [
            this.buildWordParagraph([{ text: '────────────────────────' }], {
              spacingBefore: 60,
              spacingAfter: 120,
              runStyle: {
                color: 'CBD5E1'
              }
            })
          ]
      }
    })
  }

  /**
   * 构建 Word 段落
   */
  private buildWordParagraph(
    segments: InlineSegment[],
    options: WordParagraphOptions = {}
  ): Paragraph {
    const children = this.buildWordParagraphChildren(segments, options.runStyle)

    return new Paragraph({
      children: children.length > 0 ? children : [new TextRun(' ')],
      spacing: {
        before: options.spacingBefore,
        after: options.spacingAfter
      },
      indent:
        options.indentLeft !== undefined || options.indentHanging !== undefined
          ? {
              left: options.indentLeft,
              hanging: options.indentHanging
            }
          : undefined,
      shading: options.shadeFill
        ? {
            fill: options.shadeFill
          }
        : undefined,
      border: options.borderLeftColor
        ? {
            left: {
              color: options.borderLeftColor,
              style: BorderStyle.SINGLE,
              size: 16,
              space: 8
            }
          }
        : undefined
    })
  }

  /**
   * 构建 Word 段落子节点
   */
  private buildWordParagraphChildren(
    segments: InlineSegment[],
    paragraphStyle: WordRunStyle = {}
  ): ParagraphChild[] {
    return segments.reduce<ParagraphChild[]>((children, segment) => {
      if (!segment.text) {
        return children
      }

      const runStyle = {
        bold: paragraphStyle.bold || segment.bold,
        italic: paragraphStyle.italic || segment.italic,
        color: segment.link ? '0563C1' : paragraphStyle.color,
        fontSize: paragraphStyle.fontSize,
        monospace: paragraphStyle.monospace || segment.code,
        underline: !!segment.link,
        highlight: !!segment.code
      }

      const runs = this.buildWordTextRuns(segment.text, runStyle)
      if (segment.link) {
        children.push(
          new ExternalHyperlink({
            link: segment.link,
            children: runs
          })
        )
        return children
      }

      children.push(...runs)
      return children
    }, [])
  }

  /**
   * 构建 Word 文本运行
   */
  private buildWordTextRuns(
    text: string,
    options: WordRunStyle & { underline?: boolean; highlight?: boolean }
  ): TextRun[] {
    const lines = text.split('\n')
    const runs: TextRun[] = []

    lines.forEach((line, index) => {
      const fragments = this.splitWordTextFragments(line || ' ')

      fragments.forEach((fragment) => {
        runs.push(
          new TextRun({
            text: this.normalizeWordFragmentText(fragment),
            bold: options.bold,
            italics: options.italic,
            color: this.resolveWordColor(fragment, options.color),
            size: options.fontSize,
            font: this.resolveWordFont(fragment, options),
            underline: options.underline ? { type: UnderlineType.SINGLE } : undefined,
            highlight: options.highlight ? HighlightColor.LIGHT_GRAY : undefined
          })
        )
      })

      if (index < lines.length - 1) {
        runs.push(
          new TextRun({
            text: '',
            break: 1,
            bold: options.bold,
            italics: options.italic,
            color: options.color,
            size: options.fontSize,
            font: this.resolveWordFont({ text: ' ' }, options)
          })
        )
      }
    })

    return runs
  }

  /**
   * 拆分 Word 文本片段，为符号单独指定字体
   */
  private splitWordTextFragments(text: string): WordTextFragment[] {
    const fragments: WordTextFragment[] = []
    const graphemes = this.splitWordGraphemes(text)
    let plainTextBuffer = ''

    graphemes.forEach((grapheme) => {
      if (this.isEmojiFragment(grapheme)) {
        if (plainTextBuffer) {
          fragments.push({
            text: plainTextBuffer
          })
          plainTextBuffer = ''
        }

        fragments.push({
          text: grapheme,
          useEmojiFont: true
        })
        return
      }

      plainTextBuffer += grapheme
    })

    if (plainTextBuffer) {
      fragments.push({
        text: plainTextBuffer
      })
    }

    return fragments.length > 0
      ? fragments
      : [
          {
            text
          }
        ]
  }

  /**
   * 按字素簇拆分文本，避免连续符号在 Word 中被合并渲染
   */
  private splitWordGraphemes(text: string): string[] {
    if (typeof Intl !== 'undefined' && typeof Intl.Segmenter !== 'undefined') {
      const segmenter = new Intl.Segmenter('zh-CN', {
        granularity: 'grapheme'
      })

      return Array.from(segmenter.segment(text), ({ segment }) => segment)
    }

    return Array.from(text)
  }

  /**
   * 判断片段是否应使用符号字体
   */
  private isEmojiFragment(text: string): boolean {
    return /^(?:[\p{Extended_Pictographic}\u2B50](?:\uFE0F)?(?:\u200D[\p{Extended_Pictographic}\u2B50](?:\uFE0F)?)*)$/u.test(
      text
    )
  }

  /**
   * 解析 Word 字体配置
   */
  private resolveWordFont(
    fragment: WordTextFragment,
    options: WordRunStyle
  ): { ascii: string; hAnsi: string; eastAsia: string; cs: string } {
    const fontName = options.monospace
      ? DEFAULT_CODE_FONT
      : this.isWordStarFragment(fragment)
        ? DEFAULT_WORD_FONT
        : fragment.useEmojiFont
          ? DEFAULT_EMOJI_FONT
          : DEFAULT_WORD_FONT

    return {
      ascii: fontName,
      hAnsi: fontName,
      eastAsia: fontName,
      cs: fontName
    }
  }

  /**
   * 归一化 Word 片段文本，避免变体选择符显示为乱码
   */
  private normalizeWordFragmentText(fragment: WordTextFragment): string {
    const normalizedText = fragment.useEmojiFont ? fragment.text.replace(/\uFE0F/g, '') : fragment.text

    return this.isWordStarText(normalizedText)
      ? '★'.repeat(Array.from(normalizedText).length)
      : normalizedText
  }

  /**
   * 解析 Word 片段颜色
   */
  private resolveWordColor(fragment: WordTextFragment, defaultColor?: string): string | undefined {
    return this.isWordStarFragment(fragment) ? 'EAB308' : defaultColor
  }

  /**
   * 判断是否为 Word 星级片段
   */
  private isWordStarFragment(fragment: WordTextFragment): boolean {
    return this.isWordStarText(fragment.text.replace(/\uFE0F/g, ''))
  }

  /**
   * 判断是否为星级文本
   */
  private isWordStarText(text: string): boolean {
    return /^[⭐]+$/u.test(text)
  }

  /**
   * 构建 Word 表格
   */
  private buildWordTable(headers: InlineSegment[][], rows: InlineSegment[][][]): Table {
    const columnCount = Math.max(1, headers.length, ...rows.map((row) => row.length))
    const cellWidth = Math.floor(WORD_PAGE_WIDTH / columnCount)
    const tableRows = [headers, ...rows]

    return new Table({
      width: {
        size: 100,
        type: WidthType.PERCENTAGE
      },
      columnWidths: Array.from({ length: columnCount }, () => cellWidth),
      layout: TableLayoutType.FIXED,
      borders: {
        top: { color: 'CBD5E1', style: BorderStyle.SINGLE, size: 8 },
        bottom: { color: 'CBD5E1', style: BorderStyle.SINGLE, size: 8 },
        left: { color: 'CBD5E1', style: BorderStyle.SINGLE, size: 8 },
        right: { color: 'CBD5E1', style: BorderStyle.SINGLE, size: 8 },
        insideHorizontal: { color: 'E2E8F0', style: BorderStyle.SINGLE, size: 8 },
        insideVertical: { color: 'E2E8F0', style: BorderStyle.SINGLE, size: 8 }
      },
      rows: tableRows.map((row, rowIndex) => {
        const cells = Array.from({ length: columnCount }, (_, cellIndex) => row[cellIndex] || [])

        return new TableRow({
          children: cells.map(
            (cell) =>
              new TableCell({
                width: {
                  size: cellWidth,
                  type: WidthType.DXA
                },
                shading:
                  rowIndex === 0
                    ? {
                        fill: 'E8EEF3'
                      }
                    : undefined,
                margins: {
                  top: 80,
                  bottom: 80,
                  left: 120,
                  right: 120
                },
                children: [
                  this.buildWordParagraph(cell, {
                    spacingAfter: 0,
                    runStyle: rowIndex === 0 ? { bold: true } : undefined
                  })
                ]
              })
          )
        })
      })
    })
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
    const safeTitle = this.escapeHtml(this.deriveBaseTitle(request.title, content))

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

  /**
   * 将片段重新组装为 Markdown
   */
  private segmentsToMarkdown(segments: InlineSegment[], escapePipes = false): string {
    return segments
      .map((segment) => {
        let text = this.escapeMarkdownText(segment.text, {
          escapePipes,
          code: !!segment.code
        })

        if (segment.code) {
          text = `\`${text}\``
        } else if (segment.bold && segment.italic) {
          text = `***${text}***`
        } else if (segment.bold) {
          text = `**${text}**`
        } else if (segment.italic) {
          text = `*${text}*`
        }

        if (segment.link) {
          text = `[${text}](${segment.link})`
        }

        return text
      })
      .join('')
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
    const safeTitle = this.sanitizeFileNameSegment(baseTitle)
    const fileTimestamp = this.formatFileTimestamp(timestamp)

    return safeTitle
      ? `${safeTitle}_${fileTimestamp}.${this.getFileExtension(format)}`
      : `${fileTimestamp}.${this.getFileExtension(format)}`
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

    return ''
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
    if (!value) {
      return ''
    }

    const withoutControlChars = Array.from(value)
      .filter((char) => char.charCodeAt(0) >= 32)
      .join('')

    const cleaned = withoutControlChars
      .replace(/[<>:"/\\|?*]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\.$/, '')

    return cleaned.slice(0, 48)
  }

  /**
   * 转义 Markdown 文本
   */
  private escapeMarkdownText(
    value: string,
    options: {
      escapePipes?: boolean
      code?: boolean
    } = {}
  ): string {
    if (options.code) {
      return value.replace(/\\/g, '\\\\').replace(/`/g, '\\`')
    }

    return value
      .replace(/\\/g, '\\\\')
      .replace(/([*_`\[\]])/g, '\\$1')
      .replace(options.escapePipes ? /\|/g : /$^/, '\\|')
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
