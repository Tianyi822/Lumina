import { getLabServices } from './shared'
import { registerLabDockerHandlers } from './dockerHandlers'
import { registerLabConfigHandlers } from './configHandlers'
import { registerLabContainerHandlers } from './containerHandlers'
import { registerLabSessionHandlers } from './sessionHandlers'
import { registerLabCrudHandlers } from './labCrudHandlers'
import { registerLabCreationHandlers } from './creationHandlers'
import { registerLabComposeHandlers } from './composeHandlers'
import { registerLabFrontendHandlers } from './frontendHandlers'
import { registerSshHandlers } from './sshHandlers'
import { registerLabTerminalHandlers } from './terminalHandlers'

/**
 * 初始化实验室服务
 */
export function initializeLab(): void {
  const { labService, configService, dockerService } = getLabServices()
  labService.initialize()
  configService.initialize()
  dockerService.initialize()
}

/**
 * 注册实验室相关的 IPC 处理程序
 */
export function registerLabHandlers(): void {
  registerLabDockerHandlers()
  registerLabConfigHandlers()
  registerLabContainerHandlers()
  registerLabSessionHandlers()
  registerLabCrudHandlers()
  registerLabCreationHandlers()
  registerLabComposeHandlers()
  registerLabFrontendHandlers()
  registerSshHandlers()
  registerLabTerminalHandlers()
}
