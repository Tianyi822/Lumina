import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { basename, dirname } from 'node:path'
import {
  AlignmentType,
  BorderStyle,
  Document,
  FootnoteReferenceRun,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  convertInchesToTwip
} from 'docx'
import { t } from '@main/services/i18n'
import type {
  WriterExportDocument,
  WriterExportListItem,
  WriterExportNode,
  WriterExportRun,
  WriterExportTableRow,
  WriterExportTextMarks,
  WriterResult
} from '@shared/types/writer'

const CONTENT_WIDTH_INCHES = 6
const CONTENT_WIDTH_PX = Math.round(CONTENT_WIDTH_INCHES * 96)
const FONT_STACK = 'PingFang SC, Microsoft YaHei, Noto Sans CJK SC, sans-serif'
const CODE_FONT = 'SFMono-Regular, Menlo, Consolas, monospace'

export interface WriterFormulaRasterizerPort {
  rasterize: (latex: string, displayMode: boolean) => Promise<WriterResult<Buffer>>
}

export interface WriterDocxFormulaModel {
  latex: string
  displayMode: boolean
  png: Buffer
  width: number
  height: number
  altText: {
    title: string
    description: string
    name: string
  }
}

export interface WriterDocxBuildResult {
  document: Document
  plainText: string
  warnings: string[]
  formulas: WriterDocxFormulaModel[]
}

type DocxInline = TextRun | ImageRun | FootnoteReferenceRun
type DocxBlock = Paragraph | Table

interface BuildContext {
  plainChunks: string[]
  warnings: string[]
  formulas: WriterDocxFormulaModel[]
  footnotes: Record<string, { children: Paragraph[] }>
  assetBytes: Map<string, Buffer>
  rasterizer: WriterFormulaRasterizerPort
}

/**
 * 将统一导出 AST 映射为 DOCX。只消费 WriterExportDocument，不读取 TipTap JSON。
 */
export class WriterDocxExporter {
  private readonly rasterizer: WriterFormulaRasterizerPort

  constructor(rasterizer: WriterFormulaRasterizerPort) {
    this.rasterizer = rasterizer
  }

  async build(document: WriterExportDocument): Promise<WriterDocxBuildResult> {
    const ctx: BuildContext = {
      plainChunks: [],
      warnings: [...document.warnings],
      formulas: [],
      footnotes: {},
      assetBytes: loadAssetBytes(document),
      rasterizer: this.rasterizer
    }

    const children: DocxBlock[] = [
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: document.title, font: FONT_STACK, bold: true, size: 32 })]
      })
    ]
    ctx.plainChunks.push(document.title)

    for (const node of document.nodes) {
      children.push(...(await mapNode(node, ctx)))
    }

    const doc = new Document({
      styles: {
        default: {
          document: {
            run: { font: FONT_STACK, size: 22 }
          }
        }
      },
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: convertInchesToTwip(1),
                right: convertInchesToTwip(1),
                bottom: convertInchesToTwip(1),
                left: convertInchesToTwip(1)
              }
            }
          },
          children
        }
      ],
      footnotes: ctx.footnotes
    })

    return {
      document: doc,
      plainText: ctx.plainChunks.join('\n'),
      warnings: ctx.warnings,
      formulas: ctx.formulas
    }
  }

  async render(document: WriterExportDocument): Promise<Buffer> {
    const built = await this.build(document)
    return Packer.toBuffer(built.document)
  }

  async export(document: WriterExportDocument, outputPath: string): Promise<WriterResult<void>> {
    const directory = dirname(outputPath)
    const tempPath = `${outputPath}.tmp`

    try {
      mkdirSync(directory, { recursive: true })
      if (existsSync(tempPath)) {
        rmSync(tempPath, { force: true })
      }

      const buffer = await this.render(document)
      const fd = openSync(tempPath, 'w')
      try {
        writeFileSync(fd, buffer)
        fsyncSync(fd)
      } finally {
        closeSync(fd)
      }

      renameSync(tempPath, outputPath)
      return { success: true }
    } catch (error) {
      if (existsSync(tempPath)) {
        rmSync(tempPath, { force: true })
      }
      return {
        success: false,
        code: 'io_error',
        error: error instanceof Error ? error.message : t('notifications.writer.docxExportFailed')
      }
    }
  }
}

