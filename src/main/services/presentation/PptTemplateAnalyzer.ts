/**
 * PPT 模板分析器
 * 解析 .pptx 文件结构，提取幻灯片、元素、样式等信息
 */

import { createHash } from 'crypto'
import { posix } from 'path'
import { unzipSync } from 'fflate'
import { XMLParser } from 'fast-xml-parser'
import imageSize from 'image-size'
import type {
  PptTemplateAnalysis,
  PptTemplateSlideAnalysis,
  PptTemplateElementAnalysis,
  PptElementSource,
  PptElementKind,
  PptTextContent,
  PptTextParagraph,
  PptPlaceholderInfo,
  PptShapeGeometry,
  PptImageContent,
  PptTableContent,
  PptTableCell,
  PptChartContent,
  PptSlideBackground,
  PptPresentationOverview
} from '@shared/types/ppt-template'
import { logger } from '@main/services/logger'

/** 分析器版本 */
const ANALYSIS_VERSION = '1.0.0'

/** 默认幻灯片尺寸（16:9） */
const DEFAULT_SLIDE_WIDTH = 12192000
const DEFAULT_SLIDE_HEIGHT = 6858000

/** XML 解析器配置 */
const XML_PARSER_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: '',
  textNodeName: '#text',
  ignoreDeclaration: true,
  ignorePiTags: true
}

/** spTree 中的结构节点，不应被当作页面元素 */
const STRUCTURAL_TAGS = new Set(['p:nvGrpSpPr', 'p:grpSpPr', 'p:extLst'])

type XmlNode = Record<string, unknown>

interface XmlRelationship {
  Id?: string
  Type?: string
  Target?: string
}

/**
 * PPTX 文件内部结构
 */
interface PptxFiles {
  /** 演示文稿根 XML */
  presentation?: XmlNode
  /** 幻灯片 XML */
  slides: Map<number, PptxSlideFile>
  /** 幻灯片布局 XML */
  layouts: Map<string, PptxLayoutFile>
  /** 幻灯片母版 XML */
  masters: Map<string, PptxMasterFile>
  /** 备注页 XML */
  notes: Map<string, PptxNotesFile>
  /** 图表 XML */
  charts: Map<string, XmlNode>
  /** 主题 XML */
  themes: Map<string, XmlNode>
  /** 关系文件 */
  relationships: Map<string, XmlRelationship[]>
  /** 媒体文件 */
  media: Map<string, Uint8Array>
}

interface PptxSlideFile {
  path: string
  xml: XmlNode
  layoutId?: string
  notesPath?: string
}

interface PptxLayoutFile {
  path: string
  xml: XmlNode
  masterId?: string
  name?: string
}

interface PptxMasterFile {
  path: string
  xml: XmlNode
  name?: string
}

interface PptxNotesFile {
  path: string
  xml: XmlNode
}

/**
 * PPTX 模板分析器类
 */
export class PptTemplateAnalyzer {
  private parser: XMLParser

  constructor() {
    this.parser = new XMLParser(XML_PARSER_OPTIONS)
  }

