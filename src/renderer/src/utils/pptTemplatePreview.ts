import type {
  PptTemplateAnalysis,
  PptTemplateElementAnalysis,
  PptTemplateSlideAnalysis
} from '@shared/types/ppt-template'

export type TemplatePreviewStatus = 'loading' | 'ready' | 'error'

export interface TemplatePreviewModel {
  status: TemplatePreviewStatus
  imageUrl?: string
}

const EMU_PER_PX = 9525
const DEFAULT_PREVIEW_WIDTH = 1280
const DEFAULT_PREVIEW_HEIGHT = 720
const OFFICE_THEME_COLORS: Record<string, string> = {
  accent1: '#4472c4',
  accent2: '#ed7d31',
  accent3: '#a5a5a5',
  accent4: '#ffc000',
  accent5: '#5b9bd5',
  accent6: '#70ad47',
  bg1: '#ffffff',
  bg2: '#e7e6e6',
  tx1: '#000000',
  tx2: '#44546a',
  dk1: '#000000',
  dk2: '#44546a',
  lt1: '#ffffff',
  lt2: '#e7e6e6'
}

function emuToPx(value?: number): number {
  if (!value || Number.isNaN(value)) {
    return 0
  }

  return Math.max(0, Math.round(value / EMU_PER_PX))
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function resolvePptColor(color?: string, fallback = '#ffffff'): string {
  if (!color) {
    return fallback
  }

  const normalized = color.trim().replace(/^#/, '').toLowerCase()
  if (/^[0-9a-f]{6}$/i.test(normalized)) {
    return `#${normalized}`
  }

  return OFFICE_THEME_COLORS[normalized] ?? fallback
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary)
}

function encodeSvgDataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${encodeBase64(new TextEncoder().encode(svg))}`
}

function inferMimeType(path: string): string {
  const normalized = path.toLowerCase()
  if (normalized.endsWith('.png')) return 'image/png'
  if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) return 'image/jpeg'
  if (normalized.endsWith('.gif')) return 'image/gif'
  if (normalized.endsWith('.webp')) return 'image/webp'
  if (normalized.endsWith('.svg')) return 'image/svg+xml'
  return 'application/octet-stream'
}

function estimateCharacterUnits(char: string): number {
  return /[\u0000-\u00ff]/.test(char) ? 0.55 : 1
}

function wrapPreviewText(text: string, maxUnits: number): string[] {
  const trimmed = text.trim()
  if (!trimmed) {
    return []
  }

  const rawLines = trimmed.split(/\r?\n/).flatMap((line) => {
    const current = line.trim()
    if (!current) {
      return ['']
    }

    const segments: string[] = []
    let buffer = ''
    let units = 0

    for (const char of current) {
      const nextUnits = units + estimateCharacterUnits(char)
      if (buffer && nextUnits > maxUnits) {
        segments.push(buffer)
        buffer = char
        units = estimateCharacterUnits(char)
      } else {
        buffer += char
        units = nextUnits
      }
    }

    if (buffer) {
      segments.push(buffer)
    }

    return segments
  })

  return rawLines.filter((line, index) => line.length > 0 || index === 0)
}

function getPreviewElements(slide: PptTemplateSlideAnalysis): PptTemplateElementAnalysis[] {
  const slideElements = slide.elements.filter((element) => element.source === 'slide')
  return (slideElements.length ? slideElements : slide.elements)
    .slice()
    .sort((left, right) => left.zIndex - right.zIndex)
}

function getTextFontSize(element: PptTemplateElementAnalysis, slideHeight: number): number {
  const boxHeight = emuToPx(element.cy)
  const plainText = element.text?.plainText ?? ''
  const isHeading = boxHeight > slideHeight * 0.18 || plainText.length <= 24
  const baseSize = isHeading ? boxHeight * 0.15 : boxHeight * 0.12
  return clamp(Math.round(baseSize), isHeading ? 18 : 12, isHeading ? 40 : 24)
}

function renderShapeElement(element: PptTemplateElementAnalysis): string {
  const x = emuToPx(element.x)
  const y = emuToPx(element.y)
  const width = emuToPx(element.cx)
  const height = emuToPx(element.cy)
  const fill = resolvePptColor(element.shape?.fillColor, 'transparent')
  const stroke = element.shape?.strokeColor
    ? resolvePptColor(element.shape.strokeColor, 'transparent')
    : 'transparent'
  const strokeWidth = element.shape?.strokeWidth
    ? Math.max(1, Math.round(element.shape.strokeWidth / EMU_PER_PX))
    : 0

  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`
}