function loadAssetBytes(document: WriterExportDocument): Map<string, Buffer> {
  const map = new Map<string, Buffer>()
  for (const asset of document.assets) {
    try {
      map.set(asset.exportName, readFileSync(asset.sourcePath))
    } catch {
      // 缺失资源在图片映射阶段写入 warning
    }
  }
  return map
}

async function mapNode(node: WriterExportNode, ctx: BuildContext): Promise<DocxBlock[]> {
  switch (node.kind) {
    case 'heading': {
      const heading = headingLevel(node.level)
      ctx.plainChunks.push(runsToPlain(node.runs))
      return [
        new Paragraph({
          heading,
          children: await mapRuns(node.runs, ctx)
        })
      ]
    }
    case 'paragraph': {
      ctx.plainChunks.push(runsToPlain(node.runs))
      return [new Paragraph({ children: await mapRuns(node.runs, ctx) })]
    }
    case 'blockquote': {
      const blocks: DocxBlock[] = []
      for (const child of node.children) {
        if (child.kind === 'paragraph' || child.kind === 'heading') {
          ctx.plainChunks.push(runsToPlain(child.runs))
          blocks.push(
            new Paragraph({
              indent: { left: convertInchesToTwip(0.25) },
              border: {
                left: { style: BorderStyle.SINGLE, size: 12, color: '999999', space: 8 }
              },
              children: await mapRuns(child.runs, ctx)
            })
          )
          continue
        }
        const nested = await mapNode(child, ctx)
        blocks.push(...nested)
      }
      return blocks
    }
    case 'bulletList':
    case 'orderedList':
    case 'taskList':
      return mapList(node.kind, node.items, ctx)
    case 'code': {
      ctx.plainChunks.push(node.text)
      return [
        new Paragraph({
          shading: { type: 'clear', fill: 'F5F5F5' },
          children: [new TextRun({ text: node.text, font: CODE_FONT, size: 18 })]
        })
      ]
    }
    case 'math':
      return [await createMathParagraph(node.latex, node.display, ctx)]
    case 'image':
      return [createImageParagraph(node, ctx)]
    case 'table':
      return [createTable(node.rows, ctx)]
    case 'horizontalRule': {
      ctx.plainChunks.push('---')
      return [
        new Paragraph({
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC', space: 1 }
          },
          children: []
        })
      ]
    }
    case 'footnotes': {
      for (const item of node.items) {
        ctx.footnotes[String(item.number)] = {
          children: [
            new Paragraph({
              children: item.runs.flatMap((run) => {
                if (run.kind === 'text') return [createTextRun(run.text, run.marks)]
                if (run.kind === 'math') return [new TextRun({ text: run.latex, font: CODE_FONT })]
                return []
              })
            })
          ]
        }
        ctx.plainChunks.push(`[^${item.number}]: ${runsToPlain(item.runs)}`)
      }
      return []
    }
    default: {
      const _exhaustive: never = node
      void _exhaustive
      return []
    }
  }
}

async function mapList(
  kind: 'bulletList' | 'orderedList' | 'taskList',
  items: WriterExportListItem[],
  ctx: BuildContext
): Promise<Paragraph[]> {
  const paragraphs: Paragraph[] = []
  let index = 1
  for (const item of items) {
    const prefix =
      kind === 'taskList'
        ? item.checked
          ? '☑ '
          : '☐ '
        : kind === 'orderedList'
          ? `${index}. `
          : '• '
    const body = item.nodes.map(nodeToPlain).join(' ').trim()
    ctx.plainChunks.push(`${prefix}${body}`)
    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: `${prefix}${body}`, font: FONT_STACK })]
      })
    )
    index += 1
  }
  return paragraphs
}

