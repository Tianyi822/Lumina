import { registerConfigHandlers } from './handlers/configHandlers'

export { initializeConfig } from './handlers/configHandlers'

/**
 * 注册所有 IPC 处理程序
 */
export function registerAllIpcHandlers(): void {
  // 注册配置相关处理程序
  registerConfigHandlers()

  // 后续可以在这里添加其他模块的 IPC 处理程序
  // registerXxxHandlers()
}
