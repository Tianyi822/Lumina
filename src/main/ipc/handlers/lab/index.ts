import { getLabServices } from './shared'
import { registerLabCrudHandlers } from './labCrudHandlers'
import { registerSshHandlers } from './sshHandlers'

/**
 * 初始化实验室服务
 */
export async function initializeLab(): Promise<void> {
  const { labService } = getLabServices()
  await labService.initialize()
}

/**
 * 注册实验室相关的 IPC 处理程序
 */
export function registerLabHandlers(): void {
  registerLabCrudHandlers()
  registerSshHandlers()
}
