import type {
  PaperFigureItem,
  PaperLayoutBlock,
  PaperPageOcrResult
} from '../../../shared/types/paper'

interface PendingFigureImage {
  block: PaperLayoutBlock
  imagePath: string
  supportBlocks: PaperLayoutBlock[]
}

export interface ExtractedPaperFigureData {
  figures: PaperFigureItem[]
  pageRemovalBlockIndexes: Record<number, number[]>
}

interface ExtractPaperFigureDataOptions {
  resolveImagePath: (pageResult: PaperPageOcrResult, block: PaperLayoutBlock) => string | undefined
}

function decodeHtmlEntities(content: string): string {
  return content
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
}

function getPlainText(content: string): string {
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

function isRemoteImageUrl(content: string): boolean {
  return /^https?:\/\/\S+$/i.test(content.trim())
}

function getBlockImageSourceCandidates(block: PaperLayoutBlock): string[] {
  const candidates = [block.localAssetPath, block.remoteAssetUrl]

  if (isRemoteImageUrl(block.content)) {
    candidates.push(block.content.trim())
  }

  return candidates.filter((item): item is string => !!item)
}

function getFigureCaptionText(block: PaperLayoutBlock): string {
  return getPlainText(block.content)
}

function isFigureCaptionBlock(block: PaperLayoutBlock): boolean {
  if (block.label !== 'text') {
    return false
  }

  const text = getFigureCaptionText(block)
  return /^(figure|fig\.?|图)\s*[\d一二三四五六七八九十]+(?:[\s.:：-]|$)/i.test(text)
}

function isHeadingBlock(block: PaperLayoutBlock): boolean {
  return block.label === 'text' && /^\s{0,3}#{1,6}\s+/.test(block.content)
}

function isCenteredTextBlock(block: PaperLayoutBlock): boolean {
  if (block.label !== 'text') {
    return false
  }

  if (
    /align\s*=\s*["']center["']/i.test(block.content) ||
    /text-align\s*:\s*center/i.test(block.content)
  ) {
    return true
  }

  const blockCenter = block.bbox.x + block.bbox.width / 2
  const pageCenter = block.width / 2
  return Math.abs(blockCenter - pageCenter) <= block.width * 0.12
}

function isFigureSupportBlock(block: PaperLayoutBlock): boolean {
  if (block.label !== 'text' || isHeadingBlock(block) || isFigureCaptionBlock(block)) {
    return false
  }

  const text = getPlainText(block.content)
  if (!text || text.length > 140 || !isCenteredTextBlock(block)) {
    return false
  }

  return true
}

function buildGroupId(pageResult: PaperPageOcrResult, blockIndex: number): string {
  return `${pageResult.paperId}:${pageResult.pageIndex}:${blockIndex}`
}

function buildSubCaption(blocks: PaperLayoutBlock[]): string | undefined {
  const parts = blocks.map((block) => getPlainText(block.content)).filter(Boolean)
  if (parts.length === 0) {
    return undefined
  }

  return parts.join(' ')
}

export function extractPaperFigureData(
  pageResults: PaperPageOcrResult[],
  options: ExtractPaperFigureDataOptions
): ExtractedPaperFigureData {
  const figures: PaperFigureItem[] = []
  const pageRemovalSets = new Map<number, Set<number>>()

  for (const pageResult of pageResults) {
    const pageRemovalSet = pageRemovalSets.get(pageResult.pageIndex) || new Set<number>()
    pageRemovalSets.set(pageResult.pageIndex, pageRemovalSet)

    let pendingImages: PendingFigureImage[] = []

    const finalizePendingGroup = (captionBlock?: PaperLayoutBlock): void => {
      if (pendingImages.length === 0) {
        return
      }

      if (captionBlock) {
        pageRemovalSet.add(captionBlock.index)
      }

      const caption = captionBlock ? getFigureCaptionText(captionBlock) : ''
      const groupId = buildGroupId(pageResult, pendingImages[0].block.index)

      for (const pendingImage of pendingImages) {
        figures.push({
          id: `${groupId}:${pendingImage.block.index}`,
          paperId: pageResult.paperId,
          pageIndex: pageResult.pageIndex,
          blockIndex: pendingImage.block.index,
          groupId,
          imagePath: pendingImage.imagePath,
          caption,
          subCaption: buildSubCaption(pendingImage.supportBlocks),
          bbox: pendingImage.block.bbox
        })
      }

      pendingImages = []
    }

    for (const block of pageResult.blocks) {
      if (block.label === 'image') {
        const imagePath = options.resolveImagePath(pageResult, block)
        if (imagePath) {
          pendingImages.push({
            block,
            imagePath,
            supportBlocks: []
          })
          pageRemovalSet.add(block.index)
          continue
        }

        finalizePendingGroup()
        continue
      }

      if (pendingImages.length > 0) {
        if (isFigureSupportBlock(block)) {
          pendingImages[pendingImages.length - 1].supportBlocks.push(block)
          pageRemovalSet.add(block.index)
          continue
        }

        if (isFigureCaptionBlock(block)) {
          finalizePendingGroup(block)
          continue
        }

        finalizePendingGroup()
      }
    }

    finalizePendingGroup()
  }

  return {
    figures,
    pageRemovalBlockIndexes: Object.fromEntries(
      Array.from(pageRemovalSets.entries()).map(([pageIndex, removalSet]) => [
        pageIndex,
        Array.from(removalSet).sort((a, b) => a - b)
      ])
    )
  }
}

function escapeRegExp(content: string): string {
  return content.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function removeImageBlock(markdown: string, block: PaperLayoutBlock): string {
  let nextMarkdown = markdown

  for (const source of getBlockImageSourceCandidates(block)) {
    const escapedSource = escapeRegExp(source)

    nextMarkdown = nextMarkdown.replace(
      new RegExp(
        `<div[^>]*>\\s*<img\\b[^>]*src=['"]${escapedSource}['"][^>]*\\/?>(?:\\s*</img>)?\\s*</div>\\s*`,
        'gi'
      ),
      ''
    )

    nextMarkdown = nextMarkdown.replace(
      new RegExp(`<img\\b[^>]*src=['"]${escapedSource}['"][^>]*\\/?>(?:\\s*</img>)?\\s*`, 'gi'),
      ''
    )

    nextMarkdown = nextMarkdown.replace(
      new RegExp(`!\\[[^\\]]*\\]\\(${escapedSource}\\)\\s*`, 'g'),
      ''
    )
  }

  return nextMarkdown
}

function removeNonImageBlock(markdown: string, block: PaperLayoutBlock): string {
  if (!block.content) {
    return markdown
  }

  return markdown.replace(block.content, '')
}

function cleanupReaderMarkdown(markdown: string): string {
  return markdown
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n+\s*$/g, '')
    .trim()
}

export function buildReaderMarkdown(
  pageResults: PaperPageOcrResult[],
  pageRemovalBlockIndexes: Record<number, number[]>
): string {
  const parts: string[] = []

  for (const pageResult of pageResults) {
    const removalIndexes = new Set(pageRemovalBlockIndexes[pageResult.pageIndex] || [])
    let pageMarkdown = pageResult.markdown

    for (const block of pageResult.blocks) {
      if (!removalIndexes.has(block.index)) {
        continue
      }

      pageMarkdown =
        block.label === 'image'
          ? removeImageBlock(pageMarkdown, block)
          : removeNonImageBlock(pageMarkdown, block)
    }

    const cleanedMarkdown = cleanupReaderMarkdown(pageMarkdown)
    parts.push(`<!-- Page ${pageResult.pageIndex + 1} -->\n\n${cleanedMarkdown}`)
  }

  return parts.join('\n\n')
}
