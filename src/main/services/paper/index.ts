export { PaperStorageService } from './PaperStorageService'
export { PaperGlmOcrClient } from './PaperGlmOcrClient'
export { PaperOcrService, type OcrProgressInfo } from './PaperOcrService'
export { PaperService } from './PaperService'
export { PaperTranslationCore } from './PaperTranslationCore'
export { PaperTranslationService, paperTranslationService } from './PaperTranslationService'
export * from './paperPaths'

import { PaperStorageService } from './PaperStorageService'
import { PaperService } from './PaperService'

export const paperStorageService = new PaperStorageService()

let paperServiceInstance: PaperService | null = null

export function getPaperService(): PaperService {
  if (!paperServiceInstance) {
    paperServiceInstance = new PaperService()
  }
  return paperServiceInstance
}
