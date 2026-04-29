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
} from '@shared/types/lab'
import { getLabServices } from './shared'

/**
 * 注册 Compose 操作处理器
 */
export function registerLabComposeHandlers(): void {
  const { dockerService } = getLabServices()

  ipcMain.handle(
    'lab:compose:start',
    async (_event, projectName: string): Promise<ComposeStartResult> => {
      return dockerService.composeStart(projectName)
    }
  )

  ipcMain.handle(
    'lab:compose:stop',
    async (
      _event,
      projectName: string,
      options?: ComposeStopOptions
    ): Promise<ComposeStopResult> => {
      return dockerService.composeStop(projectName, options)
    }
  )

  ipcMain.handle(
    'lab:compose:restart',
    async (_event, projectName: string): Promise<ComposeRestartResult> => {
      return dockerService.composeRestart(projectName)
    }
  )

  ipcMain.handle(
    'lab:compose:status',
    async (_event, projectName: string): Promise<ComposeStatusResult> => {
      return dockerService.composeStatus(projectName)
    }
  )

  ipcMain.handle(
    'lab:compose:exec',
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
    'lab:compose:logs',
    async (_event, projectName: string, options?: ComposeLogOptions): Promise<ComposeLogResult> => {
      return dockerService.composeLogs(projectName, options)
    }
  )

  ipcMain.handle(
    'lab:compose:downExtended',
    async (
      _event,
      projectName: string,
      options?: ComposeDownOptions
    ): Promise<ComposeDownResult> => {
      return dockerService.composeDownExtended(projectName, options)
    }
  )
}
