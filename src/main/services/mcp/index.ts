import { MCPConfigManager } from './MCPConfigManager'
import { MCPService } from './MCPService'

// 创建单例实例
export const mcpConfigManager = new MCPConfigManager()
export const mcpService = new MCPService()

export { MCPConfigManager } from './MCPConfigManager'
export { MCPService } from './MCPService'
