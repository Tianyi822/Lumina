import type { ExportBlock, InlineSegment } from '../types'
import { MarkdownParser } from '../parsers/MarkdownParser'

/**
 * Markdown 导出器
 */
export class MarkdownExporter {
  constructor(private readonly markdownParser: MarkdownParser) {}

  /**
   * 归一化 Markdown 内容，确保各格式导出使用同一份结构
   */
  normalizeMarkdownContent(content: string): string {
    const blocks = this.markdownParser.parseBlocks(content)
    return this.renderMarkdownBlocks(blocks)
  }

  /**
   * 构建 TXT 内容
   */
  buildPlainText(content: string): string {
    const blocks = this.markdownParser.parseBlocks(content)
    const sections = blocks.map((block) => {
      switch (block.type) {
        case 'heading':
          return this.renderPlainHeading(
            block.level,
            this.markdownParser.segmentsToText(block.segments)
          )
        case 'paragraph':
          return this.markdownParser.segmentsToText(block.segments)
        case 'blockquote':
          return this.markdownParser.segmentsToText(block.segments)
            .split('\n')
            .map((line) => `> ${line}`)
            .join('\n')
        case 'list':
          return block.items
            .map((item) => {
              const prefix = item.ordered ? item.marker : '•'
              return `${'  '.repeat(item.level)}${prefix} ${this.markdownParser.segmentsToText(item.segments)}`
            })
            .join('\n')
        case 'code':
          return ['```' + (block.language || ''), ...block.lines, '```'].join('\n')
        case 'table': {
          const headerLine = block.headers
            .map((cell) => this.markdownParser.segmentsToText(cell))
            .join(' | ')
          const separator = block.headers.map(() => '---').join(' | ')
          const rows = block.rows.map((row) =>
            row.map((cell) => this.markdownParser.segmentsToText(cell)).join(' | ')
          )
          return [headerLine, separator, ...rows].join('\n')
        }
        case 'separator':
          return '----------------------------------------'
      }
    })

    return sections.join('\n\n').trim() + '\n'
  }

  /**
   * 将导出块重新渲染为 Markdown
   */
  private renderMarkdownBlocks(blocks: ExportBlock[]): string {
    const sections = blocks.map((block) => {
      switch (block.type) {
        case 'heading':
          return `${'#'.repeat(block.level)} ${this.segmentsToMarkdown(block.segments)}`
        case 'paragraph':
          return this.segmentsToMarkdown(block.segments)
        case 'blockquote':
          return this.segmentsToMarkdown(block.segments)
            .split('\n')
            .map((line) => `> ${line}`)
            .join('\n')
        case 'list':
          return block.items
            .map((item) => {
              const prefix = item.ordered ? item.marker : '-'
              const indent = '  '.repeat(item.level)
              const lines = this.segmentsToMarkdown(item.segments).split('\n')

              return lines
                .map((line, lineIndex) =>
                  lineIndex === 0 ? `${indent}${prefix} ${line}` : `${indent}  ${line}`
                )
                .join('\n')
            })
            .join('\n')
        case 'code':
          return ['```' + (block.language || ''), ...block.lines, '```'].join('\n')
        case 'table': {
          const headers = `| ${block.headers
            .map((cell) => this.segmentsToMarkdown(cell, true))
            .join(' | ')} |`
          const separator = `| ${block.headers.map(() => '---').join(' | ')} |`
          const rows = block.rows.map(
            (row) => `| ${row.map((cell) => this.segmentsToMarkdown(cell, true)).join(' | ')} |`
          )
          return [headers, separator, ...rows].join('\n')
        }
        case 'separator':
          return '---'
      }
    })

    return sections.join('\n\n').trimEnd() + '\n'
  }

  /**
   * 渲染纯文本标题
   */
  private renderPlainHeading(level: number, text: string): string {
    if (level === 1) {
      return `${text}\n${'='.repeat(Math.max(3, Math.min(40, text.length || 3)))}`
    }

    if (level === 2) {
      return `${text}\n${'-'.repeat(Math.max(3, Math.min(40, text.length || 3)))}`
    }

    return `${'#'.repeat(level)} ${text}`
  }

  /**
   * 将片段重新组装为 Markdown
   */
  private segmentsToMarkdown(segments: InlineSegment[], escapePipes = false): string {
    return segments
      .map((segment) => {
        let text = this.escapeMarkdownText(segment.text, {
          escapePipes,
          code: !!segment.code
        })

        if (segment.code) {
          text = `\`${text}\``
        } else if (segment.bold && segment.italic) {
          text = `***${text}***`
        } else if (segment.bold) {
          text = `**${text}**`
        } else if (segment.italic) {
          text = `*${text}*`
        }

        if (segment.link) {
          text = `[${text}](${segment.link})`
        }

        return text
      })
      .join('')
  }

  /**
   * 转义 Markdown 文本
   */
  private escapeMarkdownText(
    value: string,
    options: {
      escapePipes?: boolean
      code?: boolean
    } = {}
  ): string {
    if (options.code) {
      return value.replace(/\\/g, '\\\\').replace(/`/g, '\\`')
    }

    return value
      .replace(/\\/g, '\\\\')
      .replace(/([*_`[\]])/g, '\\$1')
      .replace(options.escapePipes ? /\|/g : /$^/, '\\|')
  }
}
