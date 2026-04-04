import { logger } from '@main/services/logger'
import { paperStorageService } from './index'
import { PaperOcrService, type OcrProgressInfo } from './PaperOcrService'
import type { PaperDocument } from '@shared/types/paper'

export class PaperService {
  private ocrService = new PaperOcrService()

  listPapers(): { success: boolean; data?: PaperDocument[]; error?: string } {
    return paperStorageService.listPapers()
  }

  getPaper(paperId: string): { success: boolean; data?: PaperDocument; error?: string } {
    return paperStorageService.readMeta(paperId)
  }

  deletePaper(paperId: string): { success: boolean; error?: string } {
    this.ocrService.offProgress(paperId)
    return paperStorageService.deletePaper(paperId)
  }

  async startOcr(paperId: string): Promise<{ success: boolean; error?: string }> {
    logger.info('启动 OCR 任务', 'main', { paperId })
    return this.ocrService.startOcr(paperId)
  }

  cancelOcr(paperId: string): void {
    this.ocrService.cancelOcr(paperId)
  }

  getOcrProgress(paperId: string): OcrProgressInfo | undefined {
    return this.ocrService.getProgress(paperId)
  }

  async retryPage(
    paperId: string,
    pageIndex: number
  ): Promise<{ success: boolean; error?: string }> {
    logger.info('重试单页 OCR', 'main', { paperId, pageIndex })
    return this.ocrService.retryPage(paperId, pageIndex)
  }

  onOcrProgress(paperId: string, callback: (progress: OcrProgressInfo) => void): void {
    this.ocrService.onProgress(paperId, callback)
  }

  offOcrProgress(paperId: string): void {
    this.ocrService.offProgress(paperId)
  }
}
