import PptxGenJS from 'pptxgenjs'
import { logger } from '@main/services/logger'
import type {
  BuiltinPresentationTemplate,
  BuildPresentationDraftRequest,
  BuildPresentationDraftResult,
  DeletePresentationTemplateRequest,
  DeletePresentationTemplateResult,
  ExportPresentationRequest,
  ExportPresentationResult,
  ImportPresentationTemplateRequest,
  ImportPresentationTemplateResult,
  ListItem,
  PresentationConfig,
  PresentationPreviewResult,
  PresentationThemeConfig,
  PresentationTemplate,
  SlideConfig,
  SlideContent,
  TemplateInfo,
  ValidationIssue,
  ValidationResult
} from '@shared/types/presentation'
import { SlideBuilder } from './builders/SlideBuilder'
import { PresentationTemplateStore } from './PresentationTemplateStore'
import { BusinessTemplate } from './templates/BusinessTemplate'
import { ImportedTemplate } from './templates/ImportedTemplate'
import { LessonPlanTemplate } from './templates/LessonPlanTemplate'
import { MinimalTemplate } from './templates/MinimalTemplate'
import { TemplateBase } from './templates/TemplateBase'

type MarkdownBlock =
  | {
      type: 'heading'
      level: number
      text: string
    }
  | {
      type: 'paragraph'
      text: string
    }
  | {
      type: 'list'
      ordered: boolean
      items: ListItem[]
    }
  | {
      type: 'table'
      headers: string[]
      rows: string[][]
    }
  | {
      type: 'code'
      language?: string
      text: string
    }
  | {
      type: 'separator'
    }

/**
 * PPT 导出服务
 */
export class PresentationExportService {
  private readonly slideBuilder = new SlideBuilder()
  private readonly templateStore = new PresentationTemplateStore()
  private readonly templates = new Map<BuiltinPresentationTemplate | 'custom', TemplateBase>([
    ['lessonPlan', new LessonPlanTemplate()],
    ['business', new BusinessTemplate()],
    ['minimal', new MinimalTemplate()],
    ['custom', new MinimalTemplate()]
  ])