async function mapRuns(runs: WriterExportRun[], ctx: BuildContext): Promise<DocxInline[]> {
  const children: DocxInline[] = []
  for (const run of runs) {
    if (run.kind === 'text') {
      children.push(createTextRun(run.text, run.marks))
      continue
    }
    if (run.kind === 'footnoteRef') {
      children.push(new FootnoteReferenceRun(run.number))
      continue
    }
    children.push(await createMathInline(run.latex, ctx))
  }
  return children
}

async function createMathInline(latex: string, ctx: BuildContext): Promise<DocxInline> {
  const rasterized = await ctx.rasterizer.rasterize(latex, false)
  if (!rasterized.success || !rasterized.data) {
    ctx.warnings.push(t('notifications.writer.formulaRasterizeDowngraded', { latex }))
    return new TextRun({ text: latex, font: CODE_FONT })
  }
  return createFormulaImageRun(latex, false, rasterized.data, ctx)
}

async function createMathParagraph(
  latex: string,
  displayMode: boolean,
  ctx: BuildContext
): Promise<Paragraph> {
  const rasterized = await ctx.rasterizer.rasterize(latex, displayMode)
  if (!rasterized.success || !rasterized.data) {
    ctx.warnings.push(t('notifications.writer.formulaRasterizeDowngraded', { latex }))
    ctx.plainChunks.push(latex)
    return new Paragraph({
      alignment: displayMode ? AlignmentType.CENTER : AlignmentType.LEFT,
      children: [new TextRun({ text: latex, font: CODE_FONT })]
    })
  }

  ctx.plainChunks.push(latex)
  return new Paragraph({
    alignment: displayMode ? AlignmentType.CENTER : AlignmentType.LEFT,
    children: [createFormulaImageRun(latex, displayMode, rasterized.data, ctx)]
  })
}

function createFormulaImageRun(
  latex: string,
  displayMode: boolean,
  png: Buffer,
  ctx: BuildContext
): ImageRun {
  const { width, height } = probePngSize(png)
  const scaled = fitWithinWidth(width, height, CONTENT_WIDTH_PX)
  const altText = {
    title: 'LaTeX formula',
    description: latex,
    name: 'formula'
  }
  ctx.formulas.push({
    latex,
    displayMode,
    png,
    width: scaled.width,
    height: scaled.height,
    altText
  })
  return new ImageRun({
    type: 'png',
    data: png,
    transformation: { width: scaled.width, height: scaled.height },
    altText
  })
}

function createImageParagraph(
  node: Extract<WriterExportNode, { kind: 'image' }>,
  ctx: BuildContext
): Paragraph {
  const bytes = ctx.assetBytes.get(node.assetPath)
  if (!bytes) {
    ctx.warnings.push(t('notifications.writer.imageAssetMissing', { assetPath: node.assetPath }))
    ctx.plainChunks.push(node.alt || node.assetPath)
    return new Paragraph({
      children: [new TextRun({ text: node.alt || node.assetPath, font: FONT_STACK })]
    })
  }

  const { width, height } = probePngSize(bytes)
  const preferredWidth =
    node.width > 0 && node.width <= 100
      ? Math.round((CONTENT_WIDTH_PX * node.width) / 100)
      : CONTENT_WIDTH_PX
  const scaled = fitWithinWidth(width, height, preferredWidth)
  ctx.plainChunks.push(node.alt || basename(node.assetPath))

  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new ImageRun({
        type: detectImageType(bytes),
        data: bytes,
        transformation: { width: scaled.width, height: scaled.height },
        altText: {
          name: 'image',
          title: node.alt || 'image',
          description: node.caption || node.alt || ''
        }
      })
    ]
  })
}

