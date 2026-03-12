/**
 * PPT 模板服务入口
 * 导出所有模块和初始化函数
 */

// 路径管理
export * from './templatePaths'

// 分析器
export { PptTemplateAnalyzer } from './PptTemplateAnalyzer'

// 服务
export { getPptTemplateService, PptTemplateService } from './PptTemplateService'

/**
 * 初始化 PPT 模板服务
 * 在应用启动时调用
 */
export function initializePptTemplateService(): void {
  const { getPptTemplateService } = require('./PptTemplateService')
  try {
    getPptTemplateService().initialize()
  } catch (error) {
    const errorMessage = `PPT 模板服务初始化失败: ${error instanceof Error ? error.message : String(error)}`
    // 使用 console.error 因为 logger 可能还未初始化
    console.error(errorMessage)
  }
}
