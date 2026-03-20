/**
 * PPT 模板服务入口
 * 导出所有模块和初始化函数
 */

import { getPptTemplateService } from './PptTemplateService'

// 路径管理
export * from './templatePaths'

// 分析器
export { PptTemplateAnalyzer } from './analyzers/PptTemplateAnalyzer'

// AI 总结
export { PromptBuilder } from './summarizer/PromptBuilder'
export { SummaryParser } from './summarizer/SummaryParser'
export { SummaryValidator } from './summarizer/SummaryValidator'
export { PptTemplateSummarizer } from './summarizer/PptTemplateSummarizer'

// 服务
export { getPptTemplateService, PptTemplateService } from './PptTemplateService'
export { presentationToolService, PresentationToolService } from './PresentationToolService'

// PPT 导出服务
export { getPptExportService, PptExportService } from './PptExportService'
export { PptContentParser } from './PptContentParser'
export { PptGenerator } from './PptGenerator'
export { PptTemplateStyleExtractor } from './PptTemplateStyleExtractor'

/**
 * 初始化 PPT 模板服务
 * 在应用启动时调用
 */
export function initializePptTemplateService(): void {
  try {
    getPptTemplateService().initialize()
  } catch (error) {
    const errorMessage = `PPT 模板服务初始化失败: ${error instanceof Error ? error.message : String(error)}`
    // 使用 console.error 因为 logger 可能还未初始化
    console.error(errorMessage)
  }
}
