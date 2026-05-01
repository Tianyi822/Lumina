import { ipcRenderer } from 'electron'
import type { SkillConfig, SkillLoadResult, SkillOperationResult } from '@shared/types/skill'

export const skillApi = {
  list: (): Promise<SkillLoadResult[]> => {
    return ipcRenderer.invoke('skill:list')
  },

  getConfig: (): Promise<SkillConfig> => {
    return ipcRenderer.invoke('skill:getConfig')
  },

  updateConfig: (config: Partial<SkillConfig>): Promise<SkillOperationResult> => {
    return ipcRenderer.invoke('skill:updateConfig', config)
  },

  validatePath: (directoryPath: string): Promise<SkillLoadResult> => {
    return ipcRenderer.invoke('skill:validatePath', directoryPath)
  },

  addExternalDirectory: (directoryPath?: string): Promise<SkillOperationResult> => {
    return ipcRenderer.invoke('skill:addExternalDirectory', directoryPath)
  },

  remove: (directoryPath: string): Promise<SkillOperationResult> => {
    return ipcRenderer.invoke('skill:remove', directoryPath)
  },

  setEnabled: (directoryPath: string, enabled: boolean): Promise<SkillOperationResult> => {
    return ipcRenderer.invoke('skill:setEnabled', directoryPath, enabled)
  },

  reload: (): Promise<SkillLoadResult[]> => {
    return ipcRenderer.invoke('skill:reload')
  }
}