  /**
   * 分析 PPTX 文件
   */
  async analyze(
    buffer: Buffer,
    templateId: string,
    templateName: string,
    fileName: string
  ): Promise<{
    success: boolean
    analysis?: PptTemplateAnalysis
    thumbnail?: Uint8Array
    error?: string
  }> {
    try {
      const files = await this.extractPptxFiles(buffer)
      if (!files) {
        return { success: false, error: '无法解压 PPTX 文件' }
      }

      const presentation = this.parsePresentationInfo(files)
      const slides: PptTemplateSlideAnalysis[] = []
      const orderedSlides = [...files.slides.entries()].sort((left, right) => left[0] - right[0])

      for (const [index, slideFile] of orderedSlides) {
        slides.push(await this.analyzeSlide(index, slideFile, files))
      }

      const analysis: PptTemplateAnalysis = {
        schemaVersion: ANALYSIS_VERSION,
        templateId,
        templateName,
        source: {
          originalFileName: fileName,
          fileSize: buffer.length,
          uploadedAt: new Date().toISOString(),
          hash: this.calculateHash(buffer)
        },
        presentation,
        slides
      }

      // 提取内置缩略图
      const thumbnail = this.extractThumbnail(files)

      logger.info('PPTX 模板分析完成', 'main', {
        templateId,
        slideCount: slides.length,
        hasThumbnail: !!thumbnail
      })

      return { success: true, analysis, thumbnail }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('PPTX 模板分析失败', 'main', { error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 提取 PPTX 内置缩略图
   * PPTX 文件通常在 docProps/thumbnail.jpeg 包含缩略图
   */
  private extractThumbnail(files: PptxFiles): Uint8Array | undefined {
    // 尝试常见的缩略图路径
    const thumbnailPaths = [
      'docProps/thumbnail.jpeg',
      'docProps/thumbnail.jpg',
      'docProps/thumbnail.png'
    ]

    for (const path of thumbnailPaths) {
      const thumbnail = files.media.get(path)
      if (thumbnail) {
        return thumbnail
      }
    }

    return undefined
  }

  /**
   * 解压并解析 PPTX 文件结构
   */
  private async extractPptxFiles(buffer: Buffer): Promise<PptxFiles | null> {
    try {
      const unzipped = unzipSync(new Uint8Array(buffer))

      const files: PptxFiles = {
        slides: new Map(),
        layouts: new Map(),
        masters: new Map(),
        notes: new Map(),
        charts: new Map(),
        themes: new Map(),
        relationships: new Map(),
        media: new Map()
      }

      for (const [path, data] of Object.entries(unzipped)) {
        if (path.endsWith('.rels')) {
          const content = Buffer.from(data).toString('utf-8')
          const ownerPath = this.resolveRelationshipOwnerPath(path)
          files.relationships.set(ownerPath, this.parseRelationships(content))
          continue
        }

        if (path === 'ppt/presentation.xml') {
          const xml = this.parseXml(Buffer.from(data).toString('utf-8'))
          if (xml) {
            files.presentation = xml
          }
          continue
        }

        if (path.startsWith('ppt/media/')) {
          files.media.set(path, data)
          continue
        }

        if (!path.endsWith('.xml')) {
          continue
        }

        const xml = this.parseXml(Buffer.from(data).toString('utf-8'))
        if (!xml) {
          continue
        }

        const slideMatch = path.match(/\/slides\/slide(\d+)\.xml$/)
        if (slideMatch) {
          const index = parseInt(slideMatch[1], 10) - 1
          files.slides.set(index, { path, xml })
          continue
        }

        const layoutMatch = path.match(/\/slideLayouts\/([^/]+)\.xml$/)
        if (layoutMatch) {
          files.layouts.set(layoutMatch[1], { path, xml })
          continue
        }

        const masterMatch = path.match(/\/slideMasters\/([^/]+)\.xml$/)
        if (masterMatch) {
          files.masters.set(masterMatch[1], { path, xml })
          continue
        }

        if (path.match(/\/notesSlides\/[^/]+\.xml$/)) {
          files.notes.set(path, { path, xml })
          continue
        }

        if (path.match(/\/charts\/[^/]+\.xml$/)) {
          files.charts.set(path, xml)
          continue
        }

        const themeMatch = path.match(/\/theme\/([^/]+)\.xml$/)
        if (themeMatch) {
          files.themes.set(themeMatch[1], xml)
        }
      }

      this.resolveSlideRelationships(files)
      this.resolveLayoutRelationships(files)
      this.resolveMasterMetadata(files)

      return files
    } catch (error) {
      logger.error('解压 PPTX 文件失败', 'main', { error })
      return null
    }
  }

  /**
   * 解析 XML 字符串
   */
  private parseXml(content: string): XmlNode | null {
    try {
      const parsed = this.parser.parse(content)
      return this.isXmlNode(parsed) ? parsed : null
    } catch {
      return null
    }
  }

  /**
   * 解析关系文件
   */
  private parseRelationships(content: string): XmlRelationship[] {
    const xml = this.parseXml(content)
    const relationshipsRoot = this.getNode(xml, 'Relationships') ?? xml
    const relationships = this.getValue(relationshipsRoot, 'Relationship')

    return this.toNodeArray(relationships).map((item) => ({
      Id: this.getString(this.getValue(item, 'Id')),
      Type: this.getString(this.getValue(item, 'Type')),
      Target: this.getString(this.getValue(item, 'Target'))
    }))
  }

  /**
   * 解析幻灯片的关系引用
   */
  private resolveSlideRelationships(files: PptxFiles): void {
    for (const [, slide] of files.slides) {
      const rels = files.relationships.get(slide.path) ?? []

      for (const rel of rels) {
        if (rel.Type?.includes('/slideLayout') && rel.Target) {
          const layoutPath = this.resolveTargetPath(slide.path, rel.Target)
          slide.layoutId = posix.basename(layoutPath, '.xml')
        }

        if (rel.Type?.includes('/notesSlide') && rel.Target) {
          slide.notesPath = this.resolveTargetPath(slide.path, rel.Target)
        }
      }
    }
  }

  /**
   * 解析布局的关系引用
   */
  private resolveLayoutRelationships(files: PptxFiles): void {
    for (const [layoutId, layout] of files.layouts) {
      const rels = files.relationships.get(layout.path) ?? []

      for (const rel of rels) {
        if (rel.Type?.includes('/slideMaster') && rel.Target) {
          const masterPath = this.resolveTargetPath(layout.path, rel.Target)
          layout.masterId = posix.basename(masterPath, '.xml')
        }
      }

      const layoutRoot = this.getNode(layout.xml, 'p:sldLayout') ?? layout.xml
      layout.name =
        this.getString(this.getValue(layoutRoot, 'matchingName')) ||
        this.getString(this.getValue(layoutRoot, 'name')) ||
        layoutId
    }
  }

  /**
   * 解析母版元数据
   */
  private resolveMasterMetadata(files: PptxFiles): void {
    for (const [masterId, master] of files.masters) {
      const masterRoot = this.getNode(master.xml, 'p:sldMaster') ?? master.xml
      master.name =
        this.getString(this.getValue(this.getNode(masterRoot, 'p:cSld'), 'name')) ||
        this.getString(this.getValue(masterRoot, 'name')) ||
        masterId
    }
  }

  /**
   * 解析演示文稿信息
   */
  private parsePresentationInfo(files: PptxFiles): PptPresentationOverview {
    let slideWidth = DEFAULT_SLIDE_WIDTH
    let slideHeight = DEFAULT_SLIDE_HEIGHT

    const presentationRoot =
      this.getNode(files.presentation, 'p:presentation') ?? files.presentation
    const slideSize = this.getNode(presentationRoot, 'p:sldSz')

    slideWidth = this.getNumber(this.getValue(slideSize, 'cx')) ?? slideWidth
    slideHeight = this.getNumber(this.getValue(slideSize, 'cy')) ?? slideHeight

    let themeName: string | undefined
    for (const [themeId, theme] of files.themes) {
      const themeRoot = this.getNode(theme, 'a:theme') ?? theme
      themeName = this.getString(this.getValue(themeRoot, 'name')) || themeId
      if (themeName) {
        break
      }
    }

    return {
      slideCount: files.slides.size,
      slideWidth,
      slideHeight,
      themeName,
      masterCount: files.masters.size,
      layoutCount: files.layouts.size
    }
  }

  /**
   * 分析单张幻灯片
   */
  private async analyzeSlide(
    index: number,
    slideFile: PptxSlideFile,
    files: PptxFiles
  ): Promise<PptTemplateSlideAnalysis> {
    const slideXml = this.getNode(slideFile.xml, 'p:sld')
    if (!slideXml) {
      return this.createEmptySlideAnalysis(index)
    }

    const layout = slideFile.layoutId ? files.layouts.get(slideFile.layoutId) : undefined
    const master = layout?.masterId ? files.masters.get(layout.masterId) : undefined
    const elements = this.parseElements(slideXml, slideFile.path, layout, master, files)
    const plainText = elements
      .map((element) => element.text?.plainText ?? '')
      .filter(Boolean)
      .join('\n')

    const titleElement = elements.find((element) => {
      const placeholderType = element.placeholder?.type?.toLowerCase()
      return (
        placeholderType === 'title' ||
        placeholderType === 'ctrtitle' ||
        element.name?.toLowerCase().includes('title')
      )
    })

    const background =
      this.parseBackground(slideXml, slideFile.path, files) ||
      (layout
        ? this.parseBackground(this.getNode(layout.xml, 'p:sldLayout'), layout.path, files)
        : undefined) ||
      (master
        ? this.parseBackground(this.getNode(master.xml, 'p:sldMaster'), master.path, files)
        : undefined)

    return {
      slideIndex: index,
      title: titleElement?.text?.plainText,
      notesText: this.parseNotes(
        slideFile.notesPath ? files.notes.get(slideFile.notesPath)?.xml : undefined
      ),
      layoutName: layout?.name,
      masterName: master?.name,
      background,
      elements,
      plainText
    }
  }

  /**
   * 解析幻灯片元素，并合并继承占位符
   */
  private parseElements(
    slideXml: XmlNode,
    slidePath: string,
    layout: PptxLayoutFile | undefined,
    master: PptxMasterFile | undefined,
    files: PptxFiles
  ): PptTemplateElementAnalysis[] {
    const elements: PptTemplateElementAnalysis[] = []

    if (master) {
      const masterRoot = this.getNode(master.xml, 'p:sldMaster') ?? master.xml
      elements.push(...this.extractElementsFromXml(masterRoot, 'master', files, master.path))
    }

    if (layout) {
      const layoutRoot = this.getNode(layout.xml, 'p:sldLayout') ?? layout.xml
      elements.push(...this.extractElementsFromXml(layoutRoot, 'layout', files, layout.path))
    }

    elements.push(...this.extractElementsFromXml(slideXml, 'slide', files, slidePath))

    return this.mergePlaceholderElements(elements)
  }

  /**
   * 合并同一占位符的继承链，保留最终生效结构
   */
  private mergePlaceholderElements(
    elements: PptTemplateElementAnalysis[]
  ): PptTemplateElementAnalysis[] {
    const merged: PptTemplateElementAnalysis[] = []
    const placeholderIndexes = new Map<string, number>()

    for (const element of elements) {
      if (!element.placeholder) {
        merged.push(element)
        continue
      }

      const key = this.buildPlaceholderKey(element)
      const existingIndex = placeholderIndexes.get(key)

      if (existingIndex === undefined) {
        placeholderIndexes.set(key, merged.length)
        merged.push(element)
        continue
      }

      merged[existingIndex] = this.mergePlaceholderElement(merged[existingIndex], element)
    }

    return merged
  }

  /**
   * 构建占位符唯一键
   */
  private buildPlaceholderKey(element: PptTemplateElementAnalysis): string {
    const placeholderType = element.placeholder?.type ?? 'placeholder'
    const placeholderIdx = element.placeholder?.idx ?? element.name ?? 'default'
    return `${placeholderType}:${placeholderIdx}`
  }

  /**
   * 合并同一占位符的两层定义，后者优先
   */
  private mergePlaceholderElement(
    base: PptTemplateElementAnalysis,
    override: PptTemplateElementAnalysis
  ): PptTemplateElementAnalysis {
    return {
      ...base,
      ...override,
      name: override.name ?? base.name,
      placeholder: override.placeholder ?? base.placeholder,
      text: override.text ?? base.text,
      shape: override.shape ?? base.shape,
      image: override.image ?? base.image,
      table: override.table ?? base.table,
      chart: override.chart ?? base.chart
    }
  }

  /**
   * 从 XML 中提取元素
   */
  private extractElementsFromXml(
    container: XmlNode | undefined,
    source: PptElementSource,
    files: PptxFiles,
    ownerPath: string
  ): PptTemplateElementAnalysis[] {
    if (!container) {
      return []
    }

    const spTree =
      this.getNestedNode(container, 'p:cSld', 'p:spTree') ?? this.getNode(container, 'p:spTree')

    if (!spTree) {
      const keys = Object.keys(container)
      logger.debug('extractElementsFromXml: 未找到 spTree', 'main', {
        source,
        ownerPath,
        containerKeys: keys
      })
      return []
    }

    const elements: PptTemplateElementAnalysis[] = []

    for (const [tagName, value] of Object.entries(spTree)) {
      if (tagName === '#text' || STRUCTURAL_TAGS.has(tagName)) {
        continue
      }

      const items = this.toNodeArray(value)
      for (const item of items) {
        const element = this.parseSingleElement(tagName, item, source, files, ownerPath)
        if (element) {
          elements.push(element)
        }
      }
    }

    return elements
  }

  /**
   * 解析单个元素
   */
  private parseSingleElement(
    tagName: string,
    element: XmlNode,
    source: PptElementSource,
    files: PptxFiles,
    ownerPath: string
  ): PptTemplateElementAnalysis | null {
    if (tagName === 'p:sp') {
      return this.parseShape(element, source)
    }

    if (tagName === 'p:pic') {
      return this.parsePicture(element, source, files, ownerPath)
    }

    if (tagName === 'p:graphicFrame') {
      const graphicData = this.getNestedNode(element, 'a:graphic', 'a:graphicData')
      if (this.getNode(graphicData, 'a:tbl')) {
        return this.parseTable(element, source)
      }
      if (this.getNode(graphicData, 'c:chart')) {
        return this.parseChart(element, source, files, ownerPath)
      }
      if (this.getNode(graphicData, 'dgm:relIds')) {
        return this.parseUnknownElement(element, source, 'diagram', 'diagram')
      }
      return this.parseUnknownElement(element, source, 'unknown', 'graphicFrame')
    }

    if (tagName === 'p:grpSp') {
      return this.parseGroup(element, source)
    }

    if (tagName === 'p:cxnSp') {
      return this.parseConnector(element, source)
    }

    if (
      tagName === 'mc:AlternateContent' ||
      tagName === 'p:contentPart' ||
      tagName === 'p:oleObj'
    ) {
      return this.parseUnknownElement(element, source, 'unknown', tagName)
    }

    if (tagName.startsWith('p:')) {
      return this.parseUnknownElement(element, source, 'unknown', tagName)
    }

    return null
  }

  /**
   * 解析形状
   */
  private parseShape(
    element: XmlNode,
    source: PptElementSource
  ): PptTemplateElementAnalysis | null {
    const spPr = this.getNode(element, 'p:spPr')
    const nvSpPr = this.getNode(element, 'p:nvSpPr')
    const txBody = this.getNode(element, 'p:txBody')
    const transform = this.parseTransform(spPr)

    if (!transform) {
      return null
    }

    const placeholder = this.parsePlaceholder(nvSpPr)
    const text = this.parseTextContent(txBody)
    const shape = this.parseShapeGeometry(spPr)

    let kind: PptElementKind = 'shape'
    if (placeholder) {
      kind = 'placeholder'
    } else if (text) {
      kind = 'text'
    }

    return {
      source,
      kind,
      name: this.parseElementName(element),
      placeholder,
      x: transform.x,
      y: transform.y,
      cx: transform.cx,
      cy: transform.cy,
      zIndex: this.parseZOrder(element),
      text,
      shape
    }
  }

  /**
   * 解析图片
   */
  private parsePicture(
    element: XmlNode,
    source: PptElementSource,
    files: PptxFiles,
    ownerPath: string
  ): PptTemplateElementAnalysis | null {
    const transform = this.parseTransform(this.getNode(element, 'p:spPr'))
    if (!transform) {
      return null
    }

    return {
      source,
      kind: 'image',
      name: this.parseElementName(element),
      x: transform.x,
      y: transform.y,
      cx: transform.cx,
      cy: transform.cy,
      zIndex: this.parseZOrder(element),
      image: this.parseImageContent(this.getNode(element, 'p:blipFill'), files, ownerPath)
    }
  }

  /**
   * 解析表格
   */
  private parseTable(
    element: XmlNode,
    source: PptElementSource
  ): PptTemplateElementAnalysis | null {
    const transform = this.parseTransform(this.getNode(element, 'p:xfrm'))
    if (!transform) {
      return null
    }

    const table = this.parseTableContent(
      this.getNestedNode(element, 'a:graphic', 'a:graphicData', 'a:tbl')
    )

    return {
      source,
      kind: 'table',
      name: this.parseElementName(element),
      x: transform.x,
      y: transform.y,
      cx: transform.cx,
      cy: transform.cy,
      zIndex: this.parseZOrder(element),
      table
    }
  }

  /**
   * 解析图表
   */
  private parseChart(
    element: XmlNode,
    source: PptElementSource,
    files: PptxFiles,
    ownerPath: string
  ): PptTemplateElementAnalysis | null {
    const transform = this.parseTransform(this.getNode(element, 'p:xfrm'))
    if (!transform) {
      return null
    }

    return {
      source,
      kind: 'chart',
      name: this.parseElementName(element),
      x: transform.x,
      y: transform.y,
      cx: transform.cx,
      cy: transform.cy,
      zIndex: this.parseZOrder(element),
      chart: this.parseChartContent(
        this.getNestedNode(element, 'a:graphic', 'a:graphicData', 'c:chart'),
        files,
        ownerPath
      )
    }
  }

  /**
   * 解析组合元素
   */
  private parseGroup(
    element: XmlNode,
    source: PptElementSource
  ): PptTemplateElementAnalysis | null {
    const transform = this.parseTransform(this.getNode(element, 'p:grpSpPr'))
    if (!transform) {
      return null
    }

    return {
      source,
      kind: 'group',
      name: this.parseElementName(element),
      x: transform.x,
      y: transform.y,
      cx: transform.cx,
      cy: transform.cy,
      zIndex: this.parseZOrder(element)
    }
  }

  /**
   * 解析连接符
   */
  private parseConnector(
    element: XmlNode,
    source: PptElementSource
  ): PptTemplateElementAnalysis | null {
    const transform = this.parseTransform(this.getNode(element, 'p:spPr'))
    if (!transform) {
      return null
    }

    return {
      source,
      kind: 'connector',
      name: this.parseElementName(element),
      x: transform.x,
      y: transform.y,
      cx: transform.cx,
      cy: transform.cy,
      zIndex: this.parseZOrder(element)
    }
  }

  /**
   * 解析无法深度处理的元素
   */
  private parseUnknownElement(
    element: XmlNode,
    source: PptElementSource,
    kind: 'unknown' | 'diagram',
    fallbackName: string
  ): PptTemplateElementAnalysis {
    const transform = this.parseTransform(this.getNode(element, 'p:spPr')) ||
      this.parseTransform(this.getNode(element, 'p:grpSpPr')) ||
      this.parseTransform(this.getNode(element, 'p:xfrm')) || { x: 0, y: 0, cx: 0, cy: 0 }

    return {
      source,
      kind,
      name: this.parseElementName(element) ?? fallbackName,
      x: transform.x,
      y: transform.y,
      cx: transform.cx,
      cy: transform.cy,
      zIndex: this.parseZOrder(element)
    }
  }

  /**
   * 解析位置和尺寸
   */
  private parseTransform(
    spPr: XmlNode | undefined
  ): { x: number; y: number; cx: number; cy: number } | null {
    if (!spPr) {
      return null
    }

    const directXfrm = this.getNode(spPr, 'a:off') || this.getNode(spPr, 'a:ext') ? spPr : undefined
    const xfrm =
      this.getNode(spPr, 'a:xfrm') ?? this.getNestedNode(spPr, 'p:spPr', 'a:xfrm') ?? directXfrm
    if (!xfrm) {
      return null
    }

    const offset = this.getNode(xfrm, 'a:off')
    const extent = this.getNode(xfrm, 'a:ext')

    return {
      x: this.getNumber(this.getValue(offset, 'x')) ?? 0,
      y: this.getNumber(this.getValue(offset, 'y')) ?? 0,
      cx: this.getNumber(this.getValue(extent, 'cx')) ?? 0,
      cy: this.getNumber(this.getValue(extent, 'cy')) ?? 0
    }
  }

  /**
   * 解析层级
   */
  private parseZOrder(element: XmlNode): number {
    const cNvPr =
      this.getNestedNode(element, 'p:nvSpPr', 'p:cNvPr') ||
      this.getNestedNode(element, 'p:nvPicPr', 'p:cNvPr') ||
      this.getNestedNode(element, 'p:nvGraphicFramePr', 'p:cNvPr') ||
      this.getNestedNode(element, 'p:nvCxnSpPr', 'p:cNvPr') ||
      this.getNestedNode(element, 'p:nvGrpSpPr', 'p:cNvPr')

    return this.getNumber(this.getValue(cNvPr, 'id')) ?? 0
  }

  /**
   * 解析元素名称
   */
  private parseElementName(element: XmlNode): string | undefined {
    const cNvPr =
      this.getNestedNode(element, 'p:nvSpPr', 'p:cNvPr') ||
      this.getNestedNode(element, 'p:nvPicPr', 'p:cNvPr') ||
      this.getNestedNode(element, 'p:nvGraphicFramePr', 'p:cNvPr') ||
      this.getNestedNode(element, 'p:nvCxnSpPr', 'p:cNvPr') ||
      this.getNestedNode(element, 'p:nvGrpSpPr', 'p:cNvPr')

    return this.getString(this.getValue(cNvPr, 'name'))
  }

  /**
   * 解析占位符信息
   */
  private parsePlaceholder(nvSpPr: XmlNode | undefined): PptPlaceholderInfo | undefined {
    const placeholder = this.getNestedNode(nvSpPr, 'p:nvPr', 'p:ph')
    if (!placeholder) {
      return undefined
    }

    return {
      type: this.getString(this.getValue(placeholder, 'type')),
      idx: this.getNumber(this.getValue(placeholder, 'idx'))
    }
  }

  /**
   * 解析文本内容
   */
  private parseTextContent(txBody: XmlNode | undefined): PptTextContent | undefined {
    if (!txBody) {
      return undefined
    }

    const paragraphs: PptTextParagraph[] = []
    for (const paragraph of this.toNodeArray(this.getValue(txBody, 'a:p'))) {
      const runs = [
        ...this.toNodeArray(this.getValue(paragraph, 'a:r')),
        ...this.toNodeArray(this.getValue(paragraph, 'a:fld'))
      ]

      const paragraphText = runs
        .map((run) => this.getString(this.getValue(run, 'a:t')) ?? '')
        .join('')

      const fallbackText = this.getString(this.getValue(paragraph, 'a:t'))
      const text = paragraphText || fallbackText

      if (!text) {
        continue
      }

      const paragraphProps = this.getNode(paragraph, 'a:pPr')
      paragraphs.push({
        text,
        level: this.getNumber(this.getValue(paragraphProps, 'lvl')) ?? 0
      })
    }

    if (paragraphs.length === 0) {
      return undefined
    }

    return {
      paragraphs,
      plainText: paragraphs.map((paragraph) => paragraph.text).join('\n')
    }
  }

  /**
   * 解析形状几何
   */
  private parseShapeGeometry(spPr: XmlNode | undefined): PptShapeGeometry | undefined {
    if (!spPr) {
      return undefined
    }

    const presetGeometry = this.getNode(spPr, 'a:prstGeom')
    if (!presetGeometry) {
      return undefined
    }

    return {
      preset:
        this.getString(this.getValue(presetGeometry, 'prst')) ||
        this.getString(this.getValue(presetGeometry, 'preset')),
      fillColor: this.extractColor(this.getNode(spPr, 'a:solidFill')),
      strokeColor: this.extractColor(this.getNestedNode(spPr, 'a:ln', 'a:solidFill')),
      strokeWidth: this.getNumber(this.getValue(this.getNode(spPr, 'a:ln'), 'w'))
    }
  }

  /**
   * 解析图片内容
   */
  private parseImageContent(
    blipFill: XmlNode | undefined,
    files: PptxFiles,
    ownerPath: string
  ): PptImageContent | undefined {
    const blip = this.getNode(blipFill, 'a:blip')
    const relationshipId = this.getString(this.getValue(blip, 'r:embed'))

    if (!relationshipId) {
      return undefined
    }

    const relationshipTarget = this.resolveRelationshipTarget(files, ownerPath, relationshipId)
    const fileName = relationshipTarget ? posix.basename(relationshipTarget) : undefined

    let pixelWidth: number | undefined
    let pixelHeight: number | undefined

    if (relationshipTarget) {
      const imageData = files.media.get(relationshipTarget)
      if (imageData) {
        try {
          const dimensions = imageSize(Buffer.from(imageData))
          pixelWidth = dimensions.width
          pixelHeight = dimensions.height
        } catch {
          // 忽略无法读取尺寸的图片
        }
      }
    }

    return {
      relationshipTarget,
      fileName,
      pixelWidth,
      pixelHeight
    }
  }

  /**
   * 解析表格内容
   */
  private parseTableContent(tbl: XmlNode | undefined): PptTableContent {
    if (!tbl) {
      return { rows: 0, columns: 0, cells: [] }
    }

    const rows = this.toNodeArray(this.getValue(tbl, 'a:tr'))
    const cells: PptTableCell[] = []

    rows.forEach((row, rowIndex) => {
      const rowCells = this.toNodeArray(this.getValue(row, 'a:tc'))
      rowCells.forEach((cell, colIndex) => {
        const text = this.parseTextContent(this.getNode(cell, 'a:txBody') ?? cell)
        cells.push({
          rowIndex,
          colIndex,
          text: text?.plainText ?? ''
        })
      })
    })

    return {
      rows: rows.length,
      columns: rows.reduce(
        (maxColumns, row) =>
          Math.max(maxColumns, this.toNodeArray(this.getValue(row, 'a:tc')).length),
        0
      ),
      cells
    }
  }

  /**
   * 解析图表内容
   */
  private parseChartContent(
    chart: XmlNode | undefined,
    files: PptxFiles,
    ownerPath: string
  ): PptChartContent {
    const relationshipId = this.getString(this.getValue(chart, 'r:id'))
    const relationshipTarget = relationshipId
      ? this.resolveRelationshipTarget(files, ownerPath, relationshipId)
      : undefined

    return {
      relationshipTarget,
      chartType: relationshipTarget ? this.resolveChartType(relationshipTarget, files) : undefined
    }
  }

  /**
   * 解析图表类型
   */
  private resolveChartType(chartPath: string, files: PptxFiles): string | undefined {
    const chartXml = files.charts.get(chartPath)
    if (!chartXml) {
      return undefined
    }

    const chartSpace = this.getNode(chartXml, 'c:chartSpace') ?? chartXml
    const plotArea = this.getNestedNode(chartSpace, 'c:chart', 'c:plotArea')
    if (!plotArea) {
      return undefined
    }

    const chartKey = Object.keys(plotArea).find(
      (key) => key.startsWith('c:') && key.endsWith('Chart')
    )

    return chartKey?.replace('c:', '')
  }

  /**
   * 解析背景
   */
  private parseBackground(
    container: XmlNode | undefined,
    ownerPath: string,
    files: PptxFiles
  ): PptSlideBackground | undefined {
    if (!container) {
      return undefined
    }

    const background =
      this.getNode(container, 'p:bg') ?? this.getNestedNode(container, 'p:cSld', 'p:bg')
    if (!background) {
      return undefined
    }

    const backgroundProps = this.getNode(background, 'p:bgPr') ?? background
    const solidFill = this.getNode(backgroundProps, 'a:solidFill')
    if (solidFill) {
      return {
        type: 'solid',
        color: this.extractColor(solidFill)
      }
    }

    if (this.getNode(backgroundProps, 'a:gradFill')) {
      return { type: 'gradient' }
    }

    if (this.getNode(backgroundProps, 'a:pattFill')) {
      return { type: 'pattern' }
    }

    const blipFill = this.getNode(backgroundProps, 'a:blipFill')
    if (blipFill) {
      const blip = this.getNode(blipFill, 'a:blip')
      const relationshipId = this.getString(this.getValue(blip, 'r:embed'))

      return {
        type: 'image',
        imagePath: relationshipId
          ? this.resolveRelationshipTarget(files, ownerPath, relationshipId)
          : undefined
      }
    }

    return { type: 'solid' }
  }

  /**
   * 解析备注文本
   */
  private parseNotes(notesXml: XmlNode | undefined): string | undefined {
    if (!notesXml) {
      return undefined
    }

    const notesRoot = this.getNode(notesXml, 'p:notes') ?? notesXml
    const collectedTexts: string[] = []
    this.collectTextValues(notesRoot, collectedTexts)

    const notesText = collectedTexts
      .map((text) => text.trim())
      .filter(Boolean)
      .join('\n')

    return notesText || undefined
  }

  /**
   * 递归提取文本节点
   */
  private collectTextValues(node: unknown, collector: string[]): void {
    if (!this.isXmlNode(node)) {
      return
    }

    const text = this.getString(this.getValue(node, 'a:t'))
    if (text) {
      collector.push(text)
    }

    for (const child of Object.values(node)) {
      if (Array.isArray(child)) {
        child.forEach((item) => this.collectTextValues(item, collector))
        continue
      }

      if (this.isXmlNode(child)) {
        this.collectTextValues(child, collector)
      }
    }
  }

  /**
   * 提取颜色值
   */
  private extractColor(node: XmlNode | undefined): string | undefined {
    if (!node) {
      return undefined
    }

    const colorNode =
      this.getNode(node, 'a:srgbClr') ||
      this.getNode(node, 'a:schemeClr') ||
      this.getNode(node, 'a:prstClr')

    return this.getString(this.getValue(colorNode, 'val'))
  }

  /**
   * 解析关系文件对应的宿主路径
   */
  private resolveRelationshipOwnerPath(path: string): string {
    return posix.normalize(path.replace('/_rels/', '/').replace(/\.rels$/, ''))
  }

  /**
   * 解析目标路径
   */
  private resolveTargetPath(ownerPath: string, target: string): string {
    if (target.startsWith('/')) {
      return target.slice(1)
    }

    return posix.normalize(posix.join(posix.dirname(ownerPath), target))
  }

  /**
   * 根据关系 ID 解析目标路径
   */
  private resolveRelationshipTarget(
    files: PptxFiles,
    ownerPath: string,
    relationshipId: string
  ): string | undefined {
    const rels = files.relationships.get(ownerPath) ?? []
    const relationship = rels.find((item) => item.Id === relationshipId)

    return relationship?.Target ? this.resolveTargetPath(ownerPath, relationship.Target) : undefined
  }

  /**
   * 创建空的幻灯片分析
   */
  private createEmptySlideAnalysis(index: number): PptTemplateSlideAnalysis {
    return {
      slideIndex: index,
      elements: [],
      plainText: ''
    }
  }

  /**
   * 计算文件哈希
   */
  private calculateHash(buffer: Buffer): string {
    return createHash('md5').update(buffer).digest('hex')
  }

  /**
   * 判断是否为 XML 节点对象
   */
  private isXmlNode(value: unknown): value is XmlNode {
    return typeof value === 'object' && value !== null
  }

  /**
   * 获取对象属性值
   */
  private getValue(node: XmlNode | undefined | null, key: string): unknown {
    return node?.[key]
  }

  /**
   * 获取对象子节点
   */
  private getNode(node: XmlNode | undefined | null, key: string): XmlNode | undefined {
    const value = this.getValue(node, key)
    return this.isXmlNode(value) ? value : undefined
  }

  /**
   * 获取嵌套子节点
   */
  private getNestedNode(node: XmlNode | undefined | null, ...keys: string[]): XmlNode | undefined {
    let current: XmlNode | undefined = node ?? undefined

    for (const key of keys) {
      current = this.getNode(current, key)
      if (!current) {
        return undefined
      }
    }

    return current
  }

  /**
   * 将值转换为 XML 节点数组
   */
  private toNodeArray(value: unknown): XmlNode[] {
    if (Array.isArray(value)) {
      return value.filter((item): item is XmlNode => this.isXmlNode(item))
    }

    return this.isXmlNode(value) ? [value] : []
  }

  /**
   * 读取字符串值
   */
  private getString(value: unknown): string | undefined {
    if (typeof value === 'string') {
      return value
    }

    if (typeof value === 'number') {
      return String(value)
    }

    return undefined
  }

  /**
   * 读取数值
   */
  private getNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }

    if (typeof value === 'string') {
      const parsed = parseInt(value, 10)
      return Number.isNaN(parsed) ? undefined : parsed
    }

    return undefined
  }
}
