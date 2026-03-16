import { posix } from 'path'
import type { PptxFiles, XmlNode } from './types'

/**
 * PPTX 关系解析器
 * 负责解析幻灯片、布局、母版之间的引用关系，以及媒体文件路径
 */
export class RelationshipResolver {
  /**
   * 解析幻灯片的关系引用
   */
  resolveSlideRelationships(files: PptxFiles): void {
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
  resolveLayoutRelationships(files: PptxFiles): void {
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
  resolveMasterMetadata(files: PptxFiles): void {
    for (const [masterId, master] of files.masters) {
      const masterRoot = this.getNode(master.xml, 'p:sldMaster') ?? master.xml
      master.name =
        this.getString(this.getValue(this.getNode(masterRoot, 'p:cSld'), 'name')) ||
        this.getString(this.getValue(masterRoot, 'name')) ||
        masterId
    }
  }

  /**
   * 解析目标路径
   */
  resolveTargetPath(ownerPath: string, target: string): string {
    if (target.startsWith('/')) {
      return target.slice(1)
    }

    return posix.normalize(posix.join(posix.dirname(ownerPath), target))
  }

  /**
   * 根据关系 ID 解析目标路径
   */
  resolveRelationshipTarget(
    files: PptxFiles,
    ownerPath: string,
    relationshipId: string
  ): string | undefined {
    const rels = files.relationships.get(ownerPath) ?? []
    const relationship = rels.find((item) => item.Id === relationshipId)

    return relationship?.Target ? this.resolveTargetPath(ownerPath, relationship.Target) : undefined
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
