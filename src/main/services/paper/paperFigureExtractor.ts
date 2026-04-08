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

export interface PaperFigureRemovalGroup {
  groupId: string
  startBlockIndex: number
  endBlockIndex: number
  blockIndexes: number[]
}

export interface ExtractedPaperFigureData {
  figures: PaperFigureItem[]
  pageRemovalBlockIndexes: Record<number, number[]>
  pageRemovalGroups: Record<number, PaperFigureRemovalGroup[]>
}

interface ExtractPaperFigureDataOptions {
  resolveImagePath: (pageResult: PaperPageOcrResult, block: PaperLayoutBlock) => string | undefined
}

interface ReplaceBlockResult {
  markdown: string
  replaced: boolean
}

interface ReaderPageFragment {
  pageIndex: number
  markdown: string
  leadingBlock?: PaperLayoutBlock
  trailingBlock?: PaperLayoutBlock
}

interface TextBlockOccurrence {
  block: PaperLayoutBlock
  start: number
  end: number
  content: string
}

interface TextRunReplacement {
  start: number
  end: number
  replacement: string
}

const SIMPLE_TEXT_CONTAINER_TAGS = [
  'div',
  'p',
  'span',
  'strong',
  'em',
  'b',
  'i',
  'u',
  'sup',
  'sub',
  'a',
  'font',
  'small',
  'mark',
  'br'
].join('|')

const SIMPLE_TEXT_CONTAINER_PATTERN = new RegExp(
  `<\\/?(?:${SIMPLE_TEXT_CONTAINER_TAGS})\\b[^>]*\\/?>`,
  'gi'
)

const STRUCTURAL_HTML_PATTERN =
  /<\/?(?:img|table|thead|tbody|tfoot|tr|td|th|ul|ol|li|blockquote|pre|code|figure|figcaption|h[1-6]|hr|svg|math)\b/i

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

function getBlockTopRatio(block: PaperLayoutBlock): number {
  return block.height > 0 ? block.bbox.y / block.height : 0
}

function getBlockBottomRatio(block: PaperLayoutBlock): number {
  return block.height > 0 ? (block.bbox.y + block.bbox.height) / block.height : 0
}

function getBlockWidthRatio(block: PaperLayoutBlock): number {
  return block.width > 0 ? block.bbox.width / block.width : 0
}

function getBlockHeightRatio(block: PaperLayoutBlock): number {
  return block.height > 0 ? block.bbox.height / block.height : 0
}

