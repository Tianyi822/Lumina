export { type OcrProgressInfo } from './PaperOcrService'
export { PaperService } from './PaperService'
export { paperTranslationService } from './PaperTranslationService'
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
