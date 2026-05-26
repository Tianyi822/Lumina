export type { RenderingProgress, PaperFigurePreviewRect } from './paper/shared'

// 重新导出所有子 Store（便于渐进迁移）
export { usePaperListStore } from './paper'
export { usePaperTranslationStore } from './paper'
export { usePaperFigureStore } from './paper'
export { usePaperViewStore } from './paper'
export { usePaperAnnotationStore } from './paper'
