import { ipcRenderer } from 'electron'
import type {
  PreviewPptExportRequest,
  PreviewPptExportResult,
  GeneratePptRequest,
  GeneratePptResult,
  PptStylePreset,
  TemplateStyleExtraction
} from '@shared/types/ppt-export'

/**
 * PPT 导出 API
 * 提供预览、生成 PPT 等功能
 */
export const pptExportApi = {
  /**
   * 预览 PPT 导出配置
   * @param request 预览请求参数
   * @returns 预览结果
   */
  preview: (request: PreviewPptExportRequest): Promise<PreviewPptExportResult> => {
    return ipcRenderer.invoke('ppt:preview', request)
  },

  /**
   * 生成 PPT 文件
   * @param request 生成请求参数
   * @returns 生成结果
   */
  generate: (request: GeneratePptRequest): Promise<GeneratePptResult> => {
    return ipcRenderer.invoke('ppt:generate', request)
  },

  /**
   * 获取预设样式列表
   * @returns 预设样式数组
   */
  getStylePresets: (): Promise<PptStylePreset[]> => {
    return ipcRenderer.invoke('ppt:getStylePresets')
  },

  /**
   * 从模板提取样式
   * @param templateId 模板 ID
   * @returns 提取的样式配置
   */
  extractTemplateStyle: (
    templateId: string
  ): Promise<{
    success: boolean
    data?: TemplateStyleExtraction | null
    error?: string
  }> => {
    return ipcRenderer.invoke('ppt:extractTemplateStyle', templateId)
  }
}
