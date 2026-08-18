import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { t } from '@main/services/i18n'
import type {
  WriterExportDocument,
  WriterExportFootnote,
  WriterExportListItem,
  WriterExportNode,
  WriterExportRun,
  WriterExportTableRow,
  WriterExportTextMarks,
  WriterResult
} from '@shared/types/writer'

export interface WriterMarkdownRenderResult {
  markdown: string
  warnings: string[]
}

export interface WriterMarkdownRenderOptions {
  /** 图片相对路径所用的 assets 目录基名；缺省用文档标题消毒结果 */
  assetsBaseName?: string
}

/**
 * 将统一导出 AST 渲染为 Markdown，并支持原子写出（临时文件 → rename）。
 * 只消费 WriterExportDocument，不读取 TipTap JSON。
 */
export class WriterMarkdownExporter {
  /** 渲染 Markdown 字符串（不落盘） */
  async render(
    document: WriterExportDocument,
    options?: WriterMarkdownRenderOptions
  ): Promise<WriterMarkdownRenderResult> {
    const assetsBaseName = options?.assetsBaseName ?? sanitizeExportBaseName(document.title)
    const markdown = renderMarkdownDocument(document, assetsBaseName)
    return { markdown, warnings: [...document.warnings] }
  }

  /**
   * 原子导出到目标路径：
   * 1. 写临时 `.md` 与临时 `.assets` 目录
   * 2. 全部成功后再以 backup→rename 方式提交最终文件 / `<basename>.assets/`
   * 3. 失败清理临时产物；已有 `.md` 与 `.assets` 保持不变（或从 backup 恢复）
   */
  async export(document: WriterExportDocument, outputPath: string): Promise<WriterResult<void>> {
    const directory = dirname(outputPath)
    const baseName = basename(outputPath, '.md')
    const finalAssetsDir = join(directory, `${baseName}.assets`)
    const tempMdPath = `${outputPath}.tmp`
    const tempAssetsDir = `${finalAssetsDir}.tmp`

    try {
      mkdirSync(directory, { recursive: true })
      cleanupPath(tempMdPath)
      cleanupPath(tempAssetsDir)

      const { markdown } = await this.render(document, { assetsBaseName: baseName })
      writeFileSync(tempMdPath, markdown, 'utf8')

      if (document.assets.length > 0) {
        mkdirSync(tempAssetsDir, { recursive: true })
        for (const asset of document.assets) {
          const target = join(tempAssetsDir, asset.exportName)
          copyFileSync(asset.sourcePath, target)
        }
      }

      // 先提交 assets，再提交 md，避免 md 已就位但 assets 缺失
      if (document.assets.length > 0) {
        atomicReplacePath(tempAssetsDir, finalAssetsDir)
      } else if (existsSync(tempAssetsDir)) {
        cleanupPath(tempAssetsDir)
      }

      atomicReplacePath(tempMdPath, outputPath)

      return { success: true }
    } catch (error) {
      cleanupPath(tempMdPath)
      cleanupPath(tempAssetsDir)
      return {
        success: false,
        code: 'io_error',
        error:
          error instanceof Error ? error.message : t('notifications.writer.markdownExportFailed')
      }
    }
  }
}

function renderMarkdownDocument(document: WriterExportDocument, assetsBaseName: string): string {
  const parts: string[] = []
  const title = document.title.trim()
  if (title.length > 0) {
    parts.push(`# ${escapeMarkdownInline(title)}`)
  }

  for (const node of document.nodes) {
    const rendered = renderNode(node, assetsBaseName, 0)
    if (rendered.length > 0) {
      parts.push(rendered)
    }
  }

  return `${parts.join('\n\n')}\n`
}

