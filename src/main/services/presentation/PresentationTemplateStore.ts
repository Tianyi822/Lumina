import { existsSync, readFileSync, writeFileSync } from 'fs'
import { randomUUID } from 'crypto'
import { logger } from '@main/services/logger'
import type {
  BuiltinPresentationTemplate,
  ImportPresentationTemplateRequest,
  TemplateInfo,
  UserPresentationTemplate
} from '@shared/types/presentation'
import { PresentationTemplateExtractor } from './PresentationTemplateExtractor'
import { ensurePresentationDir, getPresentationTemplateMetadataPath } from './presentationPaths'

interface StoredPresentationTemplate extends UserPresentationTemplate {}

interface PresentationTemplateMetadata {
  templates: StoredPresentationTemplate[]
  hiddenBuiltinTemplateIds: BuiltinPresentationTemplate[]
}

const BUILTIN_TEMPLATE_IDS: BuiltinPresentationTemplate[] = ['lessonPlan', 'business', 'minimal']

const BUILTIN_TEMPLATE_LABELS: Record<BuiltinPresentationTemplate, string> = {
  lessonPlan: '教案模板',
  business: '商务模板',
  minimal: '极简模板'
}

function isBuiltinTemplateId(value: unknown): value is BuiltinPresentationTemplate {
  return (
    typeof value === 'string' && BUILTIN_TEMPLATE_IDS.includes(value as BuiltinPresentationTemplate)
  )
}

/**
 * PPT 模板存储服务
 * 负责用户模板的导入、解析和持久化
 */
export class PresentationTemplateStore {
  private templates: StoredPresentationTemplate[] = []
  private hiddenBuiltinTemplateIds: BuiltinPresentationTemplate[] = []
  private loaded = false
  private readonly templateExtractor = new PresentationTemplateExtractor()

  /**
   * 获取所有用户模板
   */
  list(): StoredPresentationTemplate[] {
    this.ensureLoaded()
    return [...this.templates].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  }

  /**
   * 根据 ID 获取模板
   */
  getById(templateId: string): StoredPresentationTemplate | null {
    this.ensureLoaded()
    return this.templates.find((item) => item.id === templateId) || null
  }

  /**
   * 删除用户模板
   */
  deleteUserTemplate(templateId: string): boolean {
    this.ensureLoaded()

    const initialLength = this.templates.length
    this.templates = this.templates.filter((item) => item.id !== templateId)

    if (this.templates.length === initialLength) {
      return false
    }

    this.persist()

    logger.info('删除 PPT 模板成功', 'main', {
      templateId
    })

    return true
  }

  /**
   * 隐藏内置模板
   */
  hideBuiltin(templateId: BuiltinPresentationTemplate): boolean {
    this.ensureLoaded()

    if (!isBuiltinTemplateId(templateId) || this.hiddenBuiltinTemplateIds.includes(templateId)) {
      return false
    }

    this.hiddenBuiltinTemplateIds = [...this.hiddenBuiltinTemplateIds, templateId]
    this.persist()

    logger.info('隐藏内置 PPT 模板成功', 'main', {
      templateId
    })

    return true
  }

  /**
   * 判断内置模板是否已隐藏
   */
  isBuiltinHidden(templateId: BuiltinPresentationTemplate): boolean {
    this.ensureLoaded()
    return this.hiddenBuiltinTemplateIds.includes(templateId)
  }

  /**
   * 导入并保存模板
   */
  async importTemplate(
    request: ImportPresentationTemplateRequest
  ): Promise<StoredPresentationTemplate> {
    this.ensureLoaded()

    const baseTemplate = request.baseTemplate || 'minimal'
    const fileName = request.fileName.trim()

    if (!/\.(pptx|potx)$/i.test(fileName)) {
      throw new Error('仅支持导入 .pptx 或 .potx 模板文件')
    }

    const buffer = Buffer.from(request.data)
    const extractedStyle = await this.templateExtractor.extract(buffer)
    const normalizedName = this.normalizeTemplateName(request.name, fileName)
    const createdAt = new Date().toISOString()
    const hasExtractedLayout = !!(
      (extractedStyle.layoutSpec?.regions &&
        Object.keys(extractedStyle.layoutSpec.regions).length > 0) ||
      (extractedStyle.layoutSpec?.styles &&
        Object.keys(extractedStyle.layoutSpec.styles).length > 0)
    )

    const template: StoredPresentationTemplate = {
      id: randomUUID(),
      name: normalizedName,
      description: hasExtractedLayout
        ? `从 ${fileName} 提取版式、字体与主题样式，缺失布局回退到 ${BUILTIN_TEMPLATE_LABELS[baseTemplate]}`
        : `从 ${fileName} 提取主题样式，布局回退到 ${BUILTIN_TEMPLATE_LABELS[baseTemplate]}`,
      originalFileName: fileName,
      baseTemplate,
      theme: extractedStyle.theme,
      layoutSpec: extractedStyle.layoutSpec,
      previewColors: extractedStyle.previewColors,
      previewImageDataUrl: extractedStyle.previewImageDataUrl,
      pageSize: extractedStyle.pageSize,
      createdAt
    }

    this.templates = [template, ...this.templates]
    this.persist()

    logger.info('导入 PPT 模板成功', 'main', {
      templateId: template.id,
      name: template.name,
      baseTemplate: template.baseTemplate,
      originalFileName: template.originalFileName
    })

    return template
  }

