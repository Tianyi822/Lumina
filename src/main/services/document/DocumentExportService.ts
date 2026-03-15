import { logger } from '@main/services/logger'
import type { ExportFormat, ExportMessageRequest, ExportMessageResult } from '@shared/types'
import type { ExportPptRequest } from '@shared/types/export'
import type { PptExportConfig } from '@shared/types/ppt-export'
import { MarkdownExporter } from './exporters/MarkdownExporter'
import { PdfExporter } from './exporters/PdfExporter'
import { WordExporter } from './exporters/WordExporter'
import { MarkdownParser } from './parsers/MarkdownParser'
import { getPptExportService } from '../presentation/PptExportService'

/**
 * 文档导出服务
 * 负责协调 Markdown、Word、PDF、TXT、PPT 导出流程
 */
export class DocumentExportService {
  private readonly markdownParser = new MarkdownParser()
  private readonly markdownExporter = new MarkdownExporter(this.markdownParser)
  private readonly wordExporter = new WordExporter(this.markdownParser)
  private readonly pdfExporter = new PdfExporter()

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

      const normalizedMarkdown = this.markdownExporter.normalizeMarkdownContent(normalizedContent)
      const baseTitle = this.deriveBaseTitle(request.title, normalizedMarkdown)
      const fileName = this.buildFileName(baseTitle, request.format, request.timestamp)

      let buffer: Buffer
      switch (request.format) {
        case 'markdown':
          buffer = Buffer.from(normalizedMarkdown, 'utf-8')
          break
        case 'txt':
          buffer = Buffer.from(this.markdownExporter.buildPlainText(normalizedMarkdown), 'utf-8')
          break
        case 'word':
          buffer = await this.wordExporter.buildDocument(normalizedMarkdown, baseTitle)
          break
        case 'pdf':
          buffer = await this.pdfExporter.buildDocument(normalizedMarkdown, baseTitle)
          break
        case 'ppt':
          buffer = await this.buildPptDocument(normalizedContent, request)
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

  private async buildPptDocument(content: string, request: ExportMessageRequest): Promise<Buffer> {
    const pptExportService = getPptExportService()
    const previewResult = await pptExportService.previewExport(content)

    if (!previewResult.success || !previewResult.config) {
      throw new Error(previewResult.error || 'PPT 内容解析失败')
    }

    const config = previewResult.config
    if (this.isExportPptRequest(request)) {
      this.applyPptExportOptions(config, request)
    }

    const generateResult = await pptExportService.generatePpt({
      content,
      config,
      title: request.title
    })

    if (!generateResult.success || !generateResult.data) {
      throw new Error(generateResult.error || 'PPT 生成失败')
    }

    return Buffer.from(generateResult.data)
  }

  private isExportPptRequest(request: ExportMessageRequest): request is ExportPptRequest {
    return request.format === 'ppt' && 'options' in request
  }

  private applyPptExportOptions(config: PptExportConfig, request: ExportPptRequest): void {
    if (!request.options) {
      return
    }

    if (request.options.style) {
      config.style = { ...config.style, ...request.options.style }
    }

    if (request.options.pageIndices && request.options.pageIndices.length > 0) {
      const selectedIndexSet = new Set(request.options.pageIndices)
      config.slides = config.slides.map((slide) => ({
        ...slide,
        selected: selectedIndexSet.has(slide.index)
      }))
    }
  }

  private deriveBaseTitle(title: string | undefined, content: string): string {
    const normalizedTitle = title?.trim()
    if (normalizedTitle && normalizedTitle !== '新对话') {
      return normalizedTitle
    }

    const blocks = this.markdownParser.parseBlocks(content)
    const heading = blocks.find((block) => block.type === 'heading')
    if (heading && heading.type === 'heading') {
      const headingText = this.markdownParser.segmentsToText(heading.segments).trim()
      if (headingText) {
        return headingText
      }
    }

    const paragraph = blocks.find((block) => block.type === 'paragraph')
    if (paragraph && paragraph.type === 'paragraph') {
      const paragraphText = this.markdownParser.segmentsToText(paragraph.segments).trim()
      if (paragraphText) {
        return paragraphText.slice(0, 24)
      }
    }

    return ''
  }

  private buildFileName(baseTitle: string, format: ExportFormat, timestamp?: string): string {
    const safeTitle = this.sanitizeFileNameSegment(baseTitle)
    const fileTimestamp = this.formatFileTimestamp(timestamp)
    const extension = this.getFileExtension(format)

    return safeTitle
      ? `${safeTitle}_${fileTimestamp}.${extension}`
      : `${fileTimestamp}.${extension}`
  }

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
      case 'ppt':
        return 'pptx'
    }
  }

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
      case 'ppt':
        return 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      default:
        return 'application/octet-stream'
    }
  }

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
}

let documentExportServiceInstance: DocumentExportService | null = null

export function getDocumentExportService(): DocumentExportService {
  if (!documentExportServiceInstance) {
    documentExportServiceInstance = new DocumentExportService()
  }

  return documentExportServiceInstance
}