function renderNode(node: WriterExportNode, assetsBaseName: string, listDepth: number): string {
  switch (node.kind) {
    case 'paragraph':
      return renderRuns(node.runs)
    case 'heading': {
      const level = Math.min(6, Math.max(1, node.level))
      return `${'#'.repeat(level)} ${renderRuns(node.runs)}`
    }
    case 'blockquote': {
      const inner = node.children
        .map((child) => renderNode(child, assetsBaseName, listDepth))
        .filter(Boolean)
        .join('\n\n')
      return inner
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n')
    }
    case 'bulletList':
      return renderList(node.items, assetsBaseName, listDepth, 'bullet')
    case 'orderedList':
      return renderList(node.items, assetsBaseName, listDepth, 'ordered')
    case 'taskList':
      return renderList(node.items, assetsBaseName, listDepth, 'task')
    case 'code':
      return renderCodeFence(node.language, node.text)
    case 'math':
      return node.display ? `$$\n${node.latex}\n$$` : `$${node.latex}$`
    case 'image': {
      const alt = escapeMarkdownInline(node.alt)
      const src = `${assetsBaseName}.assets/${node.assetPath}`
      const image = `![${alt}](${src})`
      if (node.caption && node.caption.trim().length > 0) {
        return `${image}\n\n*${escapeMarkdownInline(node.caption.trim())}*`
      }
      return image
    }
    case 'table':
      return renderTable(node.rows)
    case 'horizontalRule':
      return '---'
    case 'footnotes':
      return renderFootnotes(node.items)
  }
}

function renderList(
  items: WriterExportListItem[],
  assetsBaseName: string,
  listDepth: number,
  mode: 'bullet' | 'ordered' | 'task'
): string {
  return items
    .map((item, index) => {
      const indent = '  '.repeat(listDepth)
      let marker: string
      if (mode === 'task') {
        marker = `- [${item.checked ? 'x' : ' '}]`
      } else if (mode === 'ordered') {
        marker = `${index + 1}.`
      } else {
        marker = '-'
      }

      const [first, ...rest] = item.nodes
      const firstLine = first != null ? renderNode(first, assetsBaseName, listDepth + 1) : ''
      const head = `${indent}${marker} ${firstLine}`.trimEnd()
      const nested = rest
        .map((child) => {
          if (
            child.kind === 'bulletList' ||
            child.kind === 'orderedList' ||
            child.kind === 'taskList'
          ) {
            return renderNode(child, assetsBaseName, listDepth + 1)
          }
          const body = renderNode(child, assetsBaseName, listDepth + 1)
          return body
            .split('\n')
            .map((line) => `${indent}  ${line}`)
            .join('\n')
        })
        .filter(Boolean)
      return [head, ...nested].join('\n')
    })
    .join('\n')
}

function renderTable(rows: WriterExportTableRow[]): string {
  if (rows.length === 0) {
    return ''
  }
  const normalized = rows.map((row) =>
    row.cells.map((cell) => escapeTableCell(renderRuns(cell.runs)))
  )
  const columnCount = Math.max(...normalized.map((row) => row.length), 0)
  if (columnCount === 0) {
    return ''
  }

  const pad = (row: string[]): string[] => {
    const next = [...row]
    while (next.length < columnCount) {
      next.push('')
    }
    return next
  }

  const header = pad(normalized[0] ?? [])
  const hasHeader = rows[0]?.cells.some((cell) => cell.header) ?? false
  const lines: string[] = []

  if (hasHeader) {
    lines.push(`| ${header.join(' | ')} |`)
    lines.push(`| ${header.map(() => '---').join(' | ')} |`)
    for (const row of normalized.slice(1)) {
      lines.push(`| ${pad(row).join(' | ')} |`)
    }
  } else {
    // 无表头时仍输出 GFM：首行作表头 + 分隔行
    lines.push(`| ${header.join(' | ')} |`)
    lines.push(`| ${header.map(() => '---').join(' | ')} |`)
    for (const row of normalized.slice(1)) {
      lines.push(`| ${pad(row).join(' | ')} |`)
    }
  }
  return lines.join('\n')
}

function renderFootnotes(items: WriterExportFootnote[]): string {
  return items.map((item) => `[^${item.number}]: ${renderRuns(item.runs)}`).join('\n')
}