function createTable(rows: WriterExportTableRow[], ctx: BuildContext): Table {
  const tableRows = rows.map(
    (row) =>
      new TableRow({
        children: row.cells.map((cell) => {
          const text = runsToPlain(cell.runs)
          ctx.plainChunks.push(text)
          return new TableCell({
            width: {
              size: Math.floor(100 / Math.max(row.cells.length, 1)),
              type: WidthType.PERCENTAGE
            },
            children: [
              new Paragraph({
                children: cell.runs.map((run) => {
                  if (run.kind === 'text') {
                    return createTextRun(run.text, {
                      ...run.marks,
                      bold: cell.header ? true : run.marks?.bold
                    })
                  }
                  if (run.kind === 'math') {
                    return new TextRun({ text: run.latex, font: CODE_FONT })
                  }
                  return new TextRun({ text: '', font: FONT_STACK })
                })
              })
            ]
          })
        })
      })
  )

  return new Table({
    rows: tableRows,
    width: { size: 100, type: WidthType.PERCENTAGE }
  })
}

function createTextRun(text: string, marks?: WriterExportTextMarks): TextRun {
  return new TextRun({
    text,
    font: marks?.code ? CODE_FONT : FONT_STACK,
    bold: marks?.bold,
    italics: marks?.italic,
    underline: marks?.underline ? {} : undefined,
    strike: marks?.strike,
    highlight: marks?.highlight ? 'yellow' : undefined
  })
}

function headingLevel(level: number): (typeof HeadingLevel)[keyof typeof HeadingLevel] {
  switch (Math.min(6, Math.max(1, level))) {
    case 1:
      return HeadingLevel.HEADING_1
    case 2:
      return HeadingLevel.HEADING_2
    case 3:
      return HeadingLevel.HEADING_3
    case 4:
      return HeadingLevel.HEADING_4
    case 5:
      return HeadingLevel.HEADING_5
    default:
      return HeadingLevel.HEADING_6
  }
}

function runsToPlain(runs: WriterExportRun[]): string {
  return runs
    .map((run) => {
      if (run.kind === 'text') return run.text
      if (run.kind === 'math') return run.latex
      if (run.kind === 'footnoteRef') return `[${run.number}]`
      return ''
    })
    .join('')
}

function nodeToPlain(node: WriterExportNode): string {
  switch (node.kind) {
    case 'paragraph':
    case 'heading':
      return runsToPlain(node.runs)
    case 'code':
      return node.text
    case 'math':
      return node.latex
    case 'image':
      return node.alt
    case 'blockquote':
      return node.children.map(nodeToPlain).join(' ')
    case 'bulletList':
    case 'orderedList':
    case 'taskList':
      return node.items.map((item) => item.nodes.map(nodeToPlain).join(' ')).join(' ')
    case 'table':
      return node.rows
        .map((row) => row.cells.map((cell) => runsToPlain(cell.runs)).join('\t'))
        .join(' ')
    case 'horizontalRule':
      return '---'
    case 'footnotes':
      return node.items.map((item) => runsToPlain(item.runs)).join(' ')
    default:
      return ''
  }
}

function fitWithinWidth(
  width: number,
  height: number,
  maxWidth: number
): { width: number; height: number } {
  const safeWidth = Math.max(1, width)
  const safeHeight = Math.max(1, height)
  if (safeWidth <= maxWidth) {
    return { width: safeWidth, height: safeHeight }
  }
  const scale = maxWidth / safeWidth
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale))
  }
}

function probePngSize(bytes: Buffer): { width: number; height: number } {
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50) {
    return {
      width: bytes.readUInt32BE(16) || 1,
      height: bytes.readUInt32BE(20) || 1
    }
  }
  return { width: CONTENT_WIDTH_PX, height: Math.round(CONTENT_WIDTH_PX * 0.4) }
}

function detectImageType(bytes: Buffer): 'png' | 'jpg' | 'gif' | 'bmp' {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpg'
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return 'gif'
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return 'bmp'
  return 'png'
}
