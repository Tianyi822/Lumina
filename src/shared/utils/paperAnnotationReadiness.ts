import type { PaperReaderDocument } from '@shared/types/paper'

export const PAPER_ANNOTATION_INDEX_LOADING_MESSAGE = '阅读器段落索引加载中，请稍后再试'

export function isPaperAnnotationIndexReady(
  paperId: string,
  readerDocument: Pick<PaperReaderDocument, 'paperId' | 'segments'> | null | undefined
): boolean {
  return Boolean(paperId && readerDocument?.paperId === paperId && readerDocument.segments.length > 0)
}

export function isFallbackPaperSegmentStableId(segmentStableId: string): boolean {
  return /^seg-\d+$/.test(segmentStableId)
}
