import { getSandboxServices } from './shared'
import { registerSandboxDockerHandlers } from './dockerHandlers'
import { registerSandboxConfigHandlers } from './configHandlers'
import { registerSandboxContainerHandlers } from './containerHandlers'
import { registerSandboxSessionHandlers } from './sessionHandlers'
import { registerSandboxCrudHandlers } from './sandboxCrudHandlers'
import { registerSandboxCreationHandlers } from './creationHandlers'
import { registerSandboxComposeHandlers } from './composeHandlers'

/**
 * 初始化沙箱服务
 */
export function initializeSandbox(): void {
  const { sandboxService, configService, dockerService } = getSandboxServices()
  sandboxService.initialize()
  configService.initialize()
  dockerService.initialize()
}

/**
 * 注册沙箱相关的 IPC 处理程序
 */
export function registerSandboxHandlers(): void {
  registerSandboxDockerHandlers()
  registerSandboxConfigHandlers()
  registerSandboxContainerHandlers()
  registerSandboxSessionHandlers()
  registerSandboxCrudHandlers()
  registerSandboxCreationHandlers()
  registerSandboxComposeHandlers()
}
