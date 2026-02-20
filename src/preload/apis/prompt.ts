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
 * 提示词模板章节
 */
export interface ReactPromptSections {
  coreInstructions: string
  reactProcess: string
  errorHandling: string
  toolBestPractices: string
  outputFormat: string
  sandboxManagement?: string
}

/**
 * 提示词模板
 */
export interface PromptTemplate {
  version: string
  sections: ReactPromptSections
  variables: Record<string, string>
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
    ipcRenderer.invoke('prompt:resetConfig'),

  // ============ 模板管理 API ============

  /**
   * 获取当前提示词模板
   */
  getTemplate: (): Promise<{ success: boolean; template?: PromptTemplate; error?: string }> =>
    ipcRenderer.invoke('prompt:getTemplate'),

  /**
   * 更新整个提示词模板
   */
  updateTemplate: (template: PromptTemplate): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('prompt:updateTemplate', template),

  /**
   * 更新单个模板章节
   */
  updateTemplateSection: (
    sectionName: keyof ReactPromptSections,
    content: string
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('prompt:updateTemplateSection', sectionName, content),

  /**
   * 重置模板为默认值
   */
  resetTemplate: (): Promise<{ success: boolean; template?: PromptTemplate; error?: string }> =>
    ipcRenderer.invoke('prompt:resetTemplate'),

  /**
   * 导出模板为 JSON 字符串
   */
  exportTemplate: (): Promise<{ success: boolean; json?: string; error?: string }> =>
    ipcRenderer.invoke('prompt:exportTemplate'),

  /**
   * 从 JSON 字符串导入模板
   */
  importTemplate: (json: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('prompt:importTemplate', json)
}
