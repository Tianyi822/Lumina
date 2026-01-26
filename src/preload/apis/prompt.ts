import { ipcRenderer } from 'electron'
import type { PromptConfig } from '@main/types/config'

/**
 * 提示词配置 API
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
    ipcRenderer.invoke('prompt:updateConfig', config)
}
