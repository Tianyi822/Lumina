import type { WriterJsonDocument, WriterJsonNode } from '@shared/types/writer'

/** 大纲条目只保存标题的展示信息，`nodeId` 用于点击定位到正文对应的标题块。 */
export interface WriterOutlineItem {
  nodeId: string
  level: number
  text: string
}

function extractNodeText(node: WriterJsonNode): string {
  if (typeof node.text === 'string') return node.text
  return (node.content ?? []).map(extractNodeText).join('')
}

function collectOutlineItems(node: WriterJsonNode, items: WriterOutlineItem[]): void {
  const nodeId = node.attrs?.nodeId
  const level = node.attrs?.level
  if (node.type === 'heading' && typeof nodeId === 'string' && typeof level === 'number') {
    items.push({ nodeId, level, text: extractNodeText(node) })
  }
  for (const child of node.content ?? []) {
    collectOutlineItems(child, items)
  }
}

/**
 * 大纲只由标题节点派生，不落盘为第二份目录：每次都从当前 EditorState 的 JSON
 * 重新计算，顺序与层级完全跟随正文标题的实际位置。
 */
export function deriveWriterOutline(document: WriterJsonDocument): WriterOutlineItem[] {
  const items: WriterOutlineItem[] = []
  collectOutlineItems(document, items)
  return items
}
