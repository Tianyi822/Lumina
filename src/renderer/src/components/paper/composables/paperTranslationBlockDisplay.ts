import type { PaperTranslationStatus } from '@shared/types/paper'
import type { SegmentHtmlStatus } from '../hooks/usePaperMarkdownEngine'

/** 译文区块展示态：区分 API 翻译中与 HTML 懒渲染加载中 */
export type TranslationBlockDisplay = 'content' | 'failed' | 'translating' | 'rendering'

export function getTranslationBlockDisplay(segment: {
  htmlStatus?: SegmentHtmlStatus
  originalHtml: string
  translationHtml: string | null
  translationStatus: PaperTranslationStatus | 'idle'
}): TranslationBlockDisplay {
  const htmlStatus = segment.htmlStatus ?? (segment.originalHtml ? 'ready' : 'pending')
  const isReady = htmlStatus === 'ready'

  if (isReady && segment.translationHtml) {
    return 'content'
  }
  if (segment.translationStatus === 'failed') {
    return 'failed'
  }
  if (segment.translationStatus === 'translating' || segment.translationStatus === 'queued') {
    return 'translating'
  }
  // 译文已在缓存中（completed），仅等待段落 HTML 懒渲染
  return 'rendering'
}
