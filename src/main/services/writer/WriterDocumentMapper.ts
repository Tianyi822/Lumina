import { basename, join } from 'node:path'
import type {
  WriterDocument,
  WriterExportDocument,
  WriterExportFootnote,
  WriterExportListItem,
  WriterExportNode,
  WriterExportRun,
  WriterExportTableCell,
  WriterExportTableRow,
  WriterExportTextMarks,
  WriterJsonMark,
  WriterJsonNode,
  WriterResult
} from '@shared/types/writer'
import { getWriterDocumentDir } from './writerPaths'

export interface WriterDocumentMapperOptions {
  /** 写作根目录；默认走 getWritingRootPath / electron home */
  rootPath?: string
}

/**
 * TipTap JSON → 稳定导出 AST 的唯一映射层。
 * DOCX / PDF / Markdown 输出器不得再解读 TipTap 节点。
 */
export class WriterDocumentMapper {
  private readonly rootPath?: string

  constructor(options: WriterDocumentMapperOptions = {}) {
    this.rootPath = options.rootPath
  }

  map(document: WriterDocument): WriterResult<WriterExportDocument> {
    try {
      const warnings: string[] = []
      const assets: WriterExportDocument['assets'] = []
      const assetNames = new Set<string>()
      const footnoteNumbers = deriveFootnoteNumbers(document.content)
      const footnoteDefinitions = new Map<string, WriterJsonNode>()

      const bodyNodes: WriterExportNode[] = []
      for (const child of document.content.content ?? []) {
        if (child.type === 'footnoteDefinition') {
          const footnoteId = readStringAttr(child, 'footnoteId')
          if (footnoteId) {
            footnoteDefinitions.set(footnoteId, child)
          }
          continue
        }
        const mapped = this.mapBlock(child, {
          documentId: document.id,
          warnings,
          assets,
          assetNames,
          footnoteNumbers
        })
        bodyNodes.push(...mapped)
      }

      const footnotes = this.buildFootnotes(footnoteNumbers, footnoteDefinitions, warnings)
      if (footnotes) {
        bodyNodes.push(footnotes)
      }

      return {
        success: true,
        data: {
          title: document.title,
          nodes: bodyNodes,
          assets,
          warnings
        }
      }
    } catch (error) {
      return {
        success: false,
        code: 'invalid_input',
        error: error instanceof Error ? error.message : '映射写作文档失败'
      }
    }
  }

  private mapBlock(
    node: WriterJsonNode,
    ctx: MapContext
  ): WriterExportNode[] {
    switch (node.type) {
      case 'paragraph':
        return [{ kind: 'paragraph', runs: this.mapInline(node, ctx) }]
      case 'heading': {
        const level = clampHeadingLevel(node.attrs?.level)
        return [{ kind: 'heading', level, runs: this.mapInline(node, ctx) }]
      }
      case 'blockquote':
        return [
          {
            kind: 'blockquote',
            children: (node.content ?? []).flatMap((child) => this.mapBlock(child, ctx))
          }
        ]
      case 'bulletList':
        return [{ kind: 'bulletList', items: this.mapListItems(node, ctx) }]
      case 'orderedList':
        return [{ kind: 'orderedList', items: this.mapListItems(node, ctx) }]
      case 'taskList':
        return [{ kind: 'taskList', items: this.mapListItems(node, ctx) }]
      case 'codeBlock':
        return [
          {
            kind: 'code',
            language: readOptionalStringAttr(node, 'language') ?? undefined,
            text: collectText(node)
          }
        ]
      case 'blockMath':
        return [
          {
            kind: 'math',
            display: true,
            latex: readStringAttr(node, 'latex') ?? ''
          }
        ]
      case 'horizontalRule':
        return [{ kind: 'horizontalRule' }]
      case 'image':
        return this.mapImage(node, ctx)
      case 'table':
        return [{ kind: 'table', rows: this.mapTableRows(node, ctx) }]
      default: {
        const fallbackText = collectText(node).trim()
        const label = typeof node.attrs?.label === 'string' ? node.attrs.label : node.type
        ctx.warnings.push(`节点 ${node.type} 无法完整表达，已降级为纯文本`)
        return [
          {
            kind: 'paragraph',
            runs: [
              {
                kind: 'text',
                text: fallbackText
                  ? `[无法导出的节点: ${label}] ${fallbackText}`
                  : `[无法导出的节点: ${label}]`
              }
            ]
          }
        ]
      }
    }
  }

