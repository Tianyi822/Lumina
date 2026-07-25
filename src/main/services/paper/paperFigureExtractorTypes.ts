import type {
  PaperFigureItem,
  PaperLayoutBlock,
  PaperPageOcrResult
} from '../../../shared/types/paper'

export interface PendingFigureImage {
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

export interface ExtractPaperFigureDataOptions {
  resolveImagePath: (pageResult: PaperPageOcrResult, block: PaperLayoutBlock) => string | undefined
}

export interface ReaderPageFragment {
  pageIndex: number
  markdown: string
  leadingBlock?: PaperLayoutBlock
  trailingBlock?: PaperLayoutBlock
  leadingContinuationBlock?: PaperLayoutBlock
  leadingContinuationMarkdown?: string
  leadingFloatingTableMarkdown?: string
  markdownAfterLeadingContinuation?: string
}

export interface BlockOccurrence {
  block: PaperLayoutBlock
  start: number
  end: number
  content: string
}

export interface TextRunReplacement {
  start: number
  end: number
  replacement: string
}
