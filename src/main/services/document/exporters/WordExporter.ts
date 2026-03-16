import {
  BorderStyle,
  Document,
  ExternalHyperlink,
  HighlightColor,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  UnderlineType,
  WidthType,
  type FileChild,
  type ParagraphChild
} from 'docx'
import { MarkdownParser } from '../parsers/MarkdownParser'
import type { ExportBlock, InlineSegment } from '../types'
import type { WordParagraphOptions, WordRunStyle, WordTextFragment } from './types'

const DEFAULT_CODE_FONT = 'Menlo'
const DEFAULT_WORD_FONT = 'PingFang SC'
const DEFAULT_EMOJI_FONT = 'Apple Color Emoji'
const WORD_PAGE_WIDTH = 9360

/**
 * Word 导出器
 */
export class WordExporter {
  constructor(private readonly markdownParser: MarkdownParser) {}

  /**
   * 构建 Word 文档
   */
  async buildDocument(content: string, title: string): Promise<Buffer> {
    const blocks = this.markdownParser.parseBlocks(content)
    const document = new Document({
      creator: 'Sparrow Manus',
      title: title || undefined,
      description: 'AI 助手导出的内容',
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: 1440,
                right: 1440,
                bottom: 1440,
                left: 1440
              }
            }
          },
          children: this.buildWordChildren(blocks)
        }
      ]
    })

    return Buffer.from(await Packer.toBuffer(document))
  }

  /**
   * 构建 Word 文档节点
   */
  private buildWordChildren(blocks: ExportBlock[]): FileChild[] {
    return blocks.flatMap((block) => {
      switch (block.type) {
        case 'heading':
          return [
            this.buildWordParagraph(block.segments, {
              spacingBefore: block.level === 1 ? 240 : 180,
              spacingAfter: 120,
              runStyle: {
                bold: true,
                fontSize: this.getHeadingFontSize(block.level)
              }
            })
          ]
        case 'paragraph':
          return [
            this.buildWordParagraph(block.segments, {
              spacingAfter: 120
            })
          ]
        case 'blockquote':
          return [
            this.buildWordParagraph(block.segments, {
              indentLeft: 360,
              spacingAfter: 120,
              shadeFill: 'F8FAFC',
              borderLeftColor: '94A3B8',
              runStyle: {
                color: '475569'
              }
            })
          ]
        case 'list':
          return block.items.map((item) => {
            const markerPrefix = item.ordered ? `${item.marker} ` : '• '
            return this.buildWordParagraph([{ text: markerPrefix }, ...item.segments], {
              indentLeft: 360 + item.level * 360,
              indentHanging: 240,
              spacingAfter: 80
            })
          })
        case 'code':
          return block.lines.map((line) =>
            this.buildWordParagraph(
              [
                {
                  text: line || ' ',
                  code: true
                }
              ],
              {
                indentLeft: 240,
                spacingAfter: 20,
                shadeFill: 'F3F4F6',
                runStyle: {
                  monospace: true,
                  fontSize: 20
                }
              }
            )
          )
        case 'table':
          return [this.buildWordTable(block.headers, block.rows)]
        case 'separator':
          return [
            this.buildWordParagraph([{ text: '────────────────────────' }], {
              spacingBefore: 60,
              spacingAfter: 120,
              runStyle: {
                color: 'CBD5E1'
              }
            })
          ]
      }
    })
  }

  /**
   * 构建 Word 段落
   */
  private buildWordParagraph(
    segments: InlineSegment[],
    options: WordParagraphOptions = {}
  ): Paragraph {
    const children = this.buildWordParagraphChildren(segments, options.runStyle)

    return new Paragraph({
      children: children.length > 0 ? children : [new TextRun(' ')],
      spacing: {
        before: options.spacingBefore,
        after: options.spacingAfter
      },
      indent:
        options.indentLeft !== undefined || options.indentHanging !== undefined
          ? {
              left: options.indentLeft,
              hanging: options.indentHanging
            }
          : undefined,
      shading: options.shadeFill
        ? {
            fill: options.shadeFill
          }
        : undefined,
      border: options.borderLeftColor
        ? {
            left: {
              color: options.borderLeftColor,
              style: BorderStyle.SINGLE,
              size: 16,
              space: 8
            }
          }
        : undefined
    })
  }

  /**
   * 构建 Word 段落子节点
   */
  private buildWordParagraphChildren(
    segments: InlineSegment[],
    paragraphStyle: WordRunStyle = {}
  ): ParagraphChild[] {
    return segments.reduce<ParagraphChild[]>((children, segment) => {
      if (!segment.text) {
        return children
      }

      const runStyle = {
        bold: paragraphStyle.bold || segment.bold,
        italic: paragraphStyle.italic || segment.italic,
        color: segment.link ? '0563C1' : paragraphStyle.color,
        fontSize: paragraphStyle.fontSize,
        monospace: paragraphStyle.monospace || segment.code,
        underline: !!segment.link,
        highlight: !!segment.code
      }

      const runs = this.buildWordTextRuns(segment.text, runStyle)
      if (segment.link) {
        children.push(
          new ExternalHyperlink({
            link: segment.link,
            children: runs
          })
        )
        return children
      }

      children.push(...runs)
      return children
    }, [])
  }

  /**
   * 构建 Word 文本运行
   */
  private buildWordTextRuns(
    text: string,
    options: WordRunStyle & { underline?: boolean; highlight?: boolean }
  ): TextRun[] {
    const lines = text.split('\n')
    const runs: TextRun[] = []

    lines.forEach((line, index) => {
      const fragments = this.splitWordTextFragments(line || ' ')

      fragments.forEach((fragment) => {
        runs.push(
          new TextRun({
            text: this.normalizeWordFragmentText(fragment),
            bold: options.bold,
            italics: options.italic,
            color: this.resolveWordColor(fragment, options.color),
            size: options.fontSize,
            font: this.resolveWordFont(fragment, options),
            underline: options.underline ? { type: UnderlineType.SINGLE } : undefined,
            highlight: options.highlight ? HighlightColor.LIGHT_GRAY : undefined
          })
        )
      })

      if (index < lines.length - 1) {
        runs.push(
          new TextRun({
            text: '',
            break: 1,
            bold: options.bold,
            italics: options.italic,
            color: options.color,
            size: options.fontSize,
            font: this.resolveWordFont({ text: ' ' }, options)
          })
        )
      }
    })

    return runs
  }

  /**
   * 拆分 Word 文本片段，为符号单独指定字体
   */
  private splitWordTextFragments(text: string): WordTextFragment[] {
    const fragments: WordTextFragment[] = []
    const graphemes = this.splitWordGraphemes(text)
    let plainTextBuffer = ''

    const flushPlainTextBuffer = (): void => {
      if (!plainTextBuffer) {
        return
      }

      fragments.push({
        text: plainTextBuffer
      })
      plainTextBuffer = ''
    }

    graphemes.forEach((grapheme, index) => {
      if (this.isWordStarText(grapheme.replace(/\uFE0F/g, ''))) {
        flushPlainTextBuffer()
        fragments.push({
          text: grapheme,
          useEmojiFont: true
        })

        const nextGrapheme = graphemes[index + 1]
        if (nextGrapheme && this.isWordStarText(nextGrapheme.replace(/\uFE0F/g, ''))) {
          fragments.push({
            text: '\u2009'
          })
        }
        return
      }

      if (this.isEmojiFragment(grapheme)) {
        flushPlainTextBuffer()
        fragments.push({
          text: grapheme,
          useEmojiFont: true
        })
        return
      }

      plainTextBuffer += grapheme
    })

    flushPlainTextBuffer()

    return fragments.length > 0
      ? fragments
      : [
          {
            text
          }
        ]
  }

  /**
   * 按字素簇拆分文本，避免连续符号在 Word 中被合并渲染
   */
  private splitWordGraphemes(text: string): string[] {
    if (typeof Intl !== 'undefined' && typeof Intl.Segmenter !== 'undefined') {
      const segmenter = new Intl.Segmenter('zh-CN', {
        granularity: 'grapheme'
      })

      return Array.from(segmenter.segment(text), ({ segment }) => segment)
    }

    return Array.from(text)
  }

  /**
   * 判断片段是否应使用符号字体
   */
  private isEmojiFragment(text: string): boolean {
    return /^(?:[\p{Extended_Pictographic}\u2B50](?:\uFE0F)?(?:\u200D[\p{Extended_Pictographic}\u2B50](?:\uFE0F)?)*)$/u.test(
      text
    )
  }

  /**
   * 解析 Word 字体配置
   */
  private resolveWordFont(
    fragment: WordTextFragment,
    options: WordRunStyle
  ): { ascii: string; hAnsi: string; eastAsia: string; cs: string } {
    const fontName = options.monospace
      ? DEFAULT_CODE_FONT
      : this.isWordStarFragment(fragment)
        ? DEFAULT_EMOJI_FONT
        : fragment.useEmojiFont
          ? DEFAULT_EMOJI_FONT
          : DEFAULT_WORD_FONT

    return {
      ascii: fontName,
      hAnsi: fontName,
      eastAsia: fontName,
      cs: fontName
    }
  }

  /**
   * 归一化 Word 片段文本，避免变体选择符显示为乱码
   */
  private normalizeWordFragmentText(fragment: WordTextFragment): string {
    return fragment.useEmojiFont ? fragment.text.replace(/\uFE0F/g, '') : fragment.text
  }

  /**
   * 解析 Word 片段颜色
   */
  private resolveWordColor(fragment: WordTextFragment, defaultColor?: string): string | undefined {
    return this.isWordStarFragment(fragment) ? 'EAB308' : defaultColor
  }

  /**
   * 判断是否为 Word 星级片段
   */
  private isWordStarFragment(fragment: WordTextFragment): boolean {
    return this.isWordStarText(fragment.text.replace(/\uFE0F/g, ''))
  }

  /**
   * 判断是否为星级文本
   */
  private isWordStarText(text: string): boolean {
    return /^[⭐]+$/u.test(text)
  }

  /**
   * 构建 Word 表格
   */
  private buildWordTable(headers: InlineSegment[][], rows: InlineSegment[][][]): Table {
    const columnCount = Math.max(1, headers.length, ...rows.map((row) => row.length))
    const cellWidth = Math.floor(WORD_PAGE_WIDTH / columnCount)
    const tableRows = [headers, ...rows]

    return new Table({
      width: {
        size: 100,
        type: WidthType.PERCENTAGE
      },
      columnWidths: Array.from({ length: columnCount }, () => cellWidth),
      layout: TableLayoutType.FIXED,
      borders: {
        top: { color: 'CBD5E1', style: BorderStyle.SINGLE, size: 8 },
        bottom: { color: 'CBD5E1', style: BorderStyle.SINGLE, size: 8 },
        left: { color: 'CBD5E1', style: BorderStyle.SINGLE, size: 8 },
        right: { color: 'CBD5E1', style: BorderStyle.SINGLE, size: 8 },
        insideHorizontal: { color: 'E2E8F0', style: BorderStyle.SINGLE, size: 8 },
        insideVertical: { color: 'E2E8F0', style: BorderStyle.SINGLE, size: 8 }
      },
      rows: tableRows.map((row, rowIndex) => {
        const cells = Array.from({ length: columnCount }, (_, cellIndex) => row[cellIndex] || [])

        return new TableRow({
          children: cells.map(
            (cell) =>
              new TableCell({
                width: {
                  size: cellWidth,
                  type: WidthType.DXA
                },
                shading:
                  rowIndex === 0
                    ? {
                        fill: 'E8EEF3'
                      }
                    : undefined,
                margins: {
                  top: 80,
                  bottom: 80,
                  left: 120,
                  right: 120
                },
                children: [
                  this.buildWordParagraph(cell, {
                    spacingAfter: 0,
                    runStyle: rowIndex === 0 ? { bold: true } : undefined
                  })
                ]
              })
          )
        })
      })
    })
  }

  /**
   * 获取标题字号
   */
  private getHeadingFontSize(level: number): number {
    switch (level) {
      case 1:
        return 34
      case 2:
        return 30
      case 3:
        return 26
      case 4:
        return 24
      default:
        return 22
    }
  }
}