function renderTextElement(
  element: PptTemplateElementAnalysis,
  slideWidth: number,
  slideHeight: number
): string {
  const plainText = element.text?.plainText?.trim()
  if (!plainText) {
    return element.shape ? renderShapeElement(element) : ''
  }

  const x = emuToPx(element.x)
  const y = emuToPx(element.y)
  const width = emuToPx(element.cx)
  const height = emuToPx(element.cy)
  const fontSize = getTextFontSize(element, slideHeight)
  const maxUnits = Math.max(6, width / Math.max(fontSize * 0.62, 1))
  const lines = wrapPreviewText(plainText, maxUnits).slice(0, 4)
  const lineHeight = Math.round(fontSize * 1.28)
  const totalHeight = lines.length * lineHeight
  const isCentered = width > slideWidth * 0.45
  const startY = y + Math.max(fontSize, Math.round((height - totalHeight) / 2 + fontSize))
  const anchor = isCentered ? 'middle' : 'start'
  const textX = isCentered ? x + width / 2 : x + 12
  const weight = fontSize >= 28 ? 700 : 500
  const textColor = fontSize >= 28 ? '#0f172a' : '#1e293b'
  const boxMarkup = element.shape ? renderShapeElement(element) : ''
  const lineMarkup = lines
    .map((line, index) => {
      const dy = index === 0 ? 0 : lineHeight
      return `<tspan x="${textX}" dy="${dy}">${escapeXml(line)}</tspan>`
    })
    .join('')

  return `${boxMarkup}<text x="${textX}" y="${startY}" fill="${textColor}" font-size="${fontSize}" font-weight="${weight}" text-anchor="${anchor}" font-family="'Microsoft YaHei','PingFang SC','Noto Sans SC',sans-serif">${lineMarkup}</text>`
}

function renderImageElement(element: PptTemplateElementAnalysis, imageDataUrl?: string): string {
  const x = emuToPx(element.x)
  const y = emuToPx(element.y)
  const width = emuToPx(element.cx)
  const height = emuToPx(element.cy)

  if (imageDataUrl) {
    return `<image x="${x}" y="${y}" width="${width}" height="${height}" href="${imageDataUrl}" preserveAspectRatio="xMidYMid meet" />`
  }

  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="8" ry="8" fill="#e2e8f0" /><text x="${x + width / 2}" y="${y + height / 2}" fill="#64748b" font-size="16" font-weight="600" text-anchor="middle" dominant-baseline="middle">IMAGE</text>`
}

function renderTableElement(element: PptTemplateElementAnalysis): string {
  const x = emuToPx(element.x)
  const y = emuToPx(element.y)
  const width = emuToPx(element.cx)
  const height = emuToPx(element.cy)
  const summary = element.table?.cells
    ?.slice(0, 4)
    .map((cell) => cell.text.trim())
    .filter(Boolean)
    .join(' / ')

  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#ffffff" stroke="#cbd5e1" stroke-width="1" /><text x="${x + 10}" y="${y + 24}" fill="#334155" font-size="14" font-weight="600">${escapeXml(summary || '表格')}</text>`
}

async function extractSlideImages(
  slide: PptTemplateSlideAnalysis,
  sourceData: Uint8Array
): Promise<Record<string, string>> {
  const imageTargets = new Set(
    slide.elements
      .filter((element) => element.source === 'slide' && element.kind === 'image')
      .map((element) => element.image?.relationshipTarget)
      .filter((target): target is string => !!target)
  )

  if (!imageTargets.size) {
    return {}
  }

  const jszipModule = await import('jszip2')
  const JSZip = ((jszipModule as { default?: unknown }).default ?? jszipModule) as new (
    data?: ArrayBuffer
  ) => {
    file: (name: string) => { asUint8Array: () => Uint8Array } | null
  }

  const zip = new JSZip(new Uint8Array(sourceData).buffer as ArrayBuffer)
  const imageMap: Record<string, string> = {}

  imageTargets.forEach((target) => {
    const entry = zip.file(target)
    if (!entry) {
      return
    }

    const bytes = entry.asUint8Array()
    imageMap[target] = `data:${inferMimeType(target)};base64,${encodeBase64(bytes)}`
  })

  return imageMap
}

/**
 * 根据模板分析结果生成第一页预览图。
 */
export async function buildTemplatePreviewImage(
  analysis: PptTemplateAnalysis,
  sourceData?: Uint8Array
): Promise<string> {
  const slide = analysis.slides[0]
  if (!slide) {
    throw new Error('模板缺少第一页')
  }

  const slideWidth = emuToPx(analysis.presentation.slideWidth) || DEFAULT_PREVIEW_WIDTH
  const slideHeight = emuToPx(analysis.presentation.slideHeight) || DEFAULT_PREVIEW_HEIGHT
  const imageMap = sourceData ? await extractSlideImages(slide, sourceData) : {}
  const elements = getPreviewElements(slide)
  const backgroundColor = resolvePptColor(slide.background?.color, '#ffffff')

  const elementMarkup = elements
    .map((element) => {
      switch (element.kind) {
        case 'shape':
          return renderShapeElement(element)
        case 'text':
        case 'placeholder':
          return renderTextElement(element, slideWidth, slideHeight)
        case 'image':
          return renderImageElement(element, imageMap[element.image?.relationshipTarget ?? ''])
        case 'table':
          return renderTableElement(element)
        default:
          return ''
      }
    })
    .join('')

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${slideWidth}" height="${slideHeight}" viewBox="0 0 ${slideWidth} ${slideHeight}">
      <rect width="100%" height="100%" fill="${backgroundColor}" />
      ${elementMarkup}
    </svg>
  `.trim()

  return encodeSvgDataUrl(svg)
}
