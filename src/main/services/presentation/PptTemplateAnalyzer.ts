/**
 * PPT 模板分析器
 * 解析 .pptx 文件结构，提取幻灯片、元素、样式等信息
 */

import { unzipSync } from 'fflate'
import { XMLParser } from 'fast-xml-parser'
import imageSize from 'image-size'
import { createHash } from 'crypto'
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

/** EMU 转 像素的比率（914400 EMU = 1 英寸，96 DPI） */
// const EMU_PER_PIXEL = 914400 / 96

/** XML 解析器配置 */
const XML_PARSER_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: '',
  textNodeName: '#text',
  ignoreDeclaration: true,
  ignorePiTags: true
}

/**
 * PPTX 文件内部结构
 */
interface PptxFiles {
  /** 幻灯片 XML */
  slides: Map<number, PptxSlideFile>
  /** 幻灯片布局 XML */
  layouts: Map<string, PptxLayoutFile>
  /** 幻灯片母版 XML */
  masters: Map<string, PptxMasterFile>
  /** 主题 XML */
  themes: Map<string, any>
  /** 内容类型 */
  contentTypes?: any
  /** 关系文件 */
  relationships: Map<string, any[]>
  /** 媒体文件 */
  media: Map<string, Uint8Array>
}

interface PptxSlideFile {
  path: string
  xml: any
  layoutId?: string
  masterId?: string
}

interface PptxLayoutFile {
  path: string
  xml: any
  masterId?: string
  name?: string
}

