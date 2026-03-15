import type {
  PptTemplateSlideAnalysis,
  PptTemplateElementAnalysis,
  PptSlideBackground
} from '@shared/types/ppt-template'
import type { PptxFiles, PptxSlideFile, PptxLayoutFile, PptxMasterFile, XmlNode } from './types'
import { ElementAnalyzer } from './ElementAnalyzer'
import { RelationshipResolver } from './RelationshipResolver'

/**
 * PPT 幻灯片分析器
 * 负责分析单张幻灯片，包括元素解析、继承链合并、背景和备注解析
 */
export class SlideAnalyzer {
  private elementAnalyzer: ElementAnalyzer
  private relResolver: RelationshipResolver

  constructor(elementAnalyzer: ElementAnalyzer, relResolver: RelationshipResolver) {
    this.elementAnalyzer = elementAnalyzer
    this.relResolver = relResolver
  }

  /**
   * 分析单张幻灯片
   */
  async analyzeSlide(
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
      elements.push(...this.elementAnalyzer.extractElementsFromXml(masterRoot, 'master', files, master.path))
    }

    if (layout) {
      const layoutRoot = this.getNode(layout.xml, 'p:sldLayout') ?? layout.xml
      elements.push(...this.elementAnalyzer.extractElementsFromXml(layoutRoot, 'layout', files, layout.path))
    }

    elements.push(...this.elementAnalyzer.extractElementsFromXml(slideXml, 'slide', files, slidePath))

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
        color: this.elementAnalyzer.extractColor(solidFill)
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
          ? this.relResolver.resolveRelationshipTarget(files, ownerPath, relationshipId)
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
    if (typeof node !== 'object' || node === null) {
      return
    }

    const text = this.getString(this.getValue(node as XmlNode, 'a:t'))
    if (text) {
      collector.push(text)
    }

    for (const child of Object.values(node)) {
      if (Array.isArray(child)) {
        child.forEach((item) => this.collectTextValues(item, collector))
        continue
      }

      if (typeof child === 'object' && child !== null) {
        this.collectTextValues(child, collector)
      }
    }
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
}
