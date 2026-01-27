import { registerConfigHandlers } from './handlers/configHandlers'
import { registerLoggerHandlers } from './handlers/loggerHandlers'
import { registerChatHandlers } from './handlers/chatHandlers'
import { registerSessionHandlers } from './handlers/sessionHandlers'
import { registerMCPHandlers } from './handlers/mcpHandlers'
import { registerPromptHandlers } from './handlers/prompt.handlers'
import { registerWindowHandlers } from './handlers/windowHandlers'

export { initializeConfig } from './handlers/configHandlers'
export { initializeLogger } from './handlers/loggerHandlers'
export { initializeMCP } from './handlers/mcpHandlers'

/**
 * 注册所有 IPC 处理程序
 */
export function registerAllIpcHandlers(): void {
  // 注册配置相关处理程序
  registerConfigHandlers()

  // 注册日志相关处理程序
  registerLoggerHandlers()

  // 注册聊天相关处理程序
  registerChatHandlers()

  // 注册会话相关处理程序
  registerSessionHandlers()

  // 注册 MCP 相关处理程序
  registerMCPHandlers()

  // 注册提示词配置相关处理程序
  registerPromptHandlers()

  // 注册窗口控制相关处理程序
  registerWindowHandlers()
}
