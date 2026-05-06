import type { SkillConfig, SkillLoadResult, SkillOperationResult } from '@shared/types/skill'

export type {
  SkillActivation,
  SkillConfig,
  SkillDefinition,
  SkillDirectoryConfig,
  SkillLoadResult,
  SkillManifest,
  SkillSummary,
  SkillOperationResult
} from '@shared/types/skill'

export interface SkillApi {
  list: () => Promise<SkillLoadResult[]>
  getConfig: () => Promise<SkillConfig>
  updateConfig: (config: Partial<SkillConfig>) => Promise<SkillOperationResult>
  validatePath: (directoryPath: string) => Promise<SkillLoadResult>
  addExternalDirectory: (directoryPath?: string) => Promise<SkillOperationResult>
  remove: (directoryPath: string) => Promise<SkillOperationResult>
  setEnabled: (directoryPath: string, enabled: boolean) => Promise<SkillOperationResult>
  reload: () => Promise<SkillLoadResult[]>
}
