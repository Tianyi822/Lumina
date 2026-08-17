import type {
  PaperAnnotation,
  PaperAnnotationColorKey,
  PaperAnnotationKind,
  PaperAnnotationStore
} from '@shared/types/paper'
import {
  PAPER_ANNOTATION_HIGHLIGHT_COLOR_KEYS,
  PAPER_ANNOTATION_NOTE_COLOR_KEY
} from '@shared/types/paper'
import { t } from '@main/services/i18n'

export interface NormalizedAnnotationContentInput {
  comment: string
  colorKey: PaperAnnotationColorKey
}

/**
 * 创建空的批注存储（V3 格式）
 */
export function createEmptyPaperAnnotationStore(paperId: string): PaperAnnotationStore {
  return {
    version: 3,
    paperId,
    annotations: [],
    updatedAt: new Date().toISOString()
  }
}

function isHighlightColorKey(colorKey: PaperAnnotationColorKey): boolean {
  return PAPER_ANNOTATION_HIGHLIGHT_COLOR_KEYS.includes(
    colorKey as (typeof PAPER_ANNOTATION_HIGHLIGHT_COLOR_KEYS)[number]
  )
}

/**
 * 归一化批注内容：校验颜色键和评论内容的合法性
 * 高亮只能使用蓝/黄/橙色，笔记只能使用绿色且必须填写评论
 */
export function normalizeAnnotationContent(
  kind: PaperAnnotationKind,
  colorKey: PaperAnnotationColorKey,
  comment: string
): { success: true; data: NormalizedAnnotationContentInput } | { success: false; error: string } {
  const trimmedComment = comment.trim()

  if (kind === 'highlight') {
    if (!isHighlightColorKey(colorKey)) {
      return { success: false, error: t('notifications.paper.highlightColorRestricted') }
    }

    return {
      success: true,
      data: {
        comment: '',
        colorKey
      }
    }
  }

  if (colorKey !== PAPER_ANNOTATION_NOTE_COLOR_KEY) {
    return { success: false, error: t('notifications.paper.noteHighlightRequired') }
  }

  if (!trimmedComment) {
    return { success: false, error: t('notifications.paper.noteContentRequired') }
  }

  return {
    success: true,
    data: {
      comment: trimmedComment,
      colorKey
    }
  }
}

function normalizeAnnotationKind(value: unknown): PaperAnnotationKind {
  return value === 'highlight' ? 'highlight' : 'note'
}

function normalizeAnnotationColorKey(value: unknown): PaperAnnotationColorKey {
  if (value === 'blue' || value === 'yellow' || value === 'orange' || value === 'green') {
    return value
  }

  return PAPER_ANNOTATION_NOTE_COLOR_KEY
}

/**
 * 归一化从磁盘读取的单条批注（确保 kind 和 colorKey 的合法性）
 */
function normalizeStoredAnnotation(annotation: PaperAnnotation): PaperAnnotation {
  return {
    ...annotation,
    kind: normalizeAnnotationKind((annotation as PaperAnnotation & { kind?: unknown }).kind),
    colorKey: normalizeAnnotationColorKey(
      (annotation as PaperAnnotation & { colorKey?: unknown }).colorKey
    )
  }
}

/**
 * 归一化整个批注存储（合并默认值、归一化每条批注）
 */
export function normalizeStoredAnnotationStore(
  paperId: string,
  store: PaperAnnotationStore
): PaperAnnotationStore {
  return {
    ...createEmptyPaperAnnotationStore(paperId),
    ...store,
    version: 3,
    paperId,
    annotations: Array.isArray(store.annotations)
      ? store.annotations.map(normalizeStoredAnnotation)
      : []
  }
}
