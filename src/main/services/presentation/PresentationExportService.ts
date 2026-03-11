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
  PresentationDecorativeShape,
  PresentationPreviewResult,
  PresentationSlideStyle,
  PresentationThemeConfig,
  PresentationTemplate,
  PositionOptions,
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
import type { ResolvedTheme } from './types/presentation'

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

interface PreviewCanvasSize {
  width: number
  height: number
}

interface PreviewRect {
  x: number
  y: number
  w: number
  h: number
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
      const theme = template.resolveTheme(config.theme)
      const images = config.slides.map((slide, index) =>
        this.buildPreviewImage(slide, config, template, theme, index + 1, config.slides.length)
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
    return this.templateStore.list().map((template) => this.templateStore.toTemplateInfo(template))
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
    presentationConfig: PresentationConfig,
    template: TemplateBase,
    theme: ResolvedTheme,
    slideIndex: number,
    totalSlides: number
  ): string {
    const pageSize = this.getPreviewPageSize(template)
    const canvas = this.getPreviewCanvasSize(pageSize)
    const regions = template.getRegions(slide.layout)
    const slideStyle = template.getSlideStyle(slide.layout, theme)
    const elements: string[] = [
      `<rect width="${canvas.width}" height="${canvas.height}" fill="${this.normalizeSvgColor(
        slideStyle.backgroundColor || theme.backgroundColor
      )}" />`
    ]

    slideStyle.decorativeShapes?.forEach((shape) => {
      const markup = this.renderPreviewDecorativeShape(
        shape,
        pageSize,
        canvas,
        theme.backgroundColor
      )
      if (markup) {
        elements.push(markup)
      }
    })

    slideStyle.decorativeTexts?.forEach((text) => {
      const rendered = this.renderPreviewDecorativeText(text, pageSize, canvas, theme.textColor)
      if (rendered.markup) {
        elements.push(rendered.markup)
      }
    })

    if (slide.layout !== 'blank' && regions.title) {
      const titleText = slide.title || presentationConfig.title
      const title = this.renderPreviewTextBlock(
        titleText,
        this.toPreviewRect(regions.title, pageSize, canvas),
        slideStyle.titleStyle,
        pageSize,
        canvas,
        3,
        theme.textColor
      )
      if (title.markup) {
        elements.push(title.markup)
      }
    }

    if (slide.subtitle && regions.subtitle) {
      const subtitle = this.renderPreviewTextBlock(
        slide.subtitle,
        this.toPreviewRect(regions.subtitle, pageSize, canvas),
        slideStyle.subtitleStyle,
        pageSize,
        canvas,
        3,
        theme.mutedTextColor
      )
      if (subtitle.markup) {
        elements.push(subtitle.markup)
      }
    }

    if (
      slide.layout === 'comparison' &&
      regions.content.length === 2 &&
      template.shouldRenderComparisonDivider(slide.layout)
    ) {
      const leftRegion = this.toPreviewRect(regions.content[0], pageSize, canvas)
      const rightRegion = this.toPreviewRect(regions.content[1], pageSize, canvas)
      const dividerX = (leftRegion.x + leftRegion.w + rightRegion.x) / 2
      elements.push(
        `<line x1="${dividerX}" y1="${leftRegion.y}" x2="${dividerX}" y2="${leftRegion.y + leftRegion.h}" stroke="${this.normalizeSvgColor(
          theme.secondaryColor
        )}" stroke-width="2" />`
      )
    }

    const contentGroups =
      regions.content.length === 2
        ? this.splitPreviewContentForColumns(slide.content)
        : [slide.content]

    contentGroups.forEach((group, groupIndex) => {
      const region = regions.content[groupIndex]
      if (!region) {
        return
      }

      const previewRegion = this.toPreviewRect(region, pageSize, canvas)
      const gap = this.toPreviewHeight(0.22, pageSize, canvas)
      let cursorY = previewRegion.y

      group.forEach((content) => {
        const available = {
          x: previewRegion.x,
          y: cursorY,
          w: previewRegion.w,
          h: Math.max(previewRegion.y + previewRegion.h - cursorY, 0)
        }

        if (available.h <= 10) {
          return
        }

        const rendered = this.renderPreviewContentBlock(
          content,
          available,
          slideStyle,
          theme,
          pageSize,
          canvas
        )

        if (rendered.markup) {
          elements.push(rendered.markup)
        }

        cursorY += rendered.usedHeight + gap
      })
    })

    if (slideStyle.pageNumber?.position) {
      const pageNumber = this.renderPreviewTextBlock(
        `${slideIndex}/${totalSlides}`,
        this.toPreviewRect(slideStyle.pageNumber.position, pageSize, canvas),
        slideStyle.pageNumber.style,
        pageSize,
        canvas,
        1,
        theme.mutedTextColor
      )
      if (pageNumber.markup) {
        elements.push(pageNumber.markup)
      }
    }

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}">
        ${elements.join('\n')}
      </svg>
    `.trim()

    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  }

  /**
   * 获取预览画布尺寸
   */
  private getPreviewCanvasSize(pageSize: { width: number; height: number }): PreviewCanvasSize {
    const width = 1333
    return {
      width,
      height: Math.round((pageSize.height / pageSize.width) * width)
    }
  }

  /**
   * 获取预览页尺寸
   */
  private getPreviewPageSize(template: TemplateBase): { width: number; height: number } {
    return (
      template.definition.pageSize || {
        width: 13.33,
        height: 7.5
      }
    )
  }

  /**
   * 将 PPT 位置转换为预览坐标
   */
  private toPreviewRect(
    position: PositionOptions | undefined,
    pageSize: { width: number; height: number },
    canvas: PreviewCanvasSize
  ): PreviewRect {
    return {
      x: ((position?.x || 0) / pageSize.width) * canvas.width,
      y: ((position?.y || 0) / pageSize.height) * canvas.height,
      w: ((position?.w || 0) / pageSize.width) * canvas.width,
      h: ((position?.h || 0) / pageSize.height) * canvas.height
    }
  }

  /**
   * 将 PPT 高度转换为预览高度
   */
  private toPreviewHeight(
    height: number,
    pageSize: { width: number; height: number },
    canvas: PreviewCanvasSize
  ): number {
    return (height / pageSize.height) * canvas.height
  }

  /**
   * 将字号转换为预览像素
   */
  private pointsToPreviewPx(
    fontSize: number,
    pageSize: { width: number; height: number },
    canvas: PreviewCanvasSize
  ): number {
    return (fontSize / 72) * (canvas.width / pageSize.width)
  }

  /**
   * 拆分双栏预览内容
   */
  private splitPreviewContentForColumns(content: SlideContent[]): [SlideContent[], SlideContent[]] {
    const midpoint = Math.ceil(content.length / 2)
    return [content.slice(0, midpoint), content.slice(midpoint)]
  }

  /**
   * 渲染单个预览内容块
   */
  private renderPreviewContentBlock(
    content: SlideContent,
    position: PreviewRect,
    slideStyle: PresentationSlideStyle,
    theme: ResolvedTheme,
    pageSize: { width: number; height: number },
    canvas: PreviewCanvasSize
  ): { markup: string; usedHeight: number } {
    switch (content.type) {
      case 'text': {
        const rendered = this.renderPreviewTextBlock(
          content.data.text,
          position,
          content.data.style || slideStyle.bodyStyle,
          pageSize,
          canvas,
          5,
          theme.textColor
        )
        return rendered
      }
      case 'list': {
        const text = content.data.items
          .map((item, index) => {
            const prefix = content.data.ordered ? `${index + 1}.` : '•'
            const indent = ' '.repeat((item.level || 0) * 2)
            return `${indent}${prefix} ${item.text}`
          })
          .join('\n')
        return this.renderPreviewTextBlock(
          text,
          position,
          content.data.style || slideStyle.listStyle || slideStyle.bodyStyle,
          pageSize,
          canvas,
          6,
          theme.textColor
        )
      }
      case 'table':
        return this.renderPreviewTableBlock(content.data, position, theme, pageSize, canvas)
      case 'chart':
        return this.renderPreviewChartBlock(content.data, position, theme, pageSize, canvas)
      case 'code':
        return this.renderPreviewCodeBlock(content.data.code, position, pageSize, canvas)
      case 'image':
        return this.renderPreviewImageBlock(
          content.data.alt || '图片',
          position,
          theme,
          pageSize,
          canvas
        )
      case 'shape':
        return this.renderPreviewShapeBlock(content.data, position, theme, pageSize, canvas)
      default:
        return {
          markup: '',
          usedHeight: 0
        }
    }
  }

  /**
   * 渲染预览文本块
   */
  private renderPreviewTextBlock(
    text: string,
    position: PreviewRect,
    style: PresentationSlideStyle['titleStyle'],
    pageSize: { width: number; height: number },
    canvas: PreviewCanvasSize,
    preferredMaxLines: number,
    fallbackColor: string = '111827'
  ): { markup: string; usedHeight: number } {
    const normalizedText = text.trim()
    if (!normalizedText || position.w <= 0 || position.h <= 0) {
      return {
        markup: '',
        usedHeight: 0
      }
    }

    const fontSizePt = style?.fontSize || 16
    const fontSizePx = Math.max(this.pointsToPreviewPx(fontSizePt, pageSize, canvas), 12)
    const lineHeight = fontSizePx * 1.35
    const maxLines = Math.max(
      1,
      Math.min(preferredMaxLines, Math.floor(position.h / lineHeight) || 1)
    )
    const maxChars = Math.max(6, Math.floor(position.w / Math.max(fontSizePx * 0.62, 1)))
    const lines = this.wrapPreviewText(normalizedText, maxChars, maxLines)
    const align = style?.align || 'left'
    const textAnchor = align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start'
    const x =
      align === 'center'
        ? position.x + position.w / 2
        : align === 'right'
          ? position.x + position.w
          : position.x

    const usedHeight = Math.min(lines.length * lineHeight, position.h)
    const fill = this.normalizeSvgColor(style?.color || fallbackColor)
    const fontFamily = this.buildSvgFontFamily(style?.fontFace)

    return {
      markup: `<text x="${x}" y="${position.y}" fill="${fill}" font-size="${fontSizePx}" font-family="${fontFamily}" font-weight="${style?.bold ? 700 : 400}" font-style="${style?.italic ? 'italic' : 'normal'}" text-anchor="${textAnchor}" dominant-baseline="text-before-edge">${lines
        .map((line, index) => {
          const dy = index === 0 ? 0 : lineHeight
          return `<tspan x="${x}" dy="${dy}">${this.escapeXml(line)}</tspan>`
        })
        .join('')}</text>`,
      usedHeight
    }
  }

  /**
   * 渲染预览装饰文本
   */
  private renderPreviewDecorativeText(
    text: NonNullable<PresentationSlideStyle['decorativeTexts']>[number],
    pageSize: { width: number; height: number },
    canvas: PreviewCanvasSize,
    fallbackColor: string
  ): { markup: string; usedHeight: number } {
    return this.renderPreviewTextBlock(
      text.text,
      this.toPreviewRect(text.position, pageSize, canvas),
      text.style,
      pageSize,
      canvas,
      2,
      fallbackColor
    )
  }

  /**
   * 渲染预览表格
   */
  private renderPreviewTableBlock(
    table: Extract<SlideContent, { type: 'table' }>['data'],
    position: PreviewRect,
    theme: ResolvedTheme,
    pageSize: { width: number; height: number },
    canvas: PreviewCanvasSize
  ): { markup: string; usedHeight: number } {
    const visibleRows = table.rows.slice(0, 3)
    const rowCount = visibleRows.length + 1
    const usedHeight = Math.min(position.h, Math.max(rowCount * 34, 108))
    const rowHeight = usedHeight / rowCount
    const columnCount = Math.max(table.headers.length, 1)
    const colWidth = position.w / columnCount
    const headerFill = this.normalizeSvgColor(table.style?.headerFillColor || theme.primaryColor)
    const headerText = this.normalizeSvgColor(
      table.style?.headerTextColor ||
        (theme.backgroundColor === 'FFFFFF' ? 'FFFFFF' : theme.backgroundColor)
    )
    const borderColor = this.normalizeSvgColor(table.style?.borderColor || theme.secondaryColor)
    const bodyText = this.normalizeSvgColor(table.style?.bodyTextColor || theme.textColor)
    const bodyFill = this.normalizeSvgColor(table.style?.bodyFillColor || 'FFFFFF')
    const fontPx = Math.max(this.pointsToPreviewPx(11, pageSize, canvas), 11)
    const lines: string[] = [
      `<rect x="${position.x}" y="${position.y}" width="${position.w}" height="${usedHeight}" rx="10" fill="${bodyFill}" stroke="${borderColor}" stroke-width="1.5" />`,
      `<rect x="${position.x}" y="${position.y}" width="${position.w}" height="${rowHeight}" rx="10" fill="${headerFill}" />`
    ]

    for (let columnIndex = 1; columnIndex < columnCount; columnIndex += 1) {
      const x = position.x + columnIndex * colWidth
      lines.push(
        `<line x1="${x}" y1="${position.y}" x2="${x}" y2="${position.y + usedHeight}" stroke="${borderColor}" stroke-width="1" />`
      )
    }

    for (let rowIndex = 1; rowIndex < rowCount; rowIndex += 1) {
      const y = position.y + rowIndex * rowHeight
      lines.push(
        `<line x1="${position.x}" y1="${y}" x2="${position.x + position.w}" y2="${y}" stroke="${borderColor}" stroke-width="1" />`
      )
    }

    table.headers.forEach((header, index) => {
      const cell = this.renderPreviewTextBlock(
        header,
        {
          x: position.x + index * colWidth + 8,
          y: position.y + 6,
          w: colWidth - 16,
          h: rowHeight - 12
        },
        {
          fontSize: 11,
          fontFace: theme.fontFace,
          bold: true,
          color: headerText
        },
        pageSize,
        canvas,
        1,
        headerText
      )
      if (cell.markup) {
        lines.push(cell.markup)
      }
    })

    visibleRows.forEach((row, rowIndex) => {
      row.forEach((cellText, columnIndex) => {
        const cell = this.renderPreviewTextBlock(
          cellText,
          {
            x: position.x + columnIndex * colWidth + 8,
            y: position.y + (rowIndex + 1) * rowHeight + 6,
            w: colWidth - 16,
            h: rowHeight - 12
          },
          {
            fontSize: 10,
            fontFace: theme.fontFace,
            color: bodyText
          },
          pageSize,
          canvas,
          1,
          bodyText
        )
        if (cell.markup) {
          lines.push(cell.markup)
        }
      })
    })

    return {
      markup: lines.join('\n'),
      usedHeight: Math.max(usedHeight, fontPx + 24)
    }
  }

  /**
   * 渲染预览图表
   */
  private renderPreviewChartBlock(
    chart: Extract<SlideContent, { type: 'chart' }>['data'],
    position: PreviewRect,
    theme: ResolvedTheme,
    pageSize: { width: number; height: number },
    canvas: PreviewCanvasSize
  ): { markup: string; usedHeight: number } {
    const usedHeight = Math.min(
      position.h,
      Math.max(this.toPreviewHeight(2.2, pageSize, canvas), 140)
    )
    const chartHeight = usedHeight - 34
    const chartTop = position.y + 26
    const values = chart.data.series[0]?.values.slice(0, 5) || []
    const maxValue = Math.max(...values, 1)
    const count = Math.max(values.length, 3)
    const barGap = 14
    const barWidth = Math.max((position.w - (count + 1) * barGap) / count, 18)
    const colors = [theme.primaryColor, theme.accentColor, theme.secondaryColor, '94A3B8', 'CBD5E1']
    const elements: string[] = [
      `<rect x="${position.x}" y="${position.y}" width="${position.w}" height="${usedHeight}" rx="16" fill="#FFFFFF" stroke="${this.normalizeSvgColor(
        theme.secondaryColor
      )}" stroke-width="1.5" />`
    ]

    const title = chart.options?.title || `${chart.type.toUpperCase()} 图表`
    const titleMarkup = this.renderPreviewTextBlock(
      title,
      {
        x: position.x + 12,
        y: position.y + 8,
        w: position.w - 24,
        h: 20
      },
      {
        fontFace: theme.headingFontFace,
        fontSize: 12,
        bold: true,
        color: theme.textColor
      },
      pageSize,
      canvas,
      1,
      theme.textColor
    )
    if (titleMarkup.markup) {
      elements.push(titleMarkup.markup)
    }

    values.forEach((value, index) => {
      const barHeight = Math.max((value / maxValue) * (chartHeight - 24), 18)
      const x = position.x + barGap + index * (barWidth + barGap)
      const y = chartTop + chartHeight - barHeight - 10
      elements.push(
        `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="8" fill="${this.normalizeSvgColor(
          colors[index % colors.length]
        )}" />`
      )
    })

    return {
      markup: elements.join('\n'),
      usedHeight
    }
  }

  /**
   * 渲染预览代码块
   */
  private renderPreviewCodeBlock(
    code: string,
    position: PreviewRect,
    pageSize: { width: number; height: number },
    canvas: PreviewCanvasSize
  ): { markup: string; usedHeight: number } {
    const usedHeight = Math.min(
      position.h,
      Math.max(this.toPreviewHeight(1.9, pageSize, canvas), 120)
    )
    const rect = `<rect x="${position.x}" y="${position.y}" width="${position.w}" height="${usedHeight}" rx="14" fill="#0F172A" />`
    const text = this.renderPreviewTextBlock(
      code.split('\n').slice(0, 4).join('\n'),
      {
        x: position.x + 14,
        y: position.y + 12,
        w: position.w - 28,
        h: usedHeight - 24
      },
      {
        fontFace: 'Menlo',
        fontSize: 10,
        color: 'E2E8F0'
      },
      pageSize,
      canvas,
      4,
      'E2E8F0'
    )

    return {
      markup: [rect, text.markup].filter(Boolean).join('\n'),
      usedHeight
    }
  }

  /**
   * 渲染预览图片占位块
   */
  private renderPreviewImageBlock(
    label: string,
    position: PreviewRect,
    theme: ResolvedTheme,
    pageSize: { width: number; height: number },
    canvas: PreviewCanvasSize
  ): { markup: string; usedHeight: number } {
    const usedHeight = Math.min(
      position.h,
      Math.max(this.toPreviewHeight(2.1, pageSize, canvas), 140)
    )
    const borderColor = this.normalizeSvgColor(theme.secondaryColor)
    const text = this.renderPreviewTextBlock(
      label,
      {
        x: position.x + 16,
        y: position.y + usedHeight / 2 - 12,
        w: position.w - 32,
        h: 24
      },
      {
        fontFace: theme.fontFace,
        fontSize: 12,
        bold: true,
        color: theme.mutedTextColor,
        align: 'center'
      },
      pageSize,
      canvas,
      1,
      theme.mutedTextColor
    )

    return {
      markup: [
        `<rect x="${position.x}" y="${position.y}" width="${position.w}" height="${usedHeight}" rx="16" fill="#FFFFFF" stroke="${borderColor}" stroke-width="1.5" stroke-dasharray="10 8" />`,
        `<path d="M ${position.x + 18} ${position.y + usedHeight - 28} L ${position.x + position.w * 0.34} ${position.y + usedHeight * 0.48} L ${position.x + position.w * 0.54} ${position.y + usedHeight - 54} L ${position.x + position.w - 18} ${position.y + usedHeight - 22}" fill="none" stroke="${borderColor}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />`,
        text.markup
      ]
        .filter(Boolean)
        .join('\n'),
      usedHeight
    }
  }

  /**
   * 渲染预览形状块
   */
  private renderPreviewShapeBlock(
    shape: Extract<SlideContent, { type: 'shape' }>['data'],
    position: PreviewRect,
    theme: ResolvedTheme,
    pageSize: { width: number; height: number },
    canvas: PreviewCanvasSize
  ): { markup: string; usedHeight: number } {
    const usedHeight = Math.min(position.h, 120)
    const markup = this.renderPreviewShape(
      shape.shape,
      {
        x: position.x,
        y: position.y,
        w: position.w,
        h: usedHeight
      },
      {
        fillColor: shape.fillColor || theme.secondaryColor,
        lineColor: shape.lineColor || theme.primaryColor,
        fillOpacity: shape.shape === 'line' ? 0 : 0.88,
        lineWidth: shape.shape === 'line' ? 2 : 1.5
      }
    )

    if (!shape.text) {
      return {
        markup,
        usedHeight
      }
    }

    const text = this.renderPreviewTextBlock(
      shape.text,
      {
        x: position.x + 14,
        y: position.y + 14,
        w: Math.max(position.w - 28, 0),
        h: Math.max(usedHeight - 28, 0)
      },
      {
        fontFace: theme.fontFace,
        fontSize: 12,
        bold: true,
        color: shape.textColor || theme.textColor,
        align: 'center'
      },
      pageSize,
      canvas,
      2,
      shape.textColor || theme.textColor
    )

    return {
      markup: [markup, text.markup].filter(Boolean).join('\n'),
      usedHeight
    }
  }

  /**
   * 渲染预览装饰图形
   */
  private renderPreviewDecorativeShape(
    shape: PresentationDecorativeShape,
    pageSize: { width: number; height: number },
    canvas: PreviewCanvasSize,
    fallbackFillColor: string
  ): string {
    return this.renderPreviewShape(shape.shape, this.toPreviewRect(shape, pageSize, canvas), {
      fillColor: shape.fillColor || fallbackFillColor,
      lineColor: shape.lineColor,
      fillOpacity:
        shape.fillTransparency === undefined ? undefined : 1 - shape.fillTransparency / 100,
      lineOpacity:
        shape.lineTransparency === undefined ? undefined : 1 - shape.lineTransparency / 100,
      lineWidth: shape.lineWidth ? Math.max(shape.lineWidth, 1) : undefined
    })
  }

  /**
   * 渲染预览 SVG 图形
   */
  private renderPreviewShape(
    shape:
      | PresentationDecorativeShape['shape']
      | Extract<SlideContent, { type: 'shape' }>['data']['shape'],
    position: PreviewRect,
    style: {
      fillColor?: string
      lineColor?: string
      fillOpacity?: number
      lineOpacity?: number
      lineWidth?: number
    }
  ): string {
    const stroke = style.lineColor ? this.normalizeSvgColor(style.lineColor) : 'none'
    const fill =
      shape === 'line' || shape === 'arc'
        ? 'none'
        : style.fillColor
          ? this.normalizeSvgColor(style.fillColor)
          : 'none'
    const fillOpacity =
      style.fillOpacity === undefined
        ? ''
        : ` fill-opacity="${this.clamp(style.fillOpacity, 0, 1)}"`
    const strokeOpacity =
      style.lineOpacity === undefined
        ? ''
        : ` stroke-opacity="${this.clamp(style.lineOpacity, 0, 1)}"`
    const strokeWidth = style.lineWidth || (shape === 'line' ? 2 : 1.5)

    switch (shape) {
      case 'rect':
        return `<rect x="${position.x}" y="${position.y}" width="${position.w}" height="${position.h}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${fillOpacity}${strokeOpacity} />`
      case 'roundRect':
        return `<rect x="${position.x}" y="${position.y}" width="${position.w}" height="${position.h}" rx="${Math.min(position.w, position.h) * 0.18}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${fillOpacity}${strokeOpacity} />`
      case 'ellipse':
        return `<ellipse cx="${position.x + position.w / 2}" cy="${position.y + position.h / 2}" rx="${position.w / 2}" ry="${position.h / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${fillOpacity}${strokeOpacity} />`
      case 'chevron': {
        const points = [
          `${position.x},${position.y + position.h * 0.1}`,
          `${position.x + position.w * 0.72},${position.y + position.h * 0.1}`,
          `${position.x + position.w},${position.y + position.h / 2}`,
          `${position.x + position.w * 0.72},${position.y + position.h * 0.9}`,
          `${position.x},${position.y + position.h * 0.9}`,
          `${position.x + position.w * 0.22},${position.y + position.h / 2}`
        ].join(' ')
        return `<polygon points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${fillOpacity}${strokeOpacity} />`
      }
      case 'arc': {
        const rx = position.w / 2
        const ry = position.h / 2
        const x1 = position.x + position.w
        const x2 = position.x
        const y = position.y + position.h / 2
        return `<path d="M ${x1} ${y} A ${rx} ${ry} 0 1 1 ${x2} ${y}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}"${strokeOpacity} />`
      }
      case 'line':
      default:
        return `<line x1="${position.x}" y1="${position.y}" x2="${position.x + position.w}" y2="${position.y + position.h}" stroke="${stroke}" stroke-width="${strokeWidth}"${strokeOpacity} />`
    }
  }

  /**
   * 预览文本换行
   */
  private wrapPreviewText(text: string, maxChars: number, maxLines: number): string[] {
    const normalized = text
      .replace(/\r/g, '')
      .split('\n')
      .flatMap((line) => {
        const compact = line.replace(/\s+/g, ' ').trim()
        return compact ? [compact] : []
      })

    const result: string[] = []

    for (const line of normalized) {
      let cursor = 0
      while (cursor < line.length && result.length < maxLines) {
        const next = line.slice(cursor, cursor + maxChars)
        result.push(next)
        cursor += maxChars
      }

      if (result.length >= maxLines) {
        break
      }
    }

    if (result.length === 0) {
      return [this.truncate(text.replace(/\s+/g, ' ').trim(), maxChars)]
    }

    const overflow = normalized.join('').length > result.join('').length
    if (overflow) {
      result[result.length - 1] = this.truncate(
        result[result.length - 1],
        Math.max(maxChars - 1, 1)
      )
    }

    return result
  }

  /**
   * 构造 SVG 字体族
   */
  private buildSvgFontFamily(fontFace: string | undefined): string {
    const primary = fontFace?.trim() || 'PingFang SC'
    return `'${this.escapeXml(primary)}', 'PingFang SC', Arial, sans-serif`
  }

  /**
   * 归一化 SVG 颜色
   */
  private normalizeSvgColor(color: string | undefined): string {
    const normalized = color?.replace(/^#/, '').trim() || '111827'
    return `#${normalized.toUpperCase()}`
  }

  /**
   * 限制数值范围
   */
  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max)
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