function renderCodeFence(language: string | undefined, text: string): string {
  const longest = longestBacktickRun(text)
  // 内容含反引号时，围栏至少比最长反引号串长 1，且不少于 4
  const fenceLength = longest === 0 ? 3 : Math.max(3, longest) + 1
  const fence = '`'.repeat(fenceLength)
  const lang = language ?? ''
  return `${fence}${lang}\n${text}\n${fence}`
}

function renderRuns(runs: WriterExportRun[]): string {
  return runs.map(renderRun).join('')
}

function renderRun(run: WriterExportRun): string {
  switch (run.kind) {
    case 'footnoteRef':
      return `[^${run.number}]`
    case 'math':
      return `$${run.latex}$`
    case 'text':
      return renderTextRun(run.text, run.marks)
  }
}

function renderTextRun(text: string, marks?: WriterExportTextMarks): string {
  let result = escapeMarkdownInline(text)
  if (!marks) {
    return result
  }
  if (marks.code) {
    result = wrapInlineCode(text)
  } else {
    if (marks.bold) {
      result = `**${result}**`
    }
    if (marks.italic) {
      result = `*${result}*`
    }
    if (marks.strike) {
      result = `~~${result}~~`
    }
    if (marks.underline) {
      result = `<u>${result}</u>`
    }
    if (marks.highlight) {
      result = `==${result}==`
    }
  }
  if (marks.href) {
    result = `[${result}](${escapeMarkdownLinkDestination(marks.href)})`
  }
  return result
}

function wrapInlineCode(text: string): string {
  const longest = longestBacktickRun(text)
  const fence = '`'.repeat(longest + 1)
  const needsSpace = text.startsWith('`') || text.endsWith('`')
  return needsSpace ? `${fence} ${text} ${fence}` : `${fence}${text}${fence}`
}

function escapeMarkdownInline(text: string): string {
  return text.replace(/([\\`*_{}[\]()#+\-.!|>])/g, '\\$1')
}

function escapeMarkdownLinkDestination(href: string): string {
  // encodeURIComponent 不会编码 ()，Markdown 链接目标必须手动转义
  return href
    .replace(/\\/g, '%5C')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\s/g, '%20')
}

function escapeTableCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

function longestBacktickRun(text: string): number {
  let longest = 0
  let current = 0
  for (const char of text) {
    if (char === '`') {
      current += 1
      longest = Math.max(longest, current)
    } else {
      current = 0
    }
  }
  return longest
}

/** 从标题派生资源目录名，去除路径不安全字符 */
export function sanitizeExportBaseName(title: string): string {
  const trimmed = title.trim()
  const sanitized = trimmed
    // 清理路径不安全字符与控制字符（C0）
    // eslint-disable-next-line no-control-regex -- 文件名消毒需剔除 \u0000-\u001f
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\.+$/g, '')
  return sanitized.length > 0 ? sanitized : 'untitled'
}

/**
 * 原子替换：若目标已存在则先 rename 为 `.bak`，再把临时路径 rename 就位，最后删 backup。
 * 任一步失败则尽量把 backup 恢复为最终路径。
 */
function atomicReplacePath(tempPath: string, finalPath: string): void {
  const backupPath = `${finalPath}.bak`
  cleanupPath(backupPath)

  let backedUp = false
  try {
    if (existsSync(finalPath)) {
      renameSync(finalPath, backupPath)
      backedUp = true
    }
    renameSync(tempPath, finalPath)
    if (backedUp) {
      cleanupPath(backupPath)
    }
  } catch (error) {
    if (backedUp && !existsSync(finalPath) && existsSync(backupPath)) {
      try {
        renameSync(backupPath, finalPath)
      } catch {
        // 恢复失败时保留 backup，交由上层报告原始错误
      }
    }
    throw error
  }
}

function cleanupPath(targetPath: string): void {
  if (!existsSync(targetPath)) {
    return
  }
  rmSync(targetPath, { recursive: true, force: true })
}
