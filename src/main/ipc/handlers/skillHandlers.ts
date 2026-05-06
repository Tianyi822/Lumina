import { dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { skillService } from '@main/services/skill'
import { logger } from '@main/services/logger'
import type { SkillConfig, SkillOperationResult } from '@shared/types/skill'

export function initializeSkill(): void {
  try {
    skillService.initialize()
    logger.info('Skill 服务已初始化', 'main')
  } catch (error) {
    logger.warn('Skill 服务初始化失败', 'main', {
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

export function registerSkillHandlers(): void {
  ipcMain.handle('skill:list', () => {
    return skillService.list()
  })

  ipcMain.handle('skill:getConfig', () => {
    return skillService.getSkillConfig()
  })

  ipcMain.handle(
    'skill:updateConfig',
    (_event: IpcMainInvokeEvent, config: Partial<SkillConfig>) => {
      return skillService.updateSkillConfig(config)
    }
  )

  ipcMain.handle('skill:validatePath', (_event: IpcMainInvokeEvent, directoryPath: string) => {
    return skillService.validatePath(directoryPath)
  })

  ipcMain.handle(
    'skill:addExternalDirectory',
    async (_event: IpcMainInvokeEvent, directoryPath?: string): Promise<SkillOperationResult> => {
      try {
        const selectedPath = directoryPath?.trim() || (await selectSkillDirectory())
        if (!selectedPath) {
          return { success: false, error: '已取消选择' }
        }

        return skillService.addExternalDirectory(selectedPath)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.error('添加 Skill 目录失败', 'main', { error: errorMessage })
        return { success: false, error: errorMessage }
      }
    }
  )

  ipcMain.handle('skill:remove', (_event: IpcMainInvokeEvent, directoryPath: string) => {
    return skillService.remove(directoryPath)
  })

  ipcMain.handle(
    'skill:setEnabled',
    (_event: IpcMainInvokeEvent, directoryPath: string, enabled: boolean) => {
      return skillService.setEnabled(directoryPath, enabled)
    }
  )

  ipcMain.handle('skill:reload', () => {
    return skillService.reload()
  })
}

async function selectSkillDirectory(): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: '选择 Skill 目录'
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  return result.filePaths[0]
}
