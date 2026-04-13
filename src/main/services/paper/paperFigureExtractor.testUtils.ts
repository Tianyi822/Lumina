import type { PaperLayoutBlock, PaperPageOcrResult } from '../../../shared/types/paper.ts'
import { extractPaperFigureData, type ExtractedPaperFigureData } from './paperFigureExtractor.ts'

export function createTextBlock(
  index: number,
  content: string,
  bbox = { x: 120, y: 100, width: 600, height: 40 },
  pageIndex = 0,
  overrides: Partial<PaperLayoutBlock> = {}
): PaperLayoutBlock {
  const nextBbox = overrides.bbox ?? bbox

  return {
    index,
    pageIndex,
    label: 'text',
    content,
    bbox: nextBbox,
    width: 1224,
    height: 1584,
    ...overrides
  }
}

export function createImageBlock(
  index: number,
  url: string,
  bbox = { x: 120, y: 200, width: 420, height: 280 },
  pageIndex = 0,
  overrides: Partial<PaperLayoutBlock> = {}
): PaperLayoutBlock {
  const nextBbox = overrides.bbox ?? bbox

  return {
    index,
    pageIndex,
    label: 'image',
    content: url,
    bbox: nextBbox,
    width: 1224,
    height: 1584,
    ...overrides
  }
}

export function createTableBlock(
  index: number,
  content: string,
  bbox = { x: 120, y: 200, width: 720, height: 280 },
  pageIndex = 0,
  overrides: Partial<PaperLayoutBlock> = {}
): PaperLayoutBlock {
  const nextBbox = overrides.bbox ?? bbox

  return {
    index,
    pageIndex,
    label: 'table',
    content,
    bbox: nextBbox,
    width: 1224,
    height: 1584,
    ...overrides
  }
}

export function extractFigureData(pageResults: PaperPageOcrResult[]): ExtractedPaperFigureData {
  return extractPaperFigureData(pageResults, {
    resolveImagePath: (_pageResult, block) =>
      block.localAssetPath || block.remoteAssetUrl || block.content
  })
}

export function extractFigures(pageResult: PaperPageOcrResult): ExtractedPaperFigureData {
  return extractFigureData([pageResult])
}
