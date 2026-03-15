/**
 * PPT 模板分析器类型定义
 */

/** XML 节点 */
export type XmlNode = Record<string, unknown>

/** XML 关系 */
export interface XmlRelationship {
  Id?: string
  Type?: string
  Target?: string
}

/**
 * PPTX 文件内部结构
 */
export interface PptxFiles {
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

export interface PptxSlideFile {
  path: string
  xml: XmlNode
  layoutId?: string
  notesPath?: string
}

export interface PptxLayoutFile {
  path: string
  xml: XmlNode
  masterId?: string
  name?: string
}

export interface PptxMasterFile {
  path: string
  xml: XmlNode
  name?: string
}

export interface PptxNotesFile {
  path: string
  xml: XmlNode
}

/** 分析器版本 */
export const ANALYSIS_VERSION = '1.0.0'

/** 默认幻灯片尺寸（16:9） */
export const DEFAULT_SLIDE_WIDTH = 12192000
export const DEFAULT_SLIDE_HEIGHT = 6858000

/** XML 解析器配置 */
export const XML_PARSER_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: '',
  textNodeName: '#text',
  ignoreDeclaration: true,
  ignorePiTags: true
}

/** spTree 中的结构节点，不应被当作页面元素 */
export const STRUCTURAL_TAGS = new Set(['p:nvGrpSpPr', 'p:grpSpPr', 'p:extLst'])
