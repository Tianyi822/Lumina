import { posix } from 'path'
import imageSize from 'image-size'
import { logger } from '@main/services/logger'
import type {
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
  PptChartContent
} from '@shared/types/ppt-template'
import type { PptxFiles, XmlNode } from './types'
import { STRUCTURAL_TAGS } from './types'
import { RelationshipResolver } from './RelationshipResolver'

/**
 * PPT 元素分析器
 * 负责解析 PPT 中的各类元素（形状、图片、表格、图表等）
 */
export class ElementAnalyzer {
  private relResolver: RelationshipResolver

  constructor(relResolver: RelationshipResolver) {
    this.relResolver = relResolver
  }

  /**
   * 从 XML 中提取元素
   */
  extractElementsFromXml(
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
  parseTextContent(txBody: XmlNode | undefined): PptTextContent | undefined {
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

    const relationshipTarget = this.relResolver.resolveRelationshipTarget(
      files,
      ownerPath,
      relationshipId
    )
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
      ? this.relResolver.resolveRelationshipTarget(files, ownerPath, relationshipId)
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
   * 提取颜色值
   */
  extractColor(node: XmlNode | undefined): string | undefined {
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
    return typeof value === 'object' && value !== null ? (value as XmlNode) : undefined
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
      return value.filter(
        (item): item is XmlNode => typeof item === 'object' && item !== null
      ) as XmlNode[]
    }

    return typeof value === 'object' && value !== null ? [value as XmlNode] : []
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
