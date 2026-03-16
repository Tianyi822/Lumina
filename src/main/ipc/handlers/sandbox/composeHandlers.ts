import { ipcMain } from 'electron'
import type {
  ComposeStartResult,
  ComposeStopOptions,
  ComposeStopResult,
  ComposeRestartResult,
  ComposeStatusResult,
  ComposeExecOptions,
  ComposeExecResult,
  ComposeLogOptions,
  ComposeLogResult,
  ComposeDownOptions,
  ComposeDownResult
} from '@shared/types/sandbox'
import { getSandboxServices } from './shared'

/**
 * 注册 Compose 操作处理器
 */
export function registerSandboxComposeHandlers(): void {
  const { dockerService } = getSandboxServices()

  ipcMain.handle(
    'sandbox:compose:start',
    async (_event, projectName: string): Promise<ComposeStartResult> => {
      return dockerService.composeStart(projectName)
    }
  )

  ipcMain.handle(
    'sandbox:compose:stop',
    async (
      _event,
      projectName: string,
      options?: ComposeStopOptions
    ): Promise<ComposeStopResult> => {
      return dockerService.composeStop(projectName, options)
    }
  )

  ipcMain.handle(
    'sandbox:compose:restart',
    async (_event, projectName: string): Promise<ComposeRestartResult> => {
      return dockerService.composeRestart(projectName)
    }
  )

  ipcMain.handle(
    'sandbox:compose:status',
    async (_event, projectName: string): Promise<ComposeStatusResult> => {
      return dockerService.composeStatus(projectName)
    }
  )

  ipcMain.handle(
    'sandbox:compose:exec',
    async (
      _event,
      projectName: string,
      serviceName: string,
      command: string,
      options?: ComposeExecOptions
    ): Promise<ComposeExecResult> => {
      return dockerService.composeExec(projectName, serviceName, command, options)
    }
  )

  ipcMain.handle(
    'sandbox:compose:logs',
    async (_event, projectName: string, options?: ComposeLogOptions): Promise<ComposeLogResult> => {
      return dockerService.composeLogs(projectName, options)
    }
  )

  ipcMain.handle(
    'sandbox:compose:downExtended',
    async (
      _event,
      projectName: string,
      options?: ComposeDownOptions
    ): Promise<ComposeDownResult> => {
      return dockerService.composeDownExtended(projectName, options)
    }
  )
}