interface PptxMasterFile {
  path: string
  xml: any
  name?: string
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
    error?: string
  }> {
    try {
      // 解压 PPTX 文件
      const files = await this.extractPptxFiles(buffer)
      if (!files) {
        return { success: false, error: '无法解压 PPTX 文件' }
      }

      // 解析演示文稿信息
      const presentation = this.parsePresentationInfo(files)

      // 解析每张幻灯片
      const slides: PptTemplateSlideAnalysis[] = []
      for (const [index, slideFile] of files.slides) {
        const slideAnalysis = await this.analyzeSlide(index, slideFile, files)
        slides.push(slideAnalysis)
      }

      // 构建分析结果
      const fileHash = this.calculateHash(buffer)

      const analysis: PptTemplateAnalysis = {
        schemaVersion: ANALYSIS_VERSION,
        templateId,
        templateName,
        source: {
          originalFileName: fileName,
          fileSize: buffer.length,
          uploadedAt: new Date().toISOString(),
          hash: fileHash
        },
        presentation,
        slides
      }

      logger.info('PPTX 模板分析完成', 'main', {
        templateId,
        slideCount: slides.length
      })

      return { success: true, analysis }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('PPTX 模板分析失败', 'main', { error: errorMessage })
      return { success: false, error: errorMessage }
    }
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
        themes: new Map(),
        relationships: new Map(),
        media: new Map()
      }

      // 解析 [Content_Types].xml
      const contentTypesPath = '[Content_Types].xml'
      if (unzipped[contentTypesPath]) {
        const content = Buffer.from(unzipped[contentTypesPath]).toString('utf-8')
        files.contentTypes = this.parser.parse(content)
      }

      // 解析关系文件和主要内容
      for (const [path, data] of Object.entries(unzipped)) {
        // 只处理 XML 文件
        if (!path.endsWith('.xml') && !path.endsWith('.rels')) continue

        const content = Buffer.from(data).toString('utf-8')

        // 幻灯片文件
        if (path.match(/\/slides\/slide\d+\.xml$/)) {
          const match = path.match(/slide(\d+)\.xml$/)
          if (match) {
            const index = parseInt(match[1]) - 1
            files.slides.set(index, { path, xml: this.parser.parse(content) })
          }
        }
        // 幻灯片布局文件
        else if (path.match(/\/slideLayouts\/[^/]+\.xml$/)) {
          const match = path.match(/([^/]+)\.xml$/)
          if (match) {
            const layoutId = match[1]
            files.layouts.set(layoutId, { path, xml: this.parser.parse(content) })
          }
        }
        // 幻灯片母版文件
        else if (path.match(/\/slideMasters\/[^/]+\.xml$/)) {
          const match = path.match(/([^/]+)\.xml$/)
          if (match) {
            const masterId = match[1]
            files.masters.set(masterId, { path, xml: this.parser.parse(content) })
          }
        }
        // 主题文件
        else if (path.match(/\/theme\/[^/]+\.xml$/)) {
          const match = path.match(/([^/]+)\.xml$/)
          if (match) {
            const themeId = match[1]
            files.themes.set(themeId, this.parser.parse(content))
          }
        }
        // 关系文件
        else if (path.endsWith('.rels')) {
          const rels = this.parseRelationships(content)
          // 使用文件路径（去掉 .rels 后缀）作为键
          const key = path.replace('.rels', '')
          files.relationships.set(key, rels)
        }
      }

      // 解析幻灯片的关系，获取布局和母版引用
      this.resolveSlideRelationships(files)

      // 解析布局的关系，获取母版引用
      this.resolveLayoutRelationships(files)

      // 收集媒体文件
      for (const [path, data] of Object.entries(unzipped)) {
        if (path.startsWith('ppt/media/')) {
          files.media.set(path, data)
        }
      }

      return files
    } catch (error) {
      logger.error('解压 PPTX 文件失败', 'main', { error })
      return null
    }
  }

  /**
   * 解析关系文件
   */
  private parseRelationships(content: string): any[] {
    try {
      const xml = this.parser.parse(content)
      const relationships = xml?.Relationships?.Relationship
      if (!relationships) return []

      // 统一处理为数组
      return Array.isArray(relationships) ? relationships : [relationships]
    } catch {
      return []
    }
  }

  /**
   * 解析幻灯片的关系引用
   */
  private resolveSlideRelationships(files: PptxFiles): void {
    for (const [index, slide] of files.slides) {
      // 构建关系文件键
      const key = `ppt/slides/slide${index + 1}.xml`

      const rels = files.relationships.get(key)
      if (!rels) continue

      for (const rel of rels) {
        if (rel.Type && rel.Type.includes('/slideLayout')) {
          // 提取布局 ID
          const match = rel.Target.match(/\/([^/]+)\.xml$/)
          if (match) {
            slide.layoutId = match[1]
          }
        }
      }
    }
  }

  /**
   * 解析布局的关系引用
   */
  private resolveLayoutRelationships(files: PptxFiles): void {
    for (const [layoutId, layout] of files.layouts) {
      const key = `ppt/slideLayouts/${layoutId}.xml`
      const rels = files.relationships.get(key)
      if (!rels) continue

      for (const rel of rels) {
        if (rel.Type && rel.Type.includes('/slideMaster')) {
          const match = rel.Target.match(/\/([^/]+)\.xml$/)
          if (match) {
            layout.masterId = match[1]
          }
        }
      }

      // 获取布局名称
      const slideLayout = layout.xml?.['p:sldLayout']
      if (slideLayout) {
        layout.name = slideLayout.name || layoutId
      }
    }
  }

  /**
   * 解析演示文稿信息
   */
  private parsePresentationInfo(files: PptxFiles): PptPresentationOverview {
    // 默认尺寸（16:9）
    let slideWidth = 12192000 // 12192000 EMU = 13.333 英寸
    let slideHeight = 6858000 // 6858000 EMU = 7.5 英寸
    let themeName: string | undefined
    let masterCount = files.masters.size
    let layoutCount = files.layouts.size

    // 尝试从主题获取名称
    for (const [id, theme] of files.themes) {
      const themeElements = theme?.['a:theme']?.['a:themeElements']
      if (themeElements) {
        themeName = id
        break
      }
    }

    return {
      slideCount: files.slides.size,
      slideWidth,
      slideHeight,
      themeName,
      masterCount,
      layoutCount
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
    const slideXml = slideFile.xml?.['p:sld']
    if (!slideXml) {
      return this.createEmptySlideAnalysis(index)
    }

    // 获取布局和母版信息
    const layout = slideFile.layoutId ? files.layouts.get(slideFile.layoutId) : undefined
    const master = layout?.masterId ? files.masters.get(layout.masterId) : undefined

    // 解析元素
    const elements = this.parseElements(slideXml, layout, master, files)

    // 获取文本内容
    const plainText = elements
      .filter((e) => e.text)
      .map((e) => e.text?.plainText || '')
      .join('\n')

    // 获取标题（通常是第一个文本元素）
    const titleElement = elements.find(
      (e) => e.placeholder?.type === 'title' || e.name?.toLowerCase().includes('title')
    )
    const title = titleElement?.text?.plainText || undefined

    // 解析备注
    const notesText = this.parseNotes(slideXml)

    return {
      slideIndex: index,
      title,
      notesText,
      layoutName: layout?.name,
      masterName: master?.name,
      background: this.parseBackground(slideXml),
      elements,
      plainText
    }
  }

  /**
   * 解析幻灯片元素
   */
  private parseElements(
    slideXml: any,
    layout: PptxLayoutFile | undefined,
    master: PptxMasterFile | undefined,
    files: PptxFiles
  ): PptTemplateElementAnalysis[] {
    const elements: PptTemplateElementAnalysis[] = []

    // 1. 首先从母版继承元素
    if (master?.xml) {
      const masterElements = this.extractElementsFromXml(master.xml['p:sldMaster'], 'master', files)
      elements.push(...masterElements)
    }

    // 2. 然后从布局继承元素
    if (layout?.xml) {
      const layoutElements = this.extractElementsFromXml(layout.xml['p:sldLayout'], 'layout', files)
      elements.push(...layoutElements)
    }

    // 3. 最后解析幻灯片自身的元素
    const slideElements = this.extractElementsFromXml(slideXml, 'slide', files)
    elements.push(...slideElements)

    return elements
  }

  /**
   * 从 XML 中提取元素
   */
  private extractElementsFromXml(
    container: any,
    source: PptElementSource,
    files: PptxFiles
  ): PptTemplateElementAnalysis[] {
    const elements: PptTemplateElementAnalysis[] = []

    // 获取形状容器
    // PPTX XML 结构：p:sld/p:cSld/p:spTree 或 p:sldLayout/p:cSld/p:spTree 或 p:sldMaster/p:cSld/p:spTree
    let spTree =
      container?.['p:cSld']?.['p:spTree'] || // 标准路径
      container?.['p:spTree'] || // 直接路径（备用）
      container?.['p:sldMaster']?.['p:cSld']?.['p:spTree'] || // 母版路径
      container?.['p:sldMaster']?.['p:spTree'] // 母版直接路径（备用）

    if (!spTree) {
      // 调试日志：输出 container 的键，帮助诊断问题
      const keys = container ? Object.keys(container) : 'null'
      logger.debug(`extractElementsFromXml: 未找到 spTree, source=${source}, container keys=${JSON.stringify(keys)}`)
      return elements
    }

    // 遍历所有子元素
    for (const [key, value] of Object.entries(spTree)) {
      if (key === '#text') continue
      if (!value || typeof value !== 'object') continue

      // 处理数组或单个元素
      const items = Array.isArray(value) ? value : [value]

      for (const item of items) {
        const element = this.parseSingleElement(key, item, source, files)
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
    element: any,
    source: PptElementSource,
    files: PptxFiles
  ): PptTemplateElementAnalysis | null {
    // 形状（包括文本框和占位符）
    if (tagName === 'p:sp') {
      return this.parseShape(element, source, files)
    }

    // 图片
    if (tagName === 'p:pic') {
      return this.parsePicture(element, source, files)
    }

    // 表格
    if (tagName === 'p:graphicFrame' && element?.['a:graphic']?.['a:graphicData']?.['a:tbl']) {
      return this.parseTable(element, source)
    }

    // 图表
    if (tagName === 'p:graphicFrame' && element?.['a:graphic']?.['a:graphicData']?.['c:chart']) {
      return this.parseChart(element, source)
    }

    // 组合
    if (tagName === 'p:grpSp') {
      // v1 不深度解析组合，返回占位
      return this.parseUnknownGroup(element, source)
    }

    // 连接符
    if (tagName === 'p:cxnSp') {
      return this.parseConnector(element, source)
    }

    return null
  }

  /**
   * 解析形状
   */
  private parseShape(
    element: any,
    source: PptElementSource,
    _files: PptxFiles
  ): PptTemplateElementAnalysis | null {
    const spPr = element?.['p:spPr']
    const nvSpPr = element?.['p:nvSpPr']
    const txBody = element?.['p:txBody']

    // 获取位置和尺寸
    const { x, y, cx, cy } = this.parseTransform(spPr)
    if (x === null) return null

    // 获取名称
    const name = nvSpPr?.['p:cNvPr']?.name

    // 判断是否为占位符
    const placeholder = this.parsePlaceholder(nvSpPr)

    // 解析文本
    const text = txBody ? this.parseTextContent(txBody) : undefined

    // 解析形状几何
    const shape = this.parseShapeGeometry(spPr)

    // 确定元素类型
    let kind: PptElementKind
    if (placeholder) {
      kind = 'placeholder'
    } else if (text && text.paragraphs.length > 0) {
      kind = 'text'
    } else {
      kind = 'shape'
    }

    return {
      source,
      kind,
      name,
      placeholder,
      x: x ?? 0,
      y: y ?? 0,
      cx: cx ?? 0,
      cy: cy ?? 0,
      zIndex: this.parseZOrder(element),
      text,
      shape
    }
  }

  /**
   * 解析图片
   */
  private parsePicture(
    element: any,
    source: PptElementSource,
    files: PptxFiles
  ): PptTemplateElementAnalysis | null {
    const spPr = element?.['p:spPr']
    const nvPicPr = element?.['p:nvPicPr']
    const blipFill = element?.['p:blipFill']

    // 获取位置和尺寸
    const { x, y, cx, cy } = this.parseTransform(spPr)
    if (x === null) return null

    // 获取名称
    const name = nvPicPr?.['p:cNvPr']?.name

    // 解析图片信息
    const image = this.parseImageContent(blipFill, files)

    return {
      source,
      kind: 'image',
      name,
      x: x ?? 0,
      y: y ?? 0,
      cx: cx ?? 0,
      cy: cy ?? 0,
      zIndex: this.parseZOrder(element),
      image
    }
  }

  /**
   * 解析表格
   */
  private parseTable(element: any, source: PptElementSource): PptTemplateElementAnalysis | null {
    const spPr = element?.['p:spPr']
    const graphicData = element?.['a:graphic']?.['a:graphicData']
    const tbl = graphicData?.['a:tbl']

    if (!tbl) return null

    // 获取位置和尺寸
    const { x, y, cx, cy } = this.parseTransform(spPr)
    if (x === null) return null

    // 解析表格内容
    const table = this.parseTableContent(tbl)

    return {
      source,
      kind: 'table',
      x: x ?? 0,
      y: y ?? 0,
      cx: cx ?? 0,
      cy: cy ?? 0,
      zIndex: this.parseZOrder(element),
      table
    }
  }

  /**
   * 解析图表
   */
  private parseChart(element: any, source: PptElementSource): PptTemplateElementAnalysis | null {
    const spPr = element?.['p:spPr']
    const graphicData = element?.['a:graphic']?.['a:graphicData']
    const chart = graphicData?.['c:chart']

    if (!chart) return null

    // 获取位置和尺寸
    const { x, y, cx, cy } = this.parseTransform(spPr)
    if (x === null) return null

    // 解析图表信息
    const chartContent = this.parseChartContent(chart)

    return {
      source,
      kind: 'chart',
      x: x ?? 0,
      y: y ?? 0,
      cx: cx ?? 0,
      cy: cy ?? 0,
      zIndex: this.parseZOrder(element),
      chart: chartContent
    }
  }

  /**
   * 解析未知组合
   */
  private parseUnknownGroup(
    element: any,
    source: PptElementSource
  ): PptTemplateElementAnalysis | null {
    const spPr = element?.['p:grpSpPr']
    const { x, y, cx, cy } = this.parseTransform(spPr)

    if (x === null) return null

    return {
      source,
      kind: 'group',
      x: x ?? 0,
      y: y ?? 0,
      cx: cx ?? 0,
      cy: cy ?? 0,
      zIndex: this.parseZOrder(element)
    }
  }

  /**
   * 解析连接符
   */
  private parseConnector(
    element: any,
    source: PptElementSource
  ): PptTemplateElementAnalysis | null {
    const spPr = element?.['p:spPr']
    const { x, y, cx, cy } = this.parseTransform(spPr)

    if (x === null) return null

    return {
      source,
      kind: 'connector',
      x: x ?? 0,
      y: y ?? 0,
      cx: cx ?? 0,
      cy: cy ?? 0,
      zIndex: this.parseZOrder(element)
    }
  }

  /**
   * 解析位置和尺寸
   */
  private parseTransform(spPr: any): {
    x: number | null
    y: number | null
    cx: number | null
    cy: number | null
  } {
    if (!spPr) return { x: null, y: null, cx: null, cy: null }

    const xfrm = spPr['a:xfrm'] || spPr['p:spPr']?.['a:xfrm']
    if (!xfrm) return { x: null, y: null, cx: null, cy: null }

    return {
      x: parseInt(xfrm.off?.['x'] || '0'),
      y: parseInt(xfrm.off?.['y'] || '0'),
      cx: parseInt(xfrm.ext?.['cx'] || '0'),
      cy: parseInt(xfrm.ext?.['cy'] || '0')
    }
  }

  /**
   * 解析层级
   */
  private parseZOrder(element: any): number {
    const nvSpPr = element?.['p:nvSpPr'] || element?.['p:nvPicPr']
    return parseInt(nvSpPr?.['p:nvSpPr']?.['p:nvPr']?.orderId || '0')
  }

  /**
   * 解析占位符信息
   */
  private parsePlaceholder(nvSpPr: any): PptPlaceholderInfo | undefined {
    const ph = nvSpPr?.['p:nvPr']?.['p:ph']
    if (!ph) return undefined

    return {
      type: ph.type,
      idx: ph.idx ? parseInt(ph.idx) : undefined
    }
  }

  /**
   * 解析文本内容
   */
  private parseTextContent(txBody: any): PptTextContent | undefined {
    const paragraphs: PptTextParagraph[] = []

    const aP = txBody['a:p']
    if (!aP) return undefined

    const paragraphsData = Array.isArray(aP) ? aP : [aP]

    for (const p of paragraphsData) {
      const aR = p['a:r'] || p['a:fld']
      if (!aR) {
        // 段落可能直接包含文本
        const text = p['a:t'] || ''
        if (text) {
          paragraphs.push({
            text: String(text),
            level: p['a:pPr']?.['a:lvl'] ? parseInt(p['a:pPr']['a:lvl']) : 0
          })
        }
        continue
      }

      const runs = Array.isArray(aR) ? aR : [aR]
      const paragraphText = runs.map((r: any) => r['a:t'] || '').join('')

      if (paragraphText) {
        paragraphs.push({
          text: paragraphText,
          level: p['a:pPr']?.['a:lvl'] ? parseInt(p['a:pPr']['a:lvl']) : 0
        })
      }
    }

    if (paragraphs.length === 0) return undefined

    const plainText = paragraphs.map((p) => p.text).join('\n')

    return {
      paragraphs,
      plainText
    }
  }

  /**
   * 解析形状几何
   */
  private parseShapeGeometry(spPr: any): PptShapeGeometry | undefined {
    const prstGeom = spPr?.['a:prstGeom']
    if (!prstGeom) return undefined

    const preset = prstGeom.preset

    // 解析填充
    const solidFill = spPr?.['a:solidFill'] || prstGeom?.['a:solidFill']
    const fillColor = solidFill?.['a:srgbClr']?.val || solidFill?.['a:schemeClr']?.val

    // 解析边框
    const ln = spPr?.['a:ln']
    const strokeColor =
      ln?.['a:solidFill']?.['a:srgbClr']?.val || ln?.['a:solidFill']?.['a:schemeClr']?.val
    const strokeWidth = ln?.w ? parseInt(ln.w) : undefined

    return {
      preset,
      fillColor,
      strokeColor,
      strokeWidth
    }
  }

  /**
   * 解析图片内容
   */
  private parseImageContent(blipFill: any, files: PptxFiles): PptImageContent | undefined {
    if (!blipFill) return undefined

    const blip = blipFill['a:blip']
    if (!blip) return undefined

    // 获取关系目标
    const relationshipTarget = blip['r:embed']

    // 查找媒体文件
    let fileName: string | undefined
    let pixelWidth: number | undefined
    let pixelHeight: number | undefined

    if (relationshipTarget) {
      // 遍历关系文件查找媒体路径
      for (const [, rels] of files.relationships) {
        for (const rel of rels) {
          if (rel.Id === relationshipTarget && rel.Target) {
            // 构建媒体文件路径
            const mediaPath = rel.Target.startsWith('../') ? rel.Target : `ppt/${rel.Target}`
            const mediaKey = mediaPath
              .replace(/\.\.\//g, '')
              .split('/')
              .pop()

            // 尝试获取图片尺寸
            for (const [path, data] of files.media) {
              if (path.includes(mediaKey || '')) {
                try {
                  const dimensions = imageSize(Buffer.from(data))
                  pixelWidth = dimensions.width
                  pixelHeight = dimensions.height
                  fileName = path.split('/').pop()
                } catch {
                  // 无法获取尺寸
                }
                break
              }
            }
            break
          }
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
  private parseTableContent(tbl: any): PptTableContent {
    const trs = tbl['a:tr']
    if (!trs) return { rows: 0, columns: 0, cells: [] }

    const rows = Array.isArray(trs) ? trs : [trs]
    const cells: PptTableCell[] = []

    rows.forEach((tr: any, rowIndex: number) => {
      const tcs = tr['a:tc']
      if (!tcs) return

      const cellsInRow = Array.isArray(tcs) ? tcs : [tcs]
      cellsInRow.forEach((tc: any, colIndex: number) => {
        const text = this.parseTextContent(tc)
        cells.push({
          rowIndex,
          colIndex,
          text: text?.plainText || ''
        })
      })
    })

    const columns = cells.length > 0 ? Math.max(...cells.map((c) => c.colIndex)) + 1 : 0

    return {
      rows: rows.length,
      columns,
      cells
    }
  }

  /**
   * 解析图表内容
   */
  private parseChartContent(chart: any): PptChartContent {
    // 获取图表类型
    const chartType = Object.keys(chart)
      .find((k) => k.startsWith('c:'))
      ?.replace('c:', '')

    return {
      chartType
    }
  }

  /**
   * 解析背景
   */
  private parseBackground(slideXml: any): PptSlideBackground | undefined {
    const bg = slideXml?.['p:sld']?.['p:bg']
    if (!bg) return undefined

    // TODO: v1 可以在后续版本中详细解析背景
    return {
      type: 'solid'
    }
  }

  /**
   * 解析备注
   */
  private parseNotes(_slideXml: any): string | undefined {
    // 备注通常在单独的文件中，v1 暂不解析
    return undefined
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
}