  /**
   * 转换为前端模板信息
   */
  toTemplateInfo(template: StoredPresentationTemplate): TemplateInfo {
    return {
      id: 'custom',
      selectionKey: `custom:${template.id}`,
      source: 'user',
      name: template.name,
      description: template.description,
      userTemplateId: template.id,
      baseTemplate: template.baseTemplate,
      previewColors: template.previewColors,
      previewImageDataUrl: template.previewImageDataUrl,
      theme: template.theme,
      pageSize: template.pageSize,
      originalFileName: template.originalFileName
    }
  }

  /**
   * 确保存储数据已加载
   */
  private ensureLoaded(): void {
    if (this.loaded) {
      return
    }

    ensurePresentationDir()
    const metadataPath = getPresentationTemplateMetadataPath()

    if (!existsSync(metadataPath)) {
      this.templates = []
      this.hiddenBuiltinTemplateIds = []
      this.loaded = true
      return
    }

    try {
      const content = readFileSync(metadataPath, 'utf-8')
      const parsed = JSON.parse(content)
      const metadata = this.normalizeMetadata(parsed)

      this.templates = metadata.templates
      this.hiddenBuiltinTemplateIds = metadata.hiddenBuiltinTemplateIds
      this.loaded = true
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('加载 PPT 模板元数据失败', 'main', { error: errorMessage })
      this.templates = []
      this.hiddenBuiltinTemplateIds = []
      this.loaded = true
    }
  }

  /**
   * 持久化模板元数据
   */
  private persist(): void {
    ensurePresentationDir()
    const metadataPath = getPresentationTemplateMetadataPath()
    const metadata: PresentationTemplateMetadata = {
      templates: this.templates,
      hiddenBuiltinTemplateIds: this.hiddenBuiltinTemplateIds
    }
    writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8')
  }

  /**
   * 兼容旧版数组格式和新版对象格式
   */
  private normalizeMetadata(value: unknown): PresentationTemplateMetadata {
    if (Array.isArray(value)) {
      return {
        templates: value.filter((item): item is StoredPresentationTemplate =>
          this.isValidTemplateRecord(item)
        ),
        hiddenBuiltinTemplateIds: []
      }
    }

    if (!value || typeof value !== 'object') {
      return {
        templates: [],
        hiddenBuiltinTemplateIds: []
      }
    }

    const target = value as Partial<PresentationTemplateMetadata>

    return {
      templates: Array.isArray(target.templates)
        ? target.templates.filter((item): item is StoredPresentationTemplate =>
            this.isValidTemplateRecord(item)
          )
        : [],
      hiddenBuiltinTemplateIds: Array.isArray(target.hiddenBuiltinTemplateIds)
        ? Array.from(new Set(target.hiddenBuiltinTemplateIds.filter(isBuiltinTemplateId)))
        : []
    }
  }

  /**
   * 规范化模板名称
   */
  private normalizeTemplateName(_name: string | undefined, fileName: string): string {
    const baseName = fileName.replace(/\.[^.]+$/, '').trim() || '未命名模板'
    const normalizedName = `模板-${baseName}`.slice(0, 80)

    return normalizedName || '模板-未命名模板'
  }

  /**
   * 校验模板记录结构
   */
  private isValidTemplateRecord(value: unknown): value is StoredPresentationTemplate {
    if (!value || typeof value !== 'object') {
      return false
    }

    const target = value as Partial<StoredPresentationTemplate>
    return (
      typeof target.id === 'string' &&
      typeof target.name === 'string' &&
      typeof target.description === 'string' &&
      typeof target.originalFileName === 'string' &&
      isBuiltinTemplateId(target.baseTemplate) &&
      typeof target.createdAt === 'string' &&
      !!target.theme &&
      typeof target.theme === 'object'
    )
  }
}
