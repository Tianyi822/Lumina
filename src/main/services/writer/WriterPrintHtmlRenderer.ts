import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import katex from 'katex'
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

const require = createRequire(import.meta.url)

export interface WriterPrintHtmlRendererOptions {
  katexCssPath?: string
  highlightCssPath?: string
}

/**
 * 将统一导出 AST 渲染为完全离线的打印 HTML。
 * 固定浅色主题，内联 CSS/图片，禁止网络资源。
 */
export class WriterPrintHtmlRenderer {
  private readonly katexCssPath: string
  private readonly highlightCssPath: string

  constructor(options: WriterPrintHtmlRendererOptions = {}) {
    this.katexCssPath =
      options.katexCssPath ?? resolvePackageCss('katex/package.json', 'dist/katex.min.css')
    this.highlightCssPath =
      options.highlightCssPath ??
      resolvePackageCss('highlight.js/package.json', 'styles/github.css')
  }

  render(document: WriterExportDocument): WriterResult<string> {
    try {
      const assetDataUrls = buildAssetDataUrls(document)
      const body = renderBody(document, assetDataUrls)
      const katexCss = sanitizeOfflineCss(readFileSync(this.katexCssPath, 'utf8'))
      const highlightCss = sanitizeOfflineCss(readFileSync(this.highlightCssPath, 'utf8'))
      const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:" />
<title>${escapeHtml(document.title)}</title>
<style>
${katexCss}
${highlightCss}
${PRINT_CSS}
</style>
</head>
<body>
<article class="writer-print">
${body}
</article>
</body>
</html>`
      return { success: true, data: html }
    } catch (error) {
      return {
        success: false,
        code: 'io_error',
        error:
          error instanceof Error ? error.message : t('notifications.writer.printHtmlRenderFailed')
      }
    }
  }
}

const PRINT_CSS = `
html, body {
  margin: 0;
  padding: 0;
  background: #fff;
  color: #111;
}
body {
  font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif;
  font-size: 12pt;
  line-height: 1.6;
}
.writer-print {
  max-width: 720px;
  margin: 0 auto;
  padding: 24px;
  background: #fff;
}
h1, h2, h3, h4, h5, h6 {
  line-height: 1.3;
  margin: 1.2em 0 0.5em;
}
p, ul, ol, pre, table, blockquote, .math-block, figure {
  margin: 0.75em 0;
}
blockquote {
  margin-left: 0;
  padding-left: 1em;
  border-left: 3px solid #ccc;
  color: #444;
}
pre, code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
pre {
  padding: 12px;
  background: #f6f8fa;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
}
table {
  border-collapse: collapse;
  width: 100%;
}
th, td {
  border: 1px solid #ccc;
  padding: 6px 8px;
  vertical-align: top;
}
th {
  background: #f5f5f5;
}
img {
  max-width: 100%;
  height: auto;
}
.math-block {
  text-align: center;
  overflow-x: auto;
}
.task-checked::before { content: "☑ "; }
.task-unchecked::before { content: "☐ "; }
.footnotes {
  margin-top: 2em;
  padding-top: 1em;
  border-top: 1px solid #ddd;
  font-size: 0.9em;
}
.katex-error {
  color: #111;
  white-space: pre-wrap;
}
@media print {
  body { background: #fff; }
  .writer-print { padding: 0; max-width: none; }
}
`

function resolvePackageCss(packageJsonId: string, relativeCss: string): string {
  return join(dirname(require.resolve(packageJsonId)), relativeCss)
}

function buildAssetDataUrls(document: WriterExportDocument): Map<string, string> {
  const map = new Map<string, string>()
  for (const asset of document.assets) {
    try {
      const bytes = readFileSync(asset.sourcePath)
      const mime = detectMime(bytes)
      map.set(asset.exportName, `data:${mime};base64,${bytes.toString('base64')}`)
    } catch {
      // 缺失图片在渲染时降级为 alt 文本
    }
  }
  return map
}

function renderBody(document: WriterExportDocument, assets: Map<string, string>): string {
  const parts: string[] = [`<h1>${escapeHtml(document.title)}</h1>`]
  for (const node of document.nodes) {
    parts.push(renderNode(node, assets))
  }
  return parts.filter(Boolean).join('\n')
}

function renderNode(node: WriterExportNode, assets: Map<string, string>): string {
  switch (node.kind) {
    case 'heading': {
      const level = Math.min(6, Math.max(1, node.level))
      return `<h${level}>${renderRuns(node.runs)}</h${level}>`
    }
    case 'paragraph':
      return `<p>${renderRuns(node.runs)}</p>`
    case 'blockquote': {
      const inner = node.children.map((child) => renderNode(child, assets)).join('\n')
      return `<blockquote>${inner}</blockquote>`
    }
    case 'bulletList':
      return `<ul>${renderListItems(node.items, assets, 'bullet')}</ul>`
    case 'orderedList':
      return `<ol>${renderListItems(node.items, assets, 'ordered')}</ol>`
    case 'taskList':
      return `<ul class="task-list">${renderListItems(node.items, assets, 'task')}</ul>`
    case 'code':
      return `<pre><code class="language-${escapeHtml(node.language || 'text')}">${escapeHtml(node.text)}</code></pre>`
    case 'math':
      return renderMath(node.latex, node.display)
    case 'image': {
      const src = assets.get(node.assetPath)
      if (!src) {
        return `<p>${escapeHtml(node.alt || node.assetPath)}</p>`
      }
      const caption =
        node.caption && node.caption.trim().length > 0
          ? `<figcaption>${escapeHtml(node.caption.trim())}</figcaption>`
          : ''
      return `<figure><img src="${src}" alt="${escapeHtml(node.alt)}" />${caption}</figure>`
    }
    case 'table':
      return renderTable(node.rows)
    case 'horizontalRule':
      return '<hr />'
    case 'footnotes': {
      const items = node.items
        .map(
          (item) =>
            `<li id="fn-${item.number}"><sup>${item.number}</sup> ${renderRuns(item.runs)}</li>`
        )
        .join('\n')
      return `<section class="footnotes"><ol>${items}</ol></section>`
    }
    default: {
      const _exhaustive: never = node
      void _exhaustive
      return ''
    }
  }
}

function renderListItems(
  items: WriterExportListItem[],
  assets: Map<string, string>,
  mode: 'bullet' | 'ordered' | 'task'
): string {
  return items
    .map((item) => {
      const className =
        mode === 'task' ? (item.checked ? ' class="task-checked"' : ' class="task-unchecked"') : ''
      const body = item.nodes.map((child) => renderNode(child, assets)).join('')
      return `<li${className}>${body}</li>`
    })
    .join('\n')
}

function renderTable(rows: WriterExportTableRow[]): string {
  const body = rows
    .map((row) => {
      const cells = row.cells
        .map((cell) => {
          const tag = cell.header ? 'th' : 'td'
          return `<${tag}>${renderRuns(cell.runs)}</${tag}>`
        })
        .join('')
      return `<tr>${cells}</tr>`
    })
    .join('\n')
  return `<table>${body}</table>`
}

function renderRuns(runs: WriterExportRun[]): string {
  return runs
    .map((run) => {
      if (run.kind === 'text') return renderText(run.text, run.marks)
      if (run.kind === 'footnoteRef') {
        return `<sup class="footnote-ref"><a href="#fn-${run.number}">${run.number}</a></sup>`
      }
      return renderMath(run.latex, false)
    })
    .join('')
}

function renderText(text: string, marks?: WriterExportTextMarks): string {
  let html = escapeHtml(text)
  if (marks?.code) html = `<code>${html}</code>`
  if (marks?.bold) html = `<strong>${html}</strong>`
  if (marks?.italic) html = `<em>${html}</em>`
  if (marks?.underline) html = `<u>${html}</u>`
  if (marks?.strike) html = `<s>${html}</s>`
  if (marks?.highlight) html = `<mark>${html}</mark>`
  if (marks?.href) {
    // 打印场景禁止外链网络请求：只展示可读文本，不输出 http(s) href
    html = `<span class="print-link" title="${escapeHtml(marks.href)}">${html}</span>`
  }
  return html
}

function renderMath(latex: string, displayMode: boolean): string {
  try {
    const rendered = katex.renderToString(latex, {
      displayMode,
      throwOnError: false,
      output: 'html',
      strict: 'ignore'
    })
    return displayMode ? `<div class="math-block">${rendered}</div>` : rendered
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const fallback = `<span class="katex-error">${escapeHtml(latex)} (${escapeHtml(message)})</span>`
    return displayMode ? `<div class="math-block">${fallback}</div>` : fallback
  }
}

function detectMime(bytes: Buffer): string {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg'
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return 'image/gif'
  if (bytes[0] === 0x52 && bytes[1] === 0x49) return 'image/webp'
  return 'application/octet-stream'
}

/** 去掉注释与网络 url，保证打印 HTML 完全离线。 */
function sanitizeOfflineCss(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/url\(\s*['"]?https?:[^)]+\)/gi, 'url()')
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
