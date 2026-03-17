import type { ConfigSaveResult } from './config'
import type { PromptConfig } from '@shared/types/config'
import type {
  CachePerformanceWarningEvent,
  CacheStatsUpdatedEvent,
  EnhancedFewShotExample,
  ExampleFilter,
  ExampleStats,
  ImportResult,
  PromptCacheStats,
  PromptTemplate,
  TestPromptPayload,
  TestPromptResult
} from '@shared/types/prompt'

/**
 * 提示词工程统一 API
 */
export interface PromptEngineeringApi {
  /** 获取提示词配置 */
  getConfig: () => Promise<PromptConfig | undefined>

  /** 更新提示词配置 */
  updateConfig: (config: PromptConfig) => Promise<ConfigSaveResult>

  /** 重置提示词配置 */
  resetConfig: () => Promise<{ success: boolean; config?: PromptConfig; error?: string }>

  /** 获取提示词模板 */
  getTemplate: () => Promise<{
    success: boolean
    template?: PromptTemplate
    error?: string
  }>

  /** 更新提示词模板 */
  updateTemplate: (template: PromptTemplate) => Promise<{
    success: boolean
    error?: string
  }>

  /** 更新提示词模板章节 */
  updateTemplateSection: (
    sectionName: keyof PromptTemplate['sections'],
    content: string
  ) => Promise<{
    success: boolean
    error?: string
  }>

  /** 重置提示词模板 */
  resetTemplate: () => Promise<{
    success: boolean
    template?: PromptTemplate
    error?: string
  }>

  /** 导出提示词模板 */
  exportTemplate: () => Promise<{
    success: boolean
    json?: string
    error?: string
  }>

  /** 导入提示词模板 */
  importTemplate: (json: string) => Promise<{
    success: boolean
    error?: string
  }>

  /** 获取缓存统计 */
  getCacheStats: () => Promise<{
    success: boolean
    stats?: PromptCacheStats
    error?: string
  }>

  /** 获取缓存报告 */
  getCacheReport: () => Promise<{
    success: boolean
    report?: string
    error?: string
  }>

  /** 清空缓存 */
  clearCache: () => Promise<{ success: boolean; error?: string }>

  /** 订阅缓存统计 */
  subscribeCacheStats: () => Promise<{ success: boolean }>

  /** 取消订阅缓存统计 */
  unsubscribeCacheStats: () => Promise<{ success: boolean }>

  /** 监听缓存统计更新 */
  onCacheStatsUpdated: (callback: (stats: CacheStatsUpdatedEvent) => void) => () => void

  /** 监听缓存性能告警 */
  onCachePerformanceWarning: (callback: (data: CachePerformanceWarningEvent) => void) => () => void

  /** 获取示例列表 */
  listExamples: (filter?: ExampleFilter) => Promise<{
    success: boolean
    examples?: EnhancedFewShotExample[]
    error?: string
  }>

  /** 获取单个示例 */
  getExample: (id: string) => Promise<{
    success: boolean
    example?: EnhancedFewShotExample
    error?: string
  }>

  /** 更新示例 */
  updateExample: (example: EnhancedFewShotExample) => Promise<{
    success: boolean
    error?: string
  }>

  /** 删除示例 */
  deleteExamples: (ids: string[]) => Promise<{
    success: boolean
    deleted?: number
    error?: string
  }>

  /** 导入示例 */
  importExamples: (json: string) => Promise<ImportResult>

  /** 导出示例 */
  exportExamples: () => Promise<{
    success: boolean
    json?: string
    error?: string
  }>

  /** 从会话提取示例 */
  extractExamplesFromSessions: () => Promise<{
    success: boolean
    result?: { extracted: number }
    error?: string
  }>

  /** 获取示例统计 */
  getExampleStats: () => Promise<{
    success: boolean
    stats?: ExampleStats
    error?: string
  }>

  /** 清空动态示例 */
  clearDynamicExamples: () => Promise<{
    success: boolean
    deletedCount?: number
    error?: string
  }>

  /** 预览提示词 */
  previewPrompt: (payload: TestPromptPayload) => Promise<{
    success: boolean
    prompt?: string
    error?: string
  }>

  /** 执行提示词测试 */
  testPrompt: (payload: TestPromptPayload) => Promise<TestPromptResult>
}
