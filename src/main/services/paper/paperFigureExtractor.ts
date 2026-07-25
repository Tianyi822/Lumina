import type { PaperLayoutBlock, PaperPageOcrResult } from '../../../shared/types/paper'
import type {
  ExtractPaperFigureDataOptions,
  ExtractedPaperFigureData,
  PendingFigureImage,
  PaperFigureRemovalGroup
} from './paperFigureExtractorTypes.ts'
import {
  buildGroupId,
  buildSubCaption,
  getFigureCaptionText,
  isFigureCaptionBlock,
  isFigureSupportBlock,
  shouldIgnoreCaptionlessFigureGroup
} from './paperBlockClassifiers.ts'

export { buildReaderDocument, buildReaderMarkdown } from './paperMarkdownBuilder.ts'
export type { ExtractedPaperFigureData } from './paperFigureExtractorTypes.ts'

/**
 * 从 OCR 结果中提取图表数据
 * 遍历每页的布局块，识别图片块及其配套说明块（标题、子标题），
 * 生成图表示例列表和需要从正文中移除的块索引集
 */
export function extractPaperFigureData(
  pageResults: PaperPageOcrResult[],
  options: ExtractPaperFigureDataOptions
): ExtractedPaperFigureData {
  const figures: ExtractedPaperFigureData['figures'] = []
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
        Array.from(removalSet).sort((left, right) => left - right)
      ])
    ),
    pageRemovalGroups: Object.fromEntries(
      Array.from(pageRemovalGroups.entries()).map(([pageIndex, removalGroupsForPage]) => [
        pageIndex,
        removalGroupsForPage
      ])
    )
  }
}
