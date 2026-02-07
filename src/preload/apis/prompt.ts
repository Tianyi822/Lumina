import { ipcRenderer } from 'electron'

/**
 * 工具描述的详细程度
 */
export type ToolDescriptionLevel = 'basic' | 'detailed' | 'minimal'

/**
 * 提示词生成的配置
 */
export interface PromptConfig {
  /** 是否启用增强版提示词 */
  enableEnhancedPrompt?: boolean
  /** 工具描述的详细程度 */
  toolDescriptionLevel?: ToolDescriptionLevel
  /** Few-shot 示例的数量，范围 0 到 5 */
  fewShotCount?: number
  /** 自定义系统提示词，会覆盖默认生成的提示词 */
  customSystemPrompt?: string
}

/**
 * 提示词配置相关的 API
 */
export const promptApi = {
  /**
   * 获取提示词配置
   */
  getConfig: (): Promise<PromptConfig | undefined> => ipcRenderer.invoke('prompt:getConfig'),

  /**
   * 更新提示词配置
   */
  updateConfig: (config: PromptConfig): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('prompt:updateConfig', config),

  /**
   * 重置提示词配置为默认值
   */
  resetConfig: (): Promise<{ success: boolean; config?: PromptConfig; error?: string }> =>
    ipcRenderer.invoke('prompt:resetConfig')
}