function getBlockAreaRatio(block: PaperLayoutBlock): number {
  const pageArea = block.width * block.height
  if (pageArea <= 0) {
    return 0
  }

  return (block.bbox.width * block.bbox.height) / pageArea
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

function hasExplicitCenteredAlignment(content: string): boolean {
  return (
    /align\s*=\s*["']center["']/i.test(content) || /text-align\s*:\s*center/i.test(content)
  )
}

function isCenteredTextBlock(block: PaperLayoutBlock): boolean {
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

function isFigureSupportBlock(block: PaperLayoutBlock): boolean {
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

function isLikelyDecorativeHeaderImage(block: PaperLayoutBlock): boolean {
  return (
    getBlockTopRatio(block) <= 0.16 &&
    getBlockBottomRatio(block) <= 0.22 &&
    getBlockWidthRatio(block) <= 0.18 &&
    getBlockHeightRatio(block) <= 0.12 &&
    getBlockAreaRatio(block) <= 0.012
  )
}

function isLikelyPaperHeaderTextBlock(block: PaperLayoutBlock): boolean {
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

function shouldIgnoreCaptionlessFigureGroup(
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
    pendingImage.supportBlocks.every((supportBlock) => isLikelyPaperHeaderTextBlock(supportBlock)) &&
    (pendingImage.supportBlocks.length >= 2 || supportText.length >= 48)
  )
}

function isBodyTextBlock(block: PaperLayoutBlock | undefined): block is PaperLayoutBlock {
  if (!block || block.label !== 'text') {
    return false
  }

  if (
    isHeadingBlock(block) ||
    isFigureCaptionBlock(block) ||
    isFigureSupportBlock(block) ||
    isMathLikeSegment(block.content)
  ) {
    return false
  }

  return isMergeableTextSegment(block.content)
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

function endsWithStrongTerminalPunctuation(text: string): boolean {
  return /[.!?。？！]["')\]]*\s*$/.test(text)
}

function startsWithContinuationText(text: string): boolean {
  return /^[a-z0-9(,:;'"“‘\[]/.test(text)
}

function startsWithInlineContinuationCue(text: string): boolean {
  return /^[a-z(,:;'"“‘\[]/.test(text)
}

function startsWithUppercaseLatin(text: string): boolean {
  return /^[A-Z]/.test(text)
}

function startsWithNewParagraphMarker(content: string): boolean {
  return /^\s{0,3}(?:[-*+]\s+|\d+[.)]\s+|>\s+)/.test(content)
}

function isReferenceSectionHeading(text: string): boolean {
  return /^(?:references|bibliography|reference|参考文献)$/.test(text.trim())
}

function startsWithReferenceEntry(text: string, source: string): boolean {
  const trimmedText = text.trim()
  const trimmedSource = source.trim()

  if (
    /^(?:\d+\s+)?(?:\[\d{1,4}\]|\(\d{1,4}\))\s+/.test(trimmedText) ||
    /^(?:\d+\s+)?(?:\[\d{1,4}\]|\(\d{1,4}\))\s+/.test(trimmedSource)
  ) {
    return true
  }

  return /^(?:\d+\s+)?\d+\.\s+[A-Z\u00C0-\u024F]/.test(trimmedText)
}

function shouldMergeTextFlow(
  previousText: string | undefined,
  nextText: string | undefined,
  nextSource: string
): boolean {
  if (!previousText || !nextText) {
    return false
  }

  if (
    isReferenceSectionHeading(previousText) ||
    startsWithNewParagraphMarker(nextSource) ||
    startsWithReferenceEntry(nextText, nextSource)
  ) {
    return false
  }

  if (previousText.endsWith('-')) {
    return true
  }

  const previousEndsStrong = endsWithStrongTerminalPunctuation(previousText)
  if (
    previousEndsStrong &&
    (startsWithUppercaseLatin(nextText) || startsWithNewParagraphMarker(nextSource))
  ) {
    return false
  }

  return !previousEndsStrong || startsWithContinuationText(nextText)
}

function getTextFlowReplacement(
  previousText: string | undefined,
  nextText: string | undefined,
  nextSource: string
): string {
  if (!shouldMergeTextFlow(previousText, nextText, nextSource)) {
    return '\n\n'
  }

  return (previousText ?? '').endsWith('-') ? '' : ' '
}

function getBodyBlockGapReplacement(
  previousBlock: PaperLayoutBlock | undefined,
  nextBlock: PaperLayoutBlock | undefined
): string {
  if (!isBodyTextBlock(previousBlock) || !isBodyTextBlock(nextBlock)) {
    return '\n\n'
  }

  return shouldMergeAdjacentTextBlocks(previousBlock, nextBlock)
    ? getTextFlowReplacement(
        getPlainText(previousBlock.content),
        getPlainText(nextBlock.content),
        nextBlock.content
      )
    : '\n\n'
}

function getBlockVerticalGap(previousBlock: PaperLayoutBlock, nextBlock: PaperLayoutBlock): number {
  return nextBlock.bbox.y - (previousBlock.bbox.y + previousBlock.bbox.height)
}

function hasSimilarHorizontalCenter(
  previousBlock: PaperLayoutBlock,
  nextBlock: PaperLayoutBlock
): boolean {
  const previousCenter = previousBlock.bbox.x + previousBlock.bbox.width / 2
  const nextCenter = nextBlock.bbox.x + nextBlock.bbox.width / 2
  return Math.abs(previousCenter - nextCenter) <= previousBlock.width * 0.08
}

function shouldMergeCenteredTextBlocks(
  previousBlock: PaperLayoutBlock,
  nextBlock: PaperLayoutBlock
): boolean {
  const verticalGap = getBlockVerticalGap(previousBlock, nextBlock)
  const compactGapThreshold = Math.max(
    24,
    Math.min(previousBlock.bbox.height, nextBlock.bbox.height) * 0.6
  )

  return verticalGap <= compactGapThreshold && hasSimilarHorizontalCenter(previousBlock, nextBlock)
}

function shouldMergeAdjacentTextBlocks(
  previousBlock: PaperLayoutBlock | undefined,
  nextBlock: PaperLayoutBlock | undefined
): boolean {
  if (!isBodyTextBlock(previousBlock) || !isBodyTextBlock(nextBlock)) {
    return false
  }

  const replacement = getTextFlowReplacement(
    getPlainText(previousBlock.content),
    getPlainText(nextBlock.content),
    nextBlock.content
  )
  if (replacement === '\n\n') {
    return false
  }

  const previousCentered = isCenteredTextBlock(previousBlock)
  const nextCentered = isCenteredTextBlock(nextBlock)
  if (
    previousCentered &&
    nextCentered &&
    !startsWithInlineContinuationCue(getPlainText(nextBlock.content))
  ) {
    return previousCentered && nextCentered && shouldMergeCenteredTextBlocks(previousBlock, nextBlock)
  }

  return true
}

function normalizeSegmentForMathDetection(segment: string): string {
  return decodeHtmlEntities(
    segment
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(div|p|li|tr|td|th|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim()
}

function isStandaloneMathDelimiter(segment: string): boolean {
  return /^(?:\${1,2}|\\\(|\\\)|\\\[|\\\])$/.test(segment.trim())
}

function hasMathDelimiters(segment: string): boolean {
  const normalized = normalizeSegmentForMathDetection(segment)
  if (!normalized) {
    return false
  }

  return /(^|[^\\])\${1,2}/.test(normalized) || /\\\[|\\\]|\\\(|\\\)/.test(normalized)
}

function hasLatexEnvironment(segment: string): boolean {
  return /\\(?:begin|end)\{[^}]+\}/.test(normalizeSegmentForMathDetection(segment))
}

function looksLikeMathBody(segment: string): boolean {
  const normalized = normalizeSegmentForMathDetection(segment)
  if (!normalized) {
    return false
  }

  const texCommandCount = (normalized.match(/\\[A-Za-z]+/g) || []).length
  const mathStructureCount = (normalized.match(/[=^_{}]/g) || []).length
  const formulaLikeWordCount = (normalized.match(/[A-Za-z]{2,}/g) || []).length

  if (/^\\[A-Za-z]+/.test(normalized)) {
    return true
  }

  if (texCommandCount >= 2) {
    return true
  }

  if (texCommandCount >= 1 && mathStructureCount >= 2) {
    return true
  }

  if (
    texCommandCount >= 1 &&
    mathStructureCount >= 1 &&
    formulaLikeWordCount <= texCommandCount + 4 &&
    !/[.!?。？！]/.test(normalized)
  ) {
    return true
  }

  return false
}

function isMathLikeSegment(segment: string): boolean {
  return (
    isStandaloneMathDelimiter(segment) ||
    hasMathDelimiters(segment) ||
    hasLatexEnvironment(segment) ||
    looksLikeMathBody(segment)
  )
}

function isSimpleTextContainerSegment(segment: string): boolean {
  const trimmed = segment.trim()
  if (!trimmed.startsWith('<') || STRUCTURAL_HTML_PATTERN.test(trimmed)) {
    return false
  }

  const withoutAllowedTags = trimmed.replace(SIMPLE_TEXT_CONTAINER_PATTERN, '').trim()
  return withoutAllowedTags.length > 0 && !/[<>]/.test(withoutAllowedTags)
}

function isMergeableTextSegment(segment: string): boolean {
  const trimmed = segment.trim()
  if (!trimmed) {
    return false
  }

  if (
    /^<!--[\s\S]*?-->$/.test(trimmed) ||
    /^\s{0,3}#{1,6}\s+/.test(trimmed) ||
    /^\s{0,3}(?:[-*+]\s+|\d+[.)]\s+|>\s+)/.test(trimmed) ||
    /^\s*(?:```|~~~)/.test(trimmed) ||
    /^\s*\|/.test(trimmed) ||
    isMathLikeSegment(trimmed)
  ) {
    return false
  }

  if (/^\s*</.test(trimmed) && !isSimpleTextContainerSegment(trimmed)) {
    return false
  }

  return getPlainText(trimmed).length > 0
}

function isOrdinaryParagraphSegment(segment: string): boolean {
  const trimmed = segment.trim()
  return isMergeableTextSegment(trimmed) && !/^\s*</.test(trimmed)
}

function normalizeSoftWrappedLines(segment: string): string {
  if (!isOrdinaryParagraphSegment(segment) || !segment.includes('\n')) {
    return segment
  }

  const lines = segment
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length <= 1) {
    return lines[0] ?? ''
  }

  const normalizedParagraphs: string[] = [lines[0]]

  for (const line of lines.slice(1)) {
    const previousParagraph = normalizedParagraphs[normalizedParagraphs.length - 1]
    const replacement = getTextFlowReplacement(getPlainText(previousParagraph), getPlainText(line), line)

    if (replacement === '\n\n') {
      normalizedParagraphs.push(line)
      continue
    }

    normalizedParagraphs[normalizedParagraphs.length - 1] = `${previousParagraph}${replacement}${line}`
  }

  return normalizedParagraphs.join('\n\n')
}

function reflowOrdinaryParagraphs(markdown: string): string {
  const segments = markdown
    .split(/\n{2,}/)
    .flatMap((segment) => normalizeSoftWrappedLines(segment).split(/\n{2,}/))
  const normalizedMarkdown = segments.join('\n\n')
  if (segments.length <= 1) {
    return normalizedMarkdown || markdown
  }

  const reflowedSegments: string[] = []

  for (const segment of segments) {
    if (reflowedSegments.length === 0) {
      reflowedSegments.push(segment)
      continue
    }

    const previousSegment = reflowedSegments[reflowedSegments.length - 1]
    if (!isOrdinaryParagraphSegment(previousSegment) || !isOrdinaryParagraphSegment(segment)) {
      reflowedSegments.push(segment)
      continue
    }

    const replacement = getTextFlowReplacement(
      getPlainText(previousSegment),
      getPlainText(segment),
      segment
    )

    if (replacement === '\n\n') {
      reflowedSegments.push(segment)
      continue
    }

    reflowedSegments[reflowedSegments.length - 1] =
      `${previousSegment}${replacement}${segment.trimStart()}`
  }

  return reflowedSegments.join('\n\n')
}

function getSimpleTextContainerReflowSource(content: string): string {
  const withLineBreaks = decodeHtmlEntities(
    content
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(div|p|li|tr|td|th|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )

  const segments = withLineBreaks
    .split(/\n{2,}/)
    .map((segment) => segment.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  return segments.join('\n\n')
}

function normalizeMergeableTextBlockContent(content: string): string {
  if (!isMergeableTextSegment(content)) {
    return content
  }

  if (isSimpleTextContainerSegment(content)) {
    const reflowSource = getSimpleTextContainerReflowSource(content)
    return reflowSource ? reflowOrdinaryParagraphs(reflowSource) : content
  }

  return reflowOrdinaryParagraphs(content)
}

export function extractPaperFigureData(
  pageResults: PaperPageOcrResult[],
  options: ExtractPaperFigureDataOptions
): ExtractedPaperFigureData {
  const figures: PaperFigureItem[] = []
  const pageRemovalSets = new Map<number, Set<number>>()
  const pageRemovalGroups = new Map<number, PaperFigureRemovalGroup[]>()

  for (const pageResult of pageResults) {
    const pageRemovalSet = pageRemovalSets.get(pageResult.pageIndex) || new Set<number>()
    pageRemovalSets.set(pageResult.pageIndex, pageRemovalSet)

    const removalGroups = pageRemovalGroups.get(pageResult.pageIndex) || []
    pageRemovalGroups.set(pageResult.pageIndex, removalGroups)

    let pendingImages: PendingFigureImage[] = []

    const finalizePendingGroup = (captionBlock?: PaperLayoutBlock): void => {
      if (pendingImages.length === 0) {
        return
      }

      if (!captionBlock && shouldIgnoreCaptionlessFigureGroup(pageResult, pendingImages)) {
        for (const pendingImage of pendingImages) {
          pageRemovalSet.delete(pendingImage.block.index)
          for (const supportBlock of pendingImage.supportBlocks) {
            pageRemovalSet.delete(supportBlock.index)
          }
        }

        pendingImages = []
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

      const removalBlocks = pendingImages.flatMap((pendingImage) => [
        pendingImage.block,
        ...pendingImage.supportBlocks
      ])
      if (captionBlock) {
        removalBlocks.push(captionBlock)
      }

      removalGroups.push({
        groupId,
        startBlockIndex: removalBlocks[0]?.index ?? pendingImages[0].block.index,
        endBlockIndex:
          removalBlocks[removalBlocks.length - 1]?.index ??
          pendingImages[pendingImages.length - 1].block.index,
        blockIndexes: removalBlocks.map((block) => block.index)
      })

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
    ),
    pageRemovalGroups: Object.fromEntries(
      Array.from(pageRemovalGroups.entries()).map(([pageIndex, removalGroups]) => [
        pageIndex,
        removalGroups
      ])
    )
  }
}

function escapeRegExp(content: string): string {
  return content.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function replaceLiteral(
  markdown: string,
  searchValue: string,
  replacement: string
): ReplaceBlockResult {
  const matchIndex = markdown.indexOf(searchValue)
  if (matchIndex < 0) {
    return { markdown, replaced: false }
  }

  return {
    markdown:
      markdown.slice(0, matchIndex) +
      replacement +
      markdown.slice(matchIndex + searchValue.length),
    replaced: true
  }
}

function replaceImageBlock(
  markdown: string,
  block: PaperLayoutBlock,
  replacement: string
): ReplaceBlockResult {
  for (const source of getBlockImageSourceCandidates(block)) {
    const escapedSource = escapeRegExp(source)
    const patterns = [
      new RegExp(
        `<div[^>]*>\\s*<img\\b[^>]*src=['"]${escapedSource}['"][^>]*\\/?>(?:\\s*</img>)?\\s*</div>`,
        'i'
      ),
      new RegExp(`<img\\b[^>]*src=['"]${escapedSource}['"][^>]*\\/?>(?:\\s*</img>)?`, 'i'),
      new RegExp(`!\\[[^\\]]*\\]\\(${escapedSource}\\)`, 'i')
    ]

    for (const pattern of patterns) {
      const nextMarkdown = markdown.replace(pattern, replacement)
      if (nextMarkdown !== markdown) {
        return { markdown: nextMarkdown, replaced: true }
      }
    }
  }

  return { markdown, replaced: false }
}

function replaceNonImageBlock(
  markdown: string,
  block: PaperLayoutBlock,
  replacement: string
): ReplaceBlockResult {
  if (!block.content) {
    return { markdown, replaced: false }
  }

  return replaceLiteral(markdown, block.content, replacement)
}

function replaceBlockWithToken(
  markdown: string,
  block: PaperLayoutBlock,
  replacement: string
): ReplaceBlockResult {
  return block.label === 'image'
    ? replaceImageBlock(markdown, block, replacement)
    : replaceNonImageBlock(markdown, block, replacement)
}

function replaceRemovalGroupWithToken(
  markdown: string,
  pageBlocks: PaperLayoutBlock[],
  blockIndexes: Set<number>,
  token: string
): string {
  let nextMarkdown = markdown
  let insertedToken = false

  for (const block of pageBlocks) {
    if (!blockIndexes.has(block.index)) {
      continue
    }

    const result = replaceBlockWithToken(nextMarkdown, block, insertedToken ? '' : token)
    if (!result.replaced) {
      continue
    }

    nextMarkdown = result.markdown
    insertedToken = true
  }

  return nextMarkdown
}

function replaceTokenWithGap(markdown: string, token: string, replacement: string): string {
  const tokenPattern = new RegExp(`\\s*${escapeRegExp(token)}\\s*`, 'g')
  return markdown.replace(tokenPattern, replacement)
}

function findTextBlockOccurrences(
  markdown: string,
  pageBlocks: PaperLayoutBlock[],
  removalIndexes: Set<number>
): Map<number, TextBlockOccurrence> {
  const occurrences = new Map<number, TextBlockOccurrence>()
  let searchStart = 0

  for (const block of pageBlocks) {
    if (removalIndexes.has(block.index) || block.label !== 'text' || !block.content) {
      continue
    }

    const searchValues = [
      block.content,
      normalizeMergeableTextBlockContent(block.content)
    ].filter((value, index, values) => value && values.indexOf(value) === index)

    let matchedStart = -1
    let matchedContent = ''

    for (const searchValue of searchValues) {
      const start = markdown.indexOf(searchValue, searchStart)
      if (start < 0) {
        continue
      }

      if (matchedStart < 0 || start < matchedStart) {
        matchedStart = start
        matchedContent = searchValue
      }
    }

    if (matchedStart < 0) {
      continue
    }

    const end = matchedStart + matchedContent.length
    occurrences.set(block.index, {
      block,
      start: matchedStart,
      end,
      content: markdown.slice(matchedStart, end)
    })
    searchStart = end
  }

  return occurrences
}

function normalizeVisibleTextBlocks(
  markdown: string,
  pageBlocks: PaperLayoutBlock[],
  removalIndexes: Set<number>
): string {
  const occurrences = findTextBlockOccurrences(markdown, pageBlocks, removalIndexes)
  const replacements: TextRunReplacement[] = []

  for (const block of pageBlocks) {
    if (removalIndexes.has(block.index) || block.label !== 'text') {
      continue
    }

    const occurrence = occurrences.get(block.index)
    if (!occurrence) {
      continue
    }

    const replacement = normalizeMergeableTextBlockContent(occurrence.content)
    if (replacement === occurrence.content) {
      continue
    }

    replacements.push({
      start: occurrence.start,
      end: occurrence.end,
      replacement
    })
  }

  return applyTextRunReplacements(markdown, replacements)
}

function getMergeableTextContent(content: string): string {
  return isSimpleTextContainerSegment(content) ? getPlainText(content) : content.trim()
}

function buildMergedTextRunContent(
  blocks: PaperLayoutBlock[],
  occurrences: Map<number, TextBlockOccurrence>
): string {
  const [firstBlock, ...restBlocks] = blocks
  const firstOccurrence = occurrences.get(firstBlock.index)
  let mergedContent = getMergeableTextContent(firstOccurrence?.content || firstBlock.content)
  let previousBlock = firstBlock

  for (const block of restBlocks) {
    const occurrence = occurrences.get(block.index)
    const gapReplacement = getBodyBlockGapReplacement(previousBlock, block)
    const nextContent = getMergeableTextContent(occurrence?.content || block.content).trimStart()
    mergedContent += `${gapReplacement}${nextContent}`
    previousBlock = block
  }

  return mergedContent
}

function applyTextRunReplacements(markdown: string, replacements: TextRunReplacement[]): string {
  if (replacements.length === 0) {
    return markdown
  }

  let nextMarkdown = ''
  let cursor = 0

  for (const replacement of replacements) {
    nextMarkdown += markdown.slice(cursor, replacement.start)
    nextMarkdown += replacement.replacement
    cursor = replacement.end
  }

  nextMarkdown += markdown.slice(cursor)
  return nextMarkdown
}

function mergeAdjacentTextBlocks(
  markdown: string,
  pageBlocks: PaperLayoutBlock[],
  removalIndexes: Set<number>
): string {
  const visibleBlocks = pageBlocks.filter((block) => !removalIndexes.has(block.index))
  const occurrences = findTextBlockOccurrences(markdown, pageBlocks, removalIndexes)
  const replacements: TextRunReplacement[] = []

  for (let index = 0; index < visibleBlocks.length; index += 1) {
    const currentBlock = visibleBlocks[index]
    if (currentBlock.label !== 'text' || !occurrences.has(currentBlock.index)) {
      continue
    }

    const runBlocks = [currentBlock]
    let cursor = index

    while (cursor + 1 < visibleBlocks.length) {
      const previousBlock = visibleBlocks[cursor]
      const nextBlock = visibleBlocks[cursor + 1]
      if (
        previousBlock.label !== 'text' ||
        nextBlock.label !== 'text' ||
        !shouldMergeAdjacentTextBlocks(previousBlock, nextBlock)
      ) {
        break
      }

      const previousOccurrence = occurrences.get(previousBlock.index)
      const nextOccurrence = occurrences.get(nextBlock.index)
      if (!previousOccurrence || !nextOccurrence || previousOccurrence.end > nextOccurrence.start) {
        break
      }

      const gapContent = markdown.slice(previousOccurrence.end, nextOccurrence.start)
      if (!/^\s+$/.test(gapContent)) {
        break
      }

      runBlocks.push(nextBlock)
      cursor += 1
    }

    if (runBlocks.length > 1) {
      const firstOccurrence = occurrences.get(runBlocks[0].index)
      const lastOccurrence = occurrences.get(runBlocks[runBlocks.length - 1].index)
      if (firstOccurrence && lastOccurrence) {
        replacements.push({
          start: firstOccurrence.start,
          end: lastOccurrence.end,
          replacement: buildMergedTextRunContent(runBlocks, occurrences)
        })
      }
      index = cursor
    }
  }

  return applyTextRunReplacements(markdown, replacements)
}

function cleanupReaderMarkdown(markdown: string): string {
  return markdown
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n+\s*$/g, '')
    .trim()
}

function buildPageComment(pageIndex: number): string {
  return `<!-- Page ${pageIndex + 1} -->`
}

function findNeighborBlock(
  pageBlocks: PaperLayoutBlock[],
  startPosition: number,
  step: -1 | 1,
  removalIndexes: Set<number>
): PaperLayoutBlock | undefined {
  for (
    let position = startPosition;
    position >= 0 && position < pageBlocks.length;
    position += step
  ) {
    const block = pageBlocks[position]
    if (!removalIndexes.has(block.index)) {
      return block
    }
  }

  return undefined
}

function findBoundaryBlock(
  pageBlocks: PaperLayoutBlock[],
  removalIndexes: Set<number>,
  direction: 'start' | 'end'
): PaperLayoutBlock | undefined {
  const startPosition = direction === 'start' ? 0 : pageBlocks.length - 1
  const step = direction === 'start' ? 1 : -1

  return findNeighborBlock(pageBlocks, startPosition, step, removalIndexes)
}

function buildReaderPageFragment(
  pageResult: PaperPageOcrResult,
  figureData: Pick<ExtractedPaperFigureData, 'pageRemovalBlockIndexes' | 'pageRemovalGroups'>
): ReaderPageFragment {
  const removalIndexes = new Set(figureData.pageRemovalBlockIndexes[pageResult.pageIndex] || [])
  const blockPositions = new Map(
    pageResult.blocks.map((block, position) => [block.index, position] as const)
  )
  const removalGroups = [...(figureData.pageRemovalGroups[pageResult.pageIndex] || [])].sort(
    (left, right) =>
      (blockPositions.get(left.startBlockIndex) ?? Number.MAX_SAFE_INTEGER) -
      (blockPositions.get(right.startBlockIndex) ?? Number.MAX_SAFE_INTEGER)
  )

  let pageMarkdown = pageResult.markdown
  const gapReplacements: Array<{ token: string; replacement: string }> = []

  for (let groupIndex = 0; groupIndex < removalGroups.length; groupIndex += 1) {
    const group = removalGroups[groupIndex]
    const startPosition = blockPositions.get(group.startBlockIndex)
    const endPosition = blockPositions.get(group.endBlockIndex)
    if (startPosition === undefined || endPosition === undefined) {
      continue
    }

    const previousBlock = findNeighborBlock(pageResult.blocks, startPosition - 1, -1, removalIndexes)
    const nextBlock = findNeighborBlock(pageResult.blocks, endPosition + 1, 1, removalIndexes)
    const token = `__PAPER_FIGURE_GAP_${pageResult.pageIndex}_${groupIndex}__`

    pageMarkdown = replaceRemovalGroupWithToken(
      pageMarkdown,
      pageResult.blocks,
      new Set(group.blockIndexes),
      token
    )

    gapReplacements.push({
      token,
      replacement: getBodyBlockGapReplacement(previousBlock, nextBlock)
    })
  }

  for (const gapReplacement of gapReplacements) {
    pageMarkdown = replaceTokenWithGap(pageMarkdown, gapReplacement.token, gapReplacement.replacement)
  }

  pageMarkdown = normalizeVisibleTextBlocks(pageMarkdown, pageResult.blocks, removalIndexes)
  pageMarkdown = mergeAdjacentTextBlocks(pageMarkdown, pageResult.blocks, removalIndexes)
  const cleanedMarkdown = cleanupReaderMarkdown(pageMarkdown)
  if (!cleanedMarkdown) {
    return {
      pageIndex: pageResult.pageIndex,
      markdown: ''
    }
  }

  return {
    pageIndex: pageResult.pageIndex,
    markdown: cleanedMarkdown,
    leadingBlock: findBoundaryBlock(pageResult.blocks, removalIndexes, 'start'),
    trailingBlock: findBoundaryBlock(pageResult.blocks, removalIndexes, 'end')
  }
}

export function buildReaderMarkdown(
  pageResults: PaperPageOcrResult[],
  figureData: Pick<ExtractedPaperFigureData, 'pageRemovalBlockIndexes' | 'pageRemovalGroups'>
): string {
  let combinedMarkdown = ''
  let previousFragment: ReaderPageFragment | null = null
  let encounteredHardBoundary = false

  for (const pageResult of pageResults) {
    const fragment = buildReaderPageFragment(pageResult, figureData)
    if (!fragment.markdown) {
      encounteredHardBoundary = true
      continue
    }

    if (!previousFragment) {
      combinedMarkdown = `${buildPageComment(fragment.pageIndex)}\n\n${fragment.markdown}`
      previousFragment = fragment
      encounteredHardBoundary = false
      continue
    }

    const boundaryToken = `__PAPER_PAGE_BOUNDARY_${fragment.pageIndex}__`
    const boundaryGap = encounteredHardBoundary
      ? '\n\n'
      : getBodyBlockGapReplacement(previousFragment.trailingBlock, fragment.leadingBlock)

    combinedMarkdown += `${boundaryToken}${buildPageComment(fragment.pageIndex)}${boundaryToken}${fragment.markdown}`
    combinedMarkdown = replaceTokenWithGap(combinedMarkdown, boundaryToken, boundaryGap)

    previousFragment = fragment
    encounteredHardBoundary = false
  }

  return combinedMarkdown
}
