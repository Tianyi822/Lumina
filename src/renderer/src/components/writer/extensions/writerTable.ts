import type { RawCommands } from '@tiptap/core'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { EditorState } from '@tiptap/pm/state'

/**
 * 单元格内容显式列出允许的块类型，不包含 `table`，从而在 Schema 层面直接
 * 拒绝嵌套表格（ProseMirror 的 content 表达式没有"排除"语法，只能枚举白名单）。
 */
const TABLE_CELL_CONTENT =
  '(paragraph | heading | blockquote | bulletList | orderedList | taskList | codeBlock | horizontalRule | image | blockMath)+'

const BLOCKED_TABLE_COMMANDS = new Set<keyof RawCommands>([
  'mergeCells',
  'splitCell',
  'mergeOrSplit'
])

interface AncestorTable {
  node: PMNode
  pos: number
}

function findAncestorTable(state: EditorState): AncestorTable | null {
  const { $from } = state.selection
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    if (node.type.name === 'table') return { node, pos: $from.before(depth) }
  }
  return null
}

function countColumns(tableNode: PMNode): number {
  return tableNode.firstChild?.childCount ?? 0
}

function omitBlockedTableCommands(commands: Partial<RawCommands>): Partial<RawCommands> {
  // 按生成的联合函数类型逐键赋值在 TS 中无法保持一一对应，改为整体复制后删除黑名单键。
  const next = { ...commands } as Record<string, unknown>
  for (const key of BLOCKED_TABLE_COMMANDS) {
    delete next[key]
  }
  return next as Partial<RawCommands>
}

/**
 * 基础表格：只保留新增/删除行列、切换表头、对齐等能力。
 * - 不注册合并/拆分单元格命令（mergeCells/splitCell/mergeOrSplit），避免出现不可逆的合并结构；
 * - 删除唯一剩余的一列/一行时改为删除整张表，避免留下 0 列/0 行的非法空表。
 */
export const WriterTable = Table.extend({
  addCommands() {
    const parent = (this.parent?.() ?? {}) as Partial<RawCommands>
    const safeCommands = omitBlockedTableCommands(parent)

    return {
      ...safeCommands,
      deleteColumn: () => (props) => {
        const table = findAncestorTable(props.state)
        if (table && countColumns(table.node) <= 1 && parent.deleteTable) {
          return parent.deleteTable()(props)
        }
        return parent.deleteColumn ? parent.deleteColumn()(props) : false
      },
      deleteRow: () => (props) => {
        const table = findAncestorTable(props.state)
        if (table && table.node.childCount <= 1 && parent.deleteTable) {
          return parent.deleteTable()(props)
        }
        return parent.deleteRow ? parent.deleteRow()(props) : false
      }
    }
  }
})

export const WriterTableRow = TableRow

export const WriterTableCell = TableCell.extend({
  content: TABLE_CELL_CONTENT
})

export const WriterTableHeader = TableHeader.extend({
  content: TABLE_CELL_CONTENT
})
