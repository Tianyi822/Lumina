import { Extension } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import MarkdownIt from 'markdown-it'
import { i18n } from '@renderer/i18n'

export interface WriterPastePayload {
  kind: 'html' | 'markdown' | 'text'
  html: string
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    writerClipboard: {
      pasteWriterMarkdown: (markdown: string) => ReturnType
    }
  }
}

const FORBIDDEN_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed'])
const ALLOWED_TAGS = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'ul',
  'ol',
  'li',
  'pre',
  'code',
  'strong',
  'b',
  'em',
  'i',
  's',
  'strike',
  'u',
  'mark',
  'a',
  'br',
  'hr',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'img',
  'span',
  'div'
])
const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'lumina:'])

const markdownParser = new MarkdownIt({
  html: false,
  linkify: false,
  typographer: false,
  breaks: true
})

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function parseHtmlDocument(html: string): Document {
  if (typeof DOMParser === 'undefined') {
    throw new Error(i18n.t('notifications.writer.htmlPasteUnsupported'))
  }
  return new DOMParser().parseFromString(
    `<!doctype html><html><head></head><body>${html}</body></html>`,
    'text/html'
  )
}

function hasSafeUrl(value: string): boolean {
  if (!value.trim()) return false
  if (value.startsWith('/') || value.startsWith('#')) return true
  try {
    return SAFE_PROTOCOLS.has(new URL(value, 'https://writer.local').protocol)
  } catch {
    return false
  }
}

function removeTaskMarker(item: Element): boolean | null {
  const match = item.innerHTML.match(/^(\s*(?:<p>)?)\[([ xX])\]\s*/)
  if (!match) return null
  item.innerHTML = item.innerHTML.replace(match[0], match[1])
  return match[2].toLowerCase() === 'x'
}

function convertMarkdownTaskLists(document: Document): void {
  for (const list of Array.from(document.body.querySelectorAll('ul'))) {
    const items = Array.from(list.children).filter((child) => child.tagName.toLowerCase() === 'li')
    if (items.length === 0) continue
    const states = items.map(removeTaskMarker)
    if (states.some((checked) => checked === null)) continue

    list.setAttribute('data-type', 'taskList')
    items.forEach((item, index) => {
      item.setAttribute('data-type', 'taskItem')
      item.setAttribute('data-checked', states[index] ? 'true' : 'false')
    })
  }
}

function sanitizeElementAttributes(element: Element): void {
  const tagName = element.tagName.toLowerCase()

  for (const attribute of Array.from(element.attributes)) {
    const name = attribute.name.toLowerCase()
    const value = attribute.value
    const safeSemanticAttribute =
      (name === 'data-type' &&
        ((tagName === 'ul' && value === 'taskList') ||
          (tagName === 'li' && value === 'taskItem') ||
          (tagName === 'span' && value === 'inline-math') ||
          (tagName === 'div' && value === 'block-math'))) ||
      (name === 'data-checked' && tagName === 'li' && /^(?:true|false)$/.test(value)) ||
      (name === 'data-latex' &&
        ((tagName === 'span' && element.getAttribute('data-type') === 'inline-math') ||
          (tagName === 'div' && element.getAttribute('data-type') === 'block-math'))) ||
      (name === 'start' && tagName === 'ol' && /^\d+$/.test(value)) ||
      ((name === 'rowspan' || name === 'colspan') &&
        (tagName === 'td' || tagName === 'th') &&
        /^\d+$/.test(value)) ||
      ((name === 'alt' || name === 'title') && tagName === 'img') ||
      (name === 'title' && tagName === 'a')

    if (name.startsWith('on') || name === 'style' || name === 'class' || name === 'id') {
      element.removeAttribute(attribute.name)
    } else if (name === 'href' && tagName === 'a') {
      if (!hasSafeUrl(value)) element.removeAttribute(attribute.name)
    } else if (name === 'src' && tagName === 'img') {
      if (!hasSafeUrl(value)) element.removeAttribute(attribute.name)
    } else if (!safeSemanticAttribute && name !== 'href' && name !== 'src') {
      element.removeAttribute(attribute.name)
    }
  }
}

function sanitizeWriterHtml(html: string, convertTaskLists = false): string {
  const document = parseHtmlDocument(html)
  if (convertTaskLists) convertMarkdownTaskLists(document)

  for (const element of Array.from(document.body.querySelectorAll('*'))) {
    const tagName = element.tagName.toLowerCase()
    if (FORBIDDEN_TAGS.has(tagName)) {
      element.remove()
      continue
    }
    if (!ALLOWED_TAGS.has(tagName)) {
      element.replaceWith(...Array.from(element.childNodes))
      continue
    }
    if (
      (tagName === 'span' && element.getAttribute('data-type') !== 'inline-math') ||
      (tagName === 'div' && element.getAttribute('data-type') !== 'block-math')
    ) {
      element.replaceWith(...Array.from(element.childNodes))
      continue
    }
    sanitizeElementAttributes(element)
  }

  return document.body.innerHTML.trim()
}

function renderPlainText(plainText: string): string {
  return plainText
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

function renderMarkdown(markdownText: string): string {
  return sanitizeWriterHtml(markdownParser.render(markdownText), true)
}

export function sanitizeWriterPaste(
  html: string,
  plainText: string,
  markdownText: string
): WriterPastePayload {
  if (markdownText) {
    return {
      kind: 'markdown',
      html: renderMarkdown(markdownText)
    }
  }
  if (html) {
    return {
      kind: 'html',
      html: sanitizeWriterHtml(html)
    }
  }
  return {
    kind: 'text',
    html: renderPlainText(plainText)
  }
}

export const WriterClipboard = Extension.create({
  name: 'writerClipboard',

  addCommands() {
    return {
      pasteWriterMarkdown:
        (markdown: string) =>
        ({ commands }) =>
          commands.insertContent(renderMarkdown(markdown))
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handlePaste: (_view, event) => {
            const clipboard = event.clipboardData
            if (!clipboard) return false
            const markdownText = clipboard.types.includes('text/markdown')
              ? clipboard.getData('text/markdown')
              : ''
            const payload = sanitizeWriterPaste(
              clipboard.getData('text/html'),
              clipboard.getData('text/plain'),
              markdownText
            )
            return this.editor.commands.insertContent(payload.html)
          }
        }
      })
    ]
  }
})
