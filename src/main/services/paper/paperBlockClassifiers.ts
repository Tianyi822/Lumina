import type { PaperLayoutBlock, PaperPageOcrResult } from '../../../shared/types/paper'
import type { PendingFigureImage } from './paperFigureExtractorTypes.ts'

export function decodeHtmlEntities(content: string): string {
  return content
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
}

export function getPlainText(content: string): string {
  const withLineBreaks = content
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|li|tr|td|th|h[1-6])>/gi, '\n')
  const withoutHtml = withLineBreaks.replace(/<[^>]+>/g, ' ')
  const withoutMarkdown = withoutHtml
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .replace(/`/g, '')

  return decodeHtmlEntities(withoutMarkdown).replace(/\s+/g, ' ').trim()
}

export function getBlockTopRatio(block: PaperLayoutBlock): number {
  return block.height > 0 ? block.bbox.y / block.height : 0
}

export function getBlockBottomRatio(block: PaperLayoutBlock): number {
  return block.height > 0 ? (block.bbox.y + block.bbox.height) / block.height : 0
}

export function getBlockWidthRatio(block: PaperLayoutBlock): number {
  return block.width > 0 ? block.bbox.width / block.width : 0
}

export function getBlockHeightRatio(block: PaperLayoutBlock): number {
  return block.height > 0 ? block.bbox.height / block.height : 0
}

export function getBlockAreaRatio(block: PaperLayoutBlock): number {
  const pageArea = block.width * block.height
  if (pageArea <= 0) {
    return 0
  }

  return (block.bbox.width * block.bbox.height) / pageArea
}

export function isRemoteImageUrl(content: string): boolean {
  return /^https?:\/\/\S+$/i.test(content.trim())
}

export function getBlockImageSourceCandidates(block: PaperLayoutBlock): string[] {
  const candidates = [block.localAssetPath, block.remoteAssetUrl]

  if (isRemoteImageUrl(block.content)) {
    candidates.push(block.content.trim())
  }

  return candidates.filter((item): item is string => !!item)
}

export function getFigureCaptionText(block: PaperLayoutBlock): string {
  return getPlainText(block.content)
}

export function isFigureCaptionBlock(block: PaperLayoutBlock): boolean {
  if (block.label !== 'text') {
    return false
  }

  const text = getFigureCaptionText(block)
  return /^(figure|fig\.?|图)\s*[\d一二三四五六七八九十]+(?:[\s.:：-]|$)/i.test(text)
}

export function isTableCaptionBlock(block: PaperLayoutBlock): boolean {
  if (block.label !== 'text') {
    return false
  }

  const text = getPlainText(block.content)
  return /^(table|tab\.?|表)\s*[\d一二三四五六七八九十]+(?:[\s.:：-]|$)/i.test(text)
}

export function isHeadingBlock(block: PaperLayoutBlock): boolean {
  return block.label === 'text' && /^\s{0,3}#{1,6}\s+/.test(block.content)
}

export function hasExplicitCenteredAlignment(content: string): boolean {
  return /align\s*=\s*["']center["']/i.test(content) || /text-align\s*:\s*center/i.test(content)
}

export function isCenteredTextBlock(block: PaperLayoutBlock): boolean {
  if (block.label !== 'text') {
    return false
  }

  if (hasExplicitCenteredAlignment(block.content)) {
    return true
  }

  const blockCenter = block.bbox.x + block.bbox.width / 2
  const pageCenter = block.width / 2
  return Math.abs(blockCenter - pageCenter) <= block.width * 0.12
}

export function isFigureSupportBlock(block: PaperLayoutBlock): boolean {
  if (block.label !== 'text' || isHeadingBlock(block) || isFigureCaptionBlock(block)) {
    return false
  }

  const text = getPlainText(block.content)
  const widthRatio = getBlockWidthRatio(block)
  if (!text || text.length > 140 || widthRatio > 0.5) {
    return false
  }

  if (hasExplicitCenteredAlignment(block.content)) {
    return true
  }

  if (!isCenteredTextBlock(block) || block.bbox.width > block.width * 0.45) {
    return false
  }

  return true
}

export function isLikelyDecorativeHeaderImage(block: PaperLayoutBlock): boolean {
  return (
    getBlockTopRatio(block) <= 0.16 &&
    getBlockBottomRatio(block) <= 0.22 &&
    getBlockWidthRatio(block) <= 0.18 &&
    getBlockHeightRatio(block) <= 0.12 &&
    getBlockAreaRatio(block) <= 0.012
  )
}

export function isLikelyPaperHeaderTextBlock(block: PaperLayoutBlock): boolean {
  if (block.label !== 'text' || isHeadingBlock(block) || isFigureCaptionBlock(block)) {
    return false
  }

  const text = getPlainText(block.content)
  if (!text || !isCenteredTextBlock(block) || getBlockBottomRatio(block) > 0.48) {
    return false
  }

  return (
    getBlockWidthRatio(block) >= 0.32 ||
    text.length >= 32 ||
    /(?:university|institute|school|college|laboratory|lab|department|academy|center|centre|cas|国家|中国|大学|学院|研究所|实验室|中心|系)/i.test(
      text
    )
  )
}

export function buildGroupId(pageResult: PaperPageOcrResult, blockIndex: number): string {
  return `${pageResult.paperId}:${pageResult.pageIndex}:${blockIndex}`
}

export function buildSubCaption(blocks: PaperLayoutBlock[]): string | undefined {
  const parts = blocks.map((block) => getPlainText(block.content)).filter(Boolean)
  if (parts.length === 0) {
    return undefined
  }

  return parts.join(' ')
}

export function shouldIgnoreCaptionlessFigureGroup(
  pageResult: PaperPageOcrResult,
  pendingImages: PendingFigureImage[]
): boolean {
  if (pageResult.pageIndex !== 0 || pendingImages.length !== 1) {
    return false
  }

  const [pendingImage] = pendingImages
  if (!isLikelyDecorativeHeaderImage(pendingImage.block)) {
    return false
  }

  if (pendingImage.supportBlocks.length === 0) {
    return true
  }

  const supportText = buildSubCaption(pendingImage.supportBlocks) || ''
  const supportBottom = Math.max(
    ...pendingImage.supportBlocks.map((supportBlock) => getBlockBottomRatio(supportBlock))
  )

  return (
    supportBottom <= 0.48 &&
    pendingImage.supportBlocks.every((supportBlock) =>
      isLikelyPaperHeaderTextBlock(supportBlock)
    ) &&
    (pendingImage.supportBlocks.length >= 2 || supportText.length >= 48)
  )
}
