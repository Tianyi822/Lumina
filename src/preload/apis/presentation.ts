import { ipcRenderer } from 'electron'
import type {
  BuildPresentationDraftRequest,
  BuildPresentationDraftResult,
  DeletePresentationTemplateRequest,
  DeletePresentationTemplateResult,
  ExportPresentationRequest,
  ExportPresentationResult,
  ImportPresentationTemplateRequest,
  ImportPresentationTemplateResult,
  PresentationConfig,
  PresentationPreviewResult,
  TemplateInfo,
  ValidationResult
} from '@shared/types/presentation'

/**
 * PPT API
 */
export const presentationApi = {
  /**
   * 构建 PPT 草稿配置
   */
  buildDraft: (request: BuildPresentationDraftRequest): Promise<BuildPresentationDraftResult> => {
    return ipcRenderer.invoke('presentation:buildDraft', request)
  },

  /**
   * 从对话内容导出 PPT
   */
  exportFromChat: (request: ExportPresentationRequest): Promise<ExportPresentationResult> => {
    return ipcRenderer.invoke('presentation:exportFromChat', request)
  },

  /**
   * 生成预览图
   */
  preview: (config: PresentationConfig): Promise<PresentationPreviewResult> => {
    return ipcRenderer.invoke('presentation:preview', config)
  },

  /**
   * 获取可用模板
   */
  getTemplates: (): Promise<TemplateInfo[]> => {
    return ipcRenderer.invoke('presentation:getTemplates')
  },

  /**
   * 导入 PPT 模板
   */
  importTemplate: (
    request: ImportPresentationTemplateRequest
  ): Promise<ImportPresentationTemplateResult> => {
    return ipcRenderer.invoke('presentation:importTemplate', request)
  },

  /**
   * 删除 PPT 模板
   */
  deleteTemplate: (
    request: DeletePresentationTemplateRequest
  ): Promise<DeletePresentationTemplateResult> => {
    return ipcRenderer.invoke('presentation:deleteTemplate', request)
  },

  /**
   * 校验配置
   */
  validate: (config: PresentationConfig): Promise<ValidationResult> => {
    return ipcRenderer.invoke('presentation:validate', config)
  }
}
