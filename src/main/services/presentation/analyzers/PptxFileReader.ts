import { posix } from 'path'
import { unzipSync } from 'fflate'
import { XMLParser } from 'fast-xml-parser'
import { logger } from '@main/services/logger'
import type {
  PptxFiles,
  XmlNode,
  XmlRelationship
} from './types'
import { XML_PARSER_OPTIONS } from './types'

/**
 * PPTX 文件读取器
 * 负责解压 PPTX 文件并初步解析核心 XML
 */
export class PptxFileReader {
  private parser: XMLParser

  constructor() {
    this.parser = new XMLParser(XML_PARSER_OPTIONS)
  }

  /**
   * 解压并解析 PPTX 文件结构
   */
  async extractPptxFiles(buffer: Buffer): Promise<PptxFiles | null> {
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

      return files
    } catch (error) {
      logger.error('解压 PPTX 文件失败', 'main', { error })
      return null
    }
  }

  /**
   * 解析 XML 字符串
   */
  parseXml(content: string): XmlNode | null {
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
   * 解析关系文件对应的宿主路径
   */
  private resolveRelationshipOwnerPath(path: string): string {
    return posix.normalize(path.replace('/_rels/', '/').replace(/\.rels$/, ''))
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
}