  private mapImage(node: WriterJsonNode, ctx: MapContext): WriterExportNode[] {
    const relativePath = readStringAttr(node, 'assetPath')
    const alt = readStringAttr(node, 'alt') ?? ''
    const caption = readStringAttr(node, 'caption') || undefined
    const width = typeof node.attrs?.width === 'number' ? node.attrs.width : 100

    if (!relativePath || !relativePath.startsWith('assets/')) {
      ctx.warnings.push('图片缺少有效 assetPath，已跳过')
      return []
    }

      const exportName = basename(relativePath)
    if (!ctx.assetNames.has(exportName)) {
      ctx.assetNames.add(exportName)
      const documentDir =
        this.rootPath != null
          ? getWriterDocumentDir(ctx.documentId, this.rootPath)
          : getWriterDocumentDir(ctx.documentId)
      ctx.assets.push({
        sourcePath: join(documentDir, relativePath),
        exportName
      })
    }

    return [
      {
        kind: 'image',
        assetPath: exportName,
        alt,
        caption,
        width
      }
    ]
  }

  private mapListItems(node: WriterJsonNode, ctx: MapContext): WriterExportListItem[] {
    return (node.content ?? []).map((item) => {
      const checked =
        item.type === 'taskItem' && typeof item.attrs?.checked === 'boolean'
          ? item.attrs.checked
          : undefined
      return {
        checked,
        nodes: (item.content ?? []).flatMap((child) => this.mapBlock(child, ctx))
      }
    })
  }

  private mapTableRows(node: WriterJsonNode, ctx: MapContext): WriterExportTableRow[] {
    return (node.content ?? []).map((row) => ({
      cells: (row.content ?? []).map((cell) => this.mapTableCell(cell, ctx))
    }))
  }

  private mapTableCell(cell: WriterJsonNode, ctx: MapContext): WriterExportTableCell {
    const header = cell.type === 'tableHeader'
    const runs: WriterExportRun[] = []
    for (const child of cell.content ?? []) {
      if (child.type === 'paragraph') {
        runs.push(...this.mapInline(child, ctx))
        // 多段之间插入空格，避免粘连
        if (runs.length > 0 && runs[runs.length - 1]?.kind === 'text') {
          // no-op：单元格通常单段
        }
      } else {
        const nested = this.mapBlock(child, ctx)
        for (const nestedNode of nested) {
          if (nestedNode.kind === 'paragraph') {
            runs.push(...nestedNode.runs)
          } else {
            runs.push({ kind: 'text', text: collectTextFromExportNode(nestedNode) })
          }
        }
      }
    }
    return { header, runs }
  }

  private mapInline(node: WriterJsonNode, ctx: MapContext): WriterExportRun[] {
    const runs: WriterExportRun[] = []
    for (const child of node.content ?? []) {
      if (child.type === 'text') {
        runs.push({
          kind: 'text',
          text: child.text ?? '',
          marks: marksFromJson(child.marks)
        })
        continue
      }
      if (child.type === 'hardBreak') {
        runs.push({ kind: 'text', text: '\n' })
        continue
      }
      if (child.type === 'inlineMath') {
        runs.push({ kind: 'math', latex: readStringAttr(child, 'latex') ?? '' })
        continue
      }
      if (child.type === 'footnoteReference') {
        const footnoteId = readStringAttr(child, 'footnoteId')
        const number = footnoteId ? ctx.footnoteNumbers.get(footnoteId) : undefined
        if (number != null) {
          runs.push({ kind: 'footnoteRef', number })
        } else {
          ctx.warnings.push('脚注引用缺少编号，已跳过')
        }
        continue
      }
      // 未知行内节点：降级为纯文本
      const text = collectText(child)
      if (text) {
        ctx.warnings.push(`行内节点 ${child.type} 无法完整表达，已降级为纯文本`)
        runs.push({ kind: 'text', text: `[${child.type}] ${text}` })
      }
    }
    return runs
  }