  /**
   * 从聊天内容构建 PPT 草稿配置
   */
  buildDraft(request: BuildPresentationDraftRequest): BuildPresentationDraftResult {
    try {
      const config = this.buildConfigFromMarkdown(request.content, {
        title: request.title,
        author: request.author,
        company: request.company,
        subject: request.subject,
        template: request.template,
        customTemplateId: request.customTemplateId,
        theme: request.theme
      })

      return {
        success: true,
        data: config
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return {
        success: false,
        error: `PPT 草稿生成失败: ${errorMessage}`
      }
    }
  }

  /**
   * 导入并保存用户模板
   */
  async importTemplate(
    request: ImportPresentationTemplateRequest
  ): Promise<ImportPresentationTemplateResult> {
    try {
      const template = await this.templateStore.importTemplate(request)

      return {
        success: true,
        data: this.templateStore.toTemplateInfo(template)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      logger.error('导入 PPT 模板失败', 'main', {
        error: errorMessage
      })

      return {
        success: false,
        error: `导入 PPT 模板失败: ${errorMessage}`
      }
    }
  }

  /**
   * 删除模板
   */
  deleteTemplate(request: DeletePresentationTemplateRequest): DeletePresentationTemplateResult {
    try {
      const visibleTemplates = this.getTemplates()

      if (visibleTemplates.length <= 1) {
        return {
          success: false,
          error: '至少保留一个模板'
        }
      }

      const deleted =
        request.source === 'builtin'
          ? this.templateStore.hideBuiltin(request.templateId as BuiltinPresentationTemplate)
          : this.templateStore.deleteUserTemplate(request.templateId)

      if (!deleted) {
        return {
          success: false,
          error: '模板不存在、已被删除，或不支持删除'
        }
      }

      return {
        success: true
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      logger.error('删除 PPT 模板失败', 'main', {
        error: errorMessage,
        templateId: request.templateId,
        source: request.source
      })

      return {
        success: false,
        error: `删除 PPT 模板失败: ${errorMessage}`
      }
    }
  }

  /**
   * 从聊天内容导出 PPT
   */
  async exportFromChat(request: ExportPresentationRequest): Promise<ExportPresentationResult> {
    try {
      const config = this.resolveConfig(request)
      const validation = this.validate(config)

      if (!validation.valid) {
        return {
          success: false,
          error: validation.issues
            .filter((issue) => issue.severity === 'error')
            .map((issue) => issue.message)
            .join('；')
        }
      }

      const buffer = await this.exportPresentation(config)
      const fileName = this.buildFileName(config.title, request.timestamp)

      logger.info('PPT 导出成功', 'main', {
        title: config.title,
        template: config.template,
        slides: config.slides.length,
        fileName,
        size: buffer.length
      })

      return {
        success: true,
        data: Array.from(buffer),
        fileName,
        mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      logger.error('PPT 导出失败', 'main', {
        error: errorMessage
      })

      return {
        success: false,
        error: `PPT 导出失败: ${errorMessage}`
      }
    }
  }

  /**
   * 导出演示文稿缓冲区
   */
  async exportPresentation(config: PresentationConfig): Promise<Buffer> {
    const template = this.getTemplate(config.template, config.customTemplateId)
    const pptx = new PptxGenJS()
    const theme = template.applyPresentation(pptx, config.theme)

    pptx.author = config.author || 'Sparrow Manus'
    pptx.company = config.company || 'Sparrow Manus'
    pptx.subject = config.subject || config.title
    pptx.title = config.title
    pptx.revision = '1'

    config.slides.forEach((slideConfig, index) => {
      this.slideBuilder.buildSlide(
        pptx,
        slideConfig,
        template,
        theme,
        index + 1,
        config.slides.length,
        config
      )
    })

    const output = await pptx.write({
      outputType: 'nodebuffer',
      compression: true
    })

    return this.toBuffer(output)
  }

  /**
   * 从 Markdown 构建演示文稿配置
   */
  buildConfigFromMarkdown(
    content: string,
    options: {
      title?: string
      author?: string
      company?: string
      subject?: string
      template?: PresentationTemplate
      customTemplateId?: string
      theme?: PresentationThemeConfig
    } = {}
  ): PresentationConfig {
    const normalizedContent = content.replace(/\r\n?/g, '\n').trim()
    const blocks = this.parseMarkdownBlocks(normalizedContent)
    const title = this.deriveTitle(options.title, normalizedContent, blocks)
    const titleSummary = this.deriveSummary(blocks)
    const slides: SlideConfig[] = []

    slides.push({
      layout: 'title',
      title,
      subtitle: titleSummary,
      content: []
    })

    let currentSlide: SlideConfig | null = null

    blocks.forEach((block, index) => {
      if (block.type === 'heading') {
        if (block.level === 1 && block.text === title && index === 0) {
          return
        }

        if (currentSlide) {
          slides.push(currentSlide)
        }

        currentSlide = {
          layout: 'titleContent',
          title: block.text,
          content: []
        }
        return
      }

      if (block.type === 'separator') {
        if (currentSlide) {
          slides.push(currentSlide)
          currentSlide = null
        }
        return
      }

      if (!currentSlide) {
        currentSlide = {
          layout: 'titleContent',
          title: slides.length === 1 ? '内容概览' : `${title}（续）`,
          content: []
        }
      }

      const presentationContent = this.convertMarkdownBlockToContent(block)
      if (presentationContent) {
        currentSlide.content.push(presentationContent)
      }
    })

    if (currentSlide) {
      slides.push(currentSlide)
    }

    if (slides.length === 1) {
      slides.push({
        layout: 'titleContent',
        title: '内容概览',
        content: [
          {
            type: 'text',
            data: {
              text: normalizedContent
            }
          }
        ]
      })
    }

    return {
      title,
      author: options.author,
      company: options.company,
      subject: options.subject,
      template: options.template || 'lessonPlan',
      customTemplateId: options.customTemplateId,
      slides: this.paginateSlides(slides),
      theme: options.theme
    }
  }

  /**
   * 生成简易预览图
   */
  async preview(config: PresentationConfig): Promise<PresentationPreviewResult> {
    try {
      const template = this.getTemplate(config.template, config.customTemplateId)
      const style = template.getPreviewStyle(config.theme)
      const images = config.slides.map((slide, index) =>
        this.buildPreviewImage(slide, style, index + 1, config.slides.length)
      )

      return {
        success: true,
        images
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return {
        success: false,
        error: `PPT 预览生成失败: ${errorMessage}`
      }
    }
  }

  /**
   * 获取模板列表
   */
  getTemplates(): TemplateInfo[] {
    return this.templateStore
      .list()
      .map((template) => this.templateStore.toTemplateInfo(template))
  }

  /**
   * 校验配置
   */
  validate(config: PresentationConfig): ValidationResult {
    const issues: ValidationIssue[] = []

    if (!config.title.trim()) {
      issues.push({
        path: 'title',
        message: '演示文稿标题不能为空',
        severity: 'error'
      })
    }

    if (config.slides.length === 0) {
      issues.push({
        path: 'slides',
        message: '至少需要一页幻灯片',
        severity: 'error'
      })
    }

    if (config.template === 'custom' && !config.customTemplateId) {
      issues.push({
        path: 'customTemplateId',
        message: '自定义模板缺少模板 ID',
        severity: 'error'
      })
    }

    if (config.template !== 'custom' || config.customTemplateId) {
      try {
        this.getTemplate(config.template, config.customTemplateId)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        issues.push({
          path: config.template === 'custom' ? 'customTemplateId' : 'template',
          message: errorMessage,
          severity: 'error'
        })
      }
    }

    config.slides.forEach((slide, slideIndex) => {
      if (slide.layout !== 'blank' && !slide.title?.trim() && slideIndex !== 0) {
        issues.push({
          path: `slides[${slideIndex}].title`,
          message: `第 ${slideIndex + 1} 页缺少标题`,
          severity: 'warning'
        })
      }

      if (slide.content.length === 0 && slide.layout !== 'title') {
        issues.push({
          path: `slides[${slideIndex}].content`,
          message: `第 ${slideIndex + 1} 页没有内容`,
          severity: 'warning'
        })
      }

      if (slide.content.length > 6) {
        issues.push({
          path: `slides[${slideIndex}].content`,
          message: `第 ${slideIndex + 1} 页内容较多，建议拆分为多页`,
          severity: 'warning'
        })
      }

      slide.content.forEach((content, contentIndex) => {
        if (content.type === 'table') {
          const columnCount = content.data.headers.length
          const hasInvalidRow = content.data.rows.some((row) => row.length !== columnCount)
          if (columnCount === 0 || hasInvalidRow) {
            issues.push({
              path: `slides[${slideIndex}].content[${contentIndex}]`,
              message: `第 ${slideIndex + 1} 页的表格列数不一致`,
              severity: 'error'
            })
          }
        }

        if (content.type === 'chart') {
          const labelCount = content.data.data.labels.length
          const hasInvalidSeries = content.data.data.series.some(
            (series) => series.values.length !== labelCount
          )

          if (labelCount === 0 || content.data.data.series.length === 0 || hasInvalidSeries) {
            issues.push({
              path: `slides[${slideIndex}].content[${contentIndex}]`,
              message: `第 ${slideIndex + 1} 页的图表数据不完整`,
              severity: 'error'
            })
          }
        }

        if (content.type === 'image' && !content.data.path && !content.data.data) {
          issues.push({
            path: `slides[${slideIndex}].content[${contentIndex}]`,
            message: `第 ${slideIndex + 1} 页的图片内容缺少 path 或 data`,
            severity: 'error'
          })
        }
      })
    })

    this.validateTheme(config.theme, issues)

    return {
      valid: !issues.some((issue) => issue.severity === 'error'),
      issues
    }
  }

  /**
   * 解析导出配置
   */
  private resolveConfig(request: ExportPresentationRequest): PresentationConfig {
    if (request.config) {
      return request.config
    }

    const content = request.content?.trim()
    if (!content) {
      throw new Error('缺少可用于生成 PPT 的内容')
    }

    return this.buildConfigFromMarkdown(content, {
      title: request.title,
      author: request.author,
      company: request.company,
      subject: request.subject,
      template: request.template,
      customTemplateId: request.customTemplateId,
      theme: request.theme
    })
  }

  /**
   * 按内容密度拆分页
   */
  private paginateSlides(slides: SlideConfig[]): SlideConfig[] {
    return slides.flatMap((slide) => {
      if (slide.layout === 'title' || slide.content.length <= 4) {
        return [slide]
      }

      const chunks: SlideConfig[] = []
      for (let index = 0; index < slide.content.length; index += 4) {
        chunks.push({
          ...slide,
          title:
            index === 0
              ? slide.title
              : `${slide.title || '内容概览'}（${Math.floor(index / 4) + 1}）`,
          content: slide.content.slice(index, index + 4)
        })
      }

      return chunks
    })
  }

  /**
   * 解析 Markdown 内容块
   */
  private parseMarkdownBlocks(content: string): MarkdownBlock[] {
    const blocks: MarkdownBlock[] = []
    const lines = content.split('\n')
    let index = 0

    while (index < lines.length) {
      const line = lines[index].trimEnd()
      const trimmedLine = line.trim()

      if (!trimmedLine) {
        index += 1
        continue
      }

      if (/^```/.test(trimmedLine)) {
        const language = trimmedLine.slice(3).trim() || undefined
        const codeLines: string[] = []
        index += 1

        while (index < lines.length && !/^```/.test(lines[index].trim())) {
          codeLines.push(lines[index])
          index += 1
        }

        blocks.push({
          type: 'code',
          language,
          text: codeLines.join('\n').trimEnd()
        })
        index += 1
        continue
      }

      const headingMatch = trimmedLine.match(/^(#{1,6})\s+(.+)$/)
      if (headingMatch) {
        blocks.push({
          type: 'heading',
          level: headingMatch[1].length,
          text: headingMatch[2].trim()
        })
        index += 1
        continue
      }

      if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmedLine)) {
        blocks.push({ type: 'separator' })
        index += 1
        continue
      }

      if (this.isTableLine(trimmedLine)) {
        const tableLines: string[] = []

        while (index < lines.length && this.isTableLine(lines[index].trim())) {
          tableLines.push(lines[index].trim())
          index += 1
        }

        const tableBlock = this.parseTableBlock(tableLines)
        if (tableBlock) {
          blocks.push(tableBlock)
          continue
        }
      }

      if (/^(\s*)([-*+]|\d+\.)\s+/.test(line)) {
        const items: ListItem[] = []
        const ordered = /^\s*\d+\./.test(line)

        while (index < lines.length && /^(\s*)([-*+]|\d+\.)\s+/.test(lines[index])) {
          const listMatch = lines[index].match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/)
          if (listMatch) {
            items.push({
              text: listMatch[3].trim(),
              level: Math.floor(listMatch[1].length / 2)
            })
          }
          index += 1
        }

        blocks.push({
          type: 'list',
          ordered,
          items
        })
        continue
      }

      const paragraphLines: string[] = []
      while (
        index < lines.length &&
        lines[index].trim() &&
        !/^(#{1,6})\s+/.test(lines[index].trim()) &&
        !/^```/.test(lines[index].trim()) &&
        !/^(-{3,}|\*{3,}|_{3,})$/.test(lines[index].trim()) &&
        !/^(\s*)([-*+]|\d+\.)\s+/.test(lines[index]) &&
        !this.isTableLine(lines[index].trim())
      ) {
        paragraphLines.push(lines[index].trim())
        index += 1
      }

      if (paragraphLines.length > 0) {
        blocks.push({
          type: 'paragraph',
          text: paragraphLines.join(' ').replace(/^>\s?/g, '').trim()
        })
      }
    }

    return blocks
  }

  /**
   * 判断是否为表格行
   */
  private isTableLine(line: string): boolean {
    return /^\|.*\|$/.test(line)
  }

  /**
   * 解析 Markdown 表格
   */
  private parseTableBlock(lines: string[]): MarkdownBlock | null {
    if (lines.length < 2) {
      return null
    }

    const headers = this.splitTableCells(lines[0])
    const separator = this.splitTableCells(lines[1])

    if (
      headers.length === 0 ||
      separator.length !== headers.length ||
      !separator.every((cell) => /^:?-{3,}:?$/.test(cell))
    ) {
      return null
    }

    return {
      type: 'table',
      headers,
      rows: lines.slice(2).map((line) => this.splitTableCells(line))
    }
  }

  /**
   * 拆分表格单元格
   */
  private splitTableCells(line: string): string[] {
    return line
      .slice(1, -1)
      .split('|')
      .map((cell) => cell.trim())
  }

  /**
   * 推断标题
   */
  private deriveTitle(title: string | undefined, content: string, blocks: MarkdownBlock[]): string {
    const normalizedTitle = title?.trim()
    if (normalizedTitle && normalizedTitle !== '新对话') {
      return normalizedTitle
    }

    const heading = blocks.find((block) => block.type === 'heading')
    if (heading && heading.type === 'heading') {
      return heading.text
    }

    const paragraph = blocks.find((block) => block.type === 'paragraph')
    if (paragraph && paragraph.type === 'paragraph') {
      return paragraph.text.slice(0, 30)
    }

    return content.split('\n')[0]?.trim().slice(0, 30) || '未命名演示文稿'
  }

  /**
   * 生成封面摘要
   */
  private deriveSummary(blocks: MarkdownBlock[]): string {
    const paragraph = blocks.find((block) => block.type === 'paragraph')
    if (paragraph && paragraph.type === 'paragraph') {
      return paragraph.text.slice(0, 80)
    }

    const list = blocks.find((block) => block.type === 'list')
    if (list && list.type === 'list') {
      return list.items
        .slice(0, 3)
        .map((item) => item.text)
        .join(' / ')
    }

    return '由 Sparrow Manus 自动生成'
  }

  /**
   * 转换 Markdown 内容块
   */
  private convertMarkdownBlockToContent(block: MarkdownBlock): SlideContent | null {
    switch (block.type) {
      case 'paragraph':
        return {
          type: 'text',
          data: {
            text: block.text
          }
        }
      case 'list':
        return {
          type: 'list',
          data: {
            items: block.items,
            ordered: block.ordered
          }
        }
      case 'table':
        return {
          type: 'table',
          data: {
            headers: block.headers,
            rows: block.rows
          }
        }
      case 'code':
        return {
          type: 'code',
          data: {
            code: block.text,
            language: block.language
          }
        }
      default:
        return null
    }
  }

  /**
   * 校验主题颜色
   */
  private validateTheme(
    theme: PresentationThemeConfig | undefined,
    issues: ValidationIssue[]
  ): void {
    if (!theme) {
      return
    }

    const colorEntries = Object.entries(theme).filter(([key]) =>
      key.toLowerCase().includes('color')
    )
    colorEntries.forEach(([key, value]) => {
      if (!value) {
        return
      }

      const normalized = value.replace(/^#/, '')
      if (!/^[0-9A-Fa-f]{6}$/.test(normalized)) {
        issues.push({
          path: `theme.${key}`,
          message: `${key} 不是合法的十六进制颜色值`,
          severity: 'error'
        })
      }
    })
  }

  /**
   * 获取模板实例
   */
  private getTemplate(template: PresentationTemplate, customTemplateId?: string): TemplateBase {
    if (template === 'custom') {
      if (!customTemplateId) {
        throw new Error('缺少自定义模板 ID')
      }

      const userTemplate = this.templateStore.getById(customTemplateId)
      if (!userTemplate) {
        throw new Error(`未找到自定义模板: ${customTemplateId}`)
      }

      const baseTemplate = this.getBuiltinTemplate(userTemplate.baseTemplate)
      const defaultTheme = {
        ...baseTemplate.definition.defaultTheme,
        ...baseTemplate.resolveTheme(userTemplate.theme)
      }

      return new ImportedTemplate(userTemplate, defaultTheme)
    }

    return this.getBuiltinTemplate(template)
  }

  /**
   * 获取内置模板实例
   */
  private getBuiltinTemplate(template: BuiltinPresentationTemplate): TemplateBase {
    const targetTemplate = this.templates.get(template)
    if (!targetTemplate) {
      throw new Error(`不支持的 PPT 模板: ${template}`)
    }

    return targetTemplate
  }

  /**
   * 构建文件名
   */
  private buildFileName(title: string, timestamp?: string): string {
    const safeTitle = this.sanitizeFileNameSegment(title)
    return `${safeTitle || '演示文稿'}_${this.formatFileTimestamp(timestamp)}.pptx`
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
    return value
      .replace(/[<>:"/\\|?*]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 48)
  }

  /**
   * 转换为 Buffer
   */
  private toBuffer(output: string | ArrayBuffer | Blob | Uint8Array): Buffer {
    if (output instanceof Uint8Array) {
      return Buffer.from(output)
    }

    if (output instanceof ArrayBuffer) {
      return Buffer.from(output)
    }

    if (typeof output === 'string') {
      return Buffer.from(output, 'binary')
    }

    throw new Error('PPT 导出返回了不支持的数据类型')
  }

  /**
   * 构建预览图片
   */
  private buildPreviewImage(
    slide: SlideConfig,
    style: {
      backgroundColor: string
      primaryColor: string
      secondaryColor: string
      textColor: string
      mutedTextColor: string
    },
    slideIndex: number,
    totalSlides: number
  ): string {
    const contentLines = slide.content
      .flatMap((content) => {
        switch (content.type) {
          case 'text':
            return [content.data.text]
          case 'list':
            return content.data.items.map((item) => `• ${item.text}`)
          case 'table':
            return [
              content.data.headers.join(' | '),
              ...content.data.rows.slice(0, 3).map((row) => row.join(' | '))
            ]
          case 'chart':
            return [content.data.options?.title || `${content.data.type.toUpperCase()} 图表`]
          case 'code':
            return content.data.code.split('\n').slice(0, 4)
          case 'shape':
            return [content.data.text || content.data.shape]
          case 'image':
            return [content.data.alt || '图片']
          default:
            return []
        }
      })
      .slice(0, 8)

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="1333" height="750" viewBox="0 0 1333 750">
        <rect width="1333" height="750" fill="#${style.backgroundColor}" />
        <rect x="0" y="0" width="1333" height="20" fill="#${style.primaryColor}" />
        <rect x="46" y="84" width="1241" height="590" rx="22" fill="#FFFFFF" stroke="#${style.secondaryColor}" stroke-width="2" />
        <text x="70" y="150" fill="#${style.textColor}" font-size="34" font-family="PingFang SC, Arial" font-weight="700">
          ${this.escapeXml(slide.title || '未命名幻灯片')}
        </text>
        ${contentLines
          .map(
            (line, index) => `
              <text x="78" y="${212 + index * 52}" fill="#${index === 0 ? style.textColor : style.mutedTextColor}" font-size="24" font-family="PingFang SC, Arial">
                ${this.escapeXml(this.truncate(line, 54))}
              </text>
            `
          )
          .join('')}
        <text x="1180" y="695" fill="#${style.mutedTextColor}" font-size="18" font-family="PingFang SC, Arial">
          ${slideIndex} / ${totalSlides}
        </text>
      </svg>
    `.trim()

    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  }

  /**
   * 截断预览文本
   */
  private truncate(text: string, maxLength: number): string {
    return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text
  }

  /**
   * 转义 XML
   */
  private escapeXml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }
}

// ==================== 单例实例 ====================

let presentationExportServiceInstance: PresentationExportService | null = null

/**
 * 获取 PPT 导出服务单例
 */
export function getPresentationExportService(): PresentationExportService {
  if (!presentationExportServiceInstance) {
    presentationExportServiceInstance = new PresentationExportService()
  }

  return presentationExportServiceInstance
}
