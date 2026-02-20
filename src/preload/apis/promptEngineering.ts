import { ipcRenderer } from 'electron'
import type {
  PromptVersion,
  PromptVersionDiff,
  PromptEffectivenessMetrics,
  MetricsTrendPoint,
  FewShotExample,
  UserFeedback,
  ABTestConfig,
  ABTestResult,
  PromptTemplate,
  PromptCacheStats
} from '@shared/types/prompt'

/**
 * 提示词版本管理 API
 */
export const promptVersionApi = {
  /**
   * 获取所有版本列表
   */
  getVersions: (): Promise<PromptVersion[]> => ipcRenderer.invoke('prompt:versions:getAll'),

  /**
   * 获取指定版本详情
   */
  getVersion: (versionId: string): Promise<PromptVersion | null> =>
    ipcRenderer.invoke('prompt:versions:get', versionId),

  /**
   * 创建新版本
   */
  createVersion: (params: {
    version: string
    tag?: string
    summary: string
    content: string
  }): Promise<{ success: boolean; version?: PromptVersion; error?: string }> =>
    ipcRenderer.invoke('prompt:versions:create', params),

  /**
   * 对比两个版本
   */
  compareVersions: (versionA: string, versionB: string): Promise<PromptVersionDiff> =>
    ipcRenderer.invoke('prompt:versions:compare', versionA, versionB),

  /**
   * 回滚到指定版本
   */
  rollbackToVersion: (versionId: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('prompt:versions:rollback', versionId),

  /**
   * 设置版本标签
   */
  setVersionTag: (versionId: string, tag: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('prompt:versions:setTag', versionId, tag),

  /**
   * 删除版本
   */
  deleteVersion: (versionId: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('prompt:versions:delete', versionId)
}

/**
 * 提示词效果监控 API
 */
export const promptMetricsApi = {
  /**
   * 获取当前版本的指标
   */
  getCurrentMetrics: (): Promise<PromptEffectivenessMetrics> =>
    ipcRenderer.invoke('prompt:metrics:getCurrent'),

  /**
   * 获取指定版本的指标
   */
  getMetricsByVersion: (version: string): Promise<PromptEffectivenessMetrics> =>
    ipcRenderer.invoke('prompt:metrics:getByVersion', version),

  /**
   * 获取指标趋势数据
   */
  getMetricsTrend: (params: {
    version?: string
    startTime: string
    endTime: string
    interval: 'hour' | 'day' | 'week'
  }): Promise<MetricsTrendPoint[]> => ipcRenderer.invoke('prompt:metrics:getTrend', params),

  /**
   * 导出报表
   */
  exportReport: (params: {
    format: 'json' | 'csv'
    startTime: string
    endTime: string
    versions?: string[]
  }): Promise<{ success: boolean; data?: string; error?: string }> =>
    ipcRenderer.invoke('prompt:metrics:export', params)
}

/**
 * Few-shot 示例管理 API
 */
export const exampleApi = {
  /**
   * 获取所有示例
   */
  getExamples: (): Promise<FewShotExample[]> => ipcRenderer.invoke('prompt:examples:getAll'),

  /**
   * 获取示例详情
   */
  getExample: (exampleId: string): Promise<FewShotExample | null> =>
    ipcRenderer.invoke('prompt:examples:get', exampleId),

  /**
   * 创建示例
   */
  createExample: (
    params: Omit<FewShotExample, 'id' | 'createdAt'>
  ): Promise<{
    success: boolean
    example?: FewShotExample
    error?: string
  }> => ipcRenderer.invoke('prompt:examples:create', params),

  /**
   * 更新示例
   */
  updateExample: (
    exampleId: string,
    params: Partial<FewShotExample>
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('prompt:examples:update', exampleId, params),

  /**
   * 删除示例
   */
  deleteExample: (exampleId: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('prompt:examples:delete', exampleId),

  /**
   * 启用/禁用示例
   */
  toggleExample: (
    exampleId: string,
    enabled: boolean
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('prompt:examples:toggle', exampleId, enabled),

  /**
   * 导入示例
   */
  importExamples: (data: string): Promise<{ success: boolean; count?: number; error?: string }> =>
    ipcRenderer.invoke('prompt:examples:import', data),

  /**
   * 导出示例
   */
  exportExamples: (): Promise<{ success: boolean; data?: string; error?: string }> =>
    ipcRenderer.invoke('prompt:examples:export')
}

/**
 * 用户反馈 API
 */
export const feedbackApi = {
  /**
   * 提交反馈
   */
  submitFeedback: (
    params: Omit<UserFeedback, 'id' | 'createdAt'>
  ): Promise<{
    success: boolean
    feedback?: UserFeedback
    error?: string
  }> => ipcRenderer.invoke('prompt:feedback:submit', params),

  /**
   * 获取反馈列表
   */
  getFeedbacks: (params?: {
    messageId?: string
    sessionId?: string
    promptVersion?: string
    type?: 'thumbs_up' | 'thumbs_down'
  }): Promise<UserFeedback[]> => ipcRenderer.invoke('prompt:feedback:getAll', params),

  /**
   * 获取反馈统计
   */
  getFeedbackStats: (
    promptVersion?: string
  ): Promise<{
    total: number
    thumbsUp: number
    thumbsDown: number
    satisfactionRate: number
  }> => ipcRenderer.invoke('prompt:feedback:getStats', promptVersion)
}

/**
 * A/B 测试 API
 */
export const abTestApi = {
  /**
   * 获取所有测试
   */
  getTests: (): Promise<ABTestConfig[]> => ipcRenderer.invoke('prompt:abtest:getAll'),

  /**
   * 获取测试详情
   */
  getTest: (testId: string): Promise<ABTestConfig | null> =>
    ipcRenderer.invoke('prompt:abtest:get', testId),

  /**
   * 创建测试
   */
  createTest: (
    params: Omit<ABTestConfig, 'id' | 'createdAt'>
  ): Promise<{
    success: boolean
    test?: ABTestConfig
    error?: string
  }> => ipcRenderer.invoke('prompt:abtest:create', params),

  /**
   * 更新测试
   */
  updateTest: (
    testId: string,
    params: Partial<ABTestConfig>
  ): Promise<{
    success: boolean
    error?: string
  }> => ipcRenderer.invoke('prompt:abtest:update', testId, params),

  /**
   * 删除测试
   */
  deleteTest: (testId: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('prompt:abtest:delete', testId),

  /**
   * 开始测试
   */
  startTest: (testId: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('prompt:abtest:start', testId),

  /**
   * 暂停测试
   */
  pauseTest: (testId: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('prompt:abtest:pause', testId),

  /**
   * 结束测试
   */
  completeTest: (
    testId: string
  ): Promise<{ success: boolean; result?: ABTestResult; error?: string }> =>
    ipcRenderer.invoke('prompt:abtest:complete', testId),

  /**
   * 获取测试结果
   */
  getTestResult: (testId: string): Promise<ABTestResult | null> =>
    ipcRenderer.invoke('prompt:abtest:getResult', testId)
}

/**
 * 提示词模板 API
 */
export const promptTemplateApi = {
  /**
   * 获取当前模板
   */
  getTemplate: (): Promise<PromptTemplate> => ipcRenderer.invoke('prompt:template:get'),

  /**
   * 更新模板
   */
  updateTemplate: (
    template: Partial<PromptTemplate>
  ): Promise<{
    success: boolean
    error?: string
  }> => ipcRenderer.invoke('prompt:template:update', template),

  /**
   * 重置为默认模板
   */
  resetTemplate: (): Promise<{ success: boolean; template?: PromptTemplate; error?: string }> =>
    ipcRenderer.invoke('prompt:template:reset')
}

/**
 * 缓存统计 API
 */
export const cacheStatsApi = {
  /**
   * 获取缓存统计
   */
  getStats: (): Promise<PromptCacheStats> => ipcRenderer.invoke('prompt:cache:getStats'),

  /**
   * 清空缓存
   */
  clearCache: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('prompt:cache:clear')
}