  private buildFootnotes(
    numbers: Map<string, number>,
    definitions: Map<string, WriterJsonNode>,
    warnings: string[]
  ): WriterExportNode | null {
    if (numbers.size === 0) {
      return null
    }
    const items: WriterExportFootnote[] = []
    const ordered = [...numbers.entries()].sort((a, b) => a[1] - b[1])
    for (const [footnoteId, number] of ordered) {
      const definition = definitions.get(footnoteId)
      if (!definition) {
        warnings.push(`脚注 ${footnoteId} 缺少定义，已输出空内容`)
        items.push({ number, runs: [] })
        continue
      }
      const runs: WriterExportRun[] = []
      for (const child of definition.content ?? []) {
        if (child.type === 'paragraph') {
          runs.push(
            ...this.mapInline(child, {
              documentId: '',
              warnings,
              assets: [],
              assetNames: new Set(),
              footnoteNumbers: numbers
            })
          )
        } else {
          const text = collectText(child)
          if (text) {
            runs.push({ kind: 'text', text })
          }
        }
      }
      items.push({ number, runs })
    }
    return { kind: 'footnotes', items }
  }
}

interface MapContext {
  documentId: string
  warnings: string[]
  assets: WriterExportDocument['assets']
  assetNames: Set<string>
  footnoteNumbers: Map<string, number>
}

function deriveFootnoteNumbers(document: WriterJsonNode): Map<string, number> {
  const ids: string[] = []
  const visit = (node: WriterJsonNode): void => {
    if (node.type === 'footnoteReference') {
      const footnoteId = readStringAttr(node, 'footnoteId')
      if (footnoteId) {
        ids.push(footnoteId)
      }
    }
    for (const child of node.content ?? []) {
      visit(child)
    }
  }
  visit(document)

  const numbers = new Map<string, number>()
  let next = 1
  for (const id of ids) {
    if (!numbers.has(id)) {
      numbers.set(id, next)
      next += 1
    }
  }
  return numbers
}

function marksFromJson(marks: WriterJsonMark[] | undefined): WriterExportTextMarks | undefined {
  if (!marks || marks.length === 0) {
    return undefined
  }
  const result: WriterExportTextMarks = {}
  for (const mark of marks) {
    switch (mark.type) {
      case 'bold':
        result.bold = true
        break
      case 'italic':
        result.italic = true
        break
      case 'underline':
        result.underline = true
        break
      case 'strike':
        result.strike = true
        break
      case 'code':
        result.code = true
        break
      case 'highlight':
        result.highlight = true
        break
      case 'link': {
        const href = mark.attrs?.href
        if (typeof href === 'string' && href.length > 0) {
          result.href = href
        }
        break
      }
      default:
        break
    }
  }
  return Object.keys(result).length > 0 ? result : undefined
}

function collectText(node: WriterJsonNode): string {
  if (typeof node.text === 'string') {
    return node.text
  }
  return (node.content ?? []).map(collectText).join('')
}

function collectTextFromExportNode(node: WriterExportNode): string {
  switch (node.kind) {
    case 'paragraph':
    case 'heading':
      return node.runs.map(runToPlainText).join('')
    case 'code':
      return node.text
    case 'math':
      return node.latex
    case 'image':
      return node.alt
    default:
      return ''
  }
}

function runToPlainText(run: WriterExportRun): string {
  switch (run.kind) {
    case 'text':
      return run.text
    case 'math':
      return run.latex
    case 'footnoteRef':
      return `[^${run.number}]`
  }
}

function clampHeadingLevel(level: unknown): number {
  if (typeof level !== 'number' || !Number.isFinite(level)) {
    return 1
  }
  return Math.min(6, Math.max(1, Math.round(level)))
}

function readStringAttr(node: WriterJsonNode, key: string): string | null {
  const value = node.attrs?.[key]
  return typeof value === 'string' ? value : null
}

function readOptionalStringAttr(node: WriterJsonNode, key: string): string | null {
  const value = readStringAttr(node, key)
  return value && value.length > 0 ? value : null
}
