import type { SessionType } from './session'

export const DEFAULT_SKILL_MATCH_LIMIT = 3

export const DEFAULT_SKILL_CONFIG: SkillConfig = {
  directories: [],
  autoMatchEnabled: true,
  maxAutoMatchedSkills: DEFAULT_SKILL_MATCH_LIMIT
}

/**
 * Skill 自动启用规则
 */
export interface SkillActivation {
  /** 触发关键词，大小写不敏感 */
  keywords?: string[]
  /** 适用会话类型 */
  sessionTypes?: SessionType[]
  /** 适用上下文，例如 paper、knowledge、lab、tool */
  contexts?: string[]
}

/**
 * 外部 Skill 包的 manifest
 */
export interface SkillManifest {
  id: string
  name: string
  description: string
  version: string
  activation: SkillActivation
  tags?: string[]
  language?: string
  frameworks?: string[]
}

/**
 * 用户配置中的外部 Skill 目录
 */
export interface SkillDirectoryConfig {
  path: string
  enabled: boolean
  addedAt: string
}

/**
 * Skill 全局配置
 */
export interface SkillConfig {
  directories: SkillDirectoryConfig[]
  autoMatchEnabled: boolean
  maxAutoMatchedSkills: number
}

/**
 * 已加载的 Skill 定义
 */
export interface SkillDefinition extends SkillManifest {
  directoryPath: string
  instructions: string
  enabled: boolean
  loadedAt: string
}

/**
 * 单个 Skill 目录的加载结果
 */
export interface SkillLoadResult {
  directoryPath: string
  enabled: boolean
  success: boolean
  skill?: SkillDefinition
  errors?: string[]
  error?: string
}

/**
 * Skill 匹配结果，用于注入系统提示词
 */
export interface SkillMatchResult {
  skillId: string
  name: string
  directoryPath: string
  score: number
  reasons: string[]
  instructions: string
}

/**
 * Skill 配置变更或校验结果
 */
export interface SkillOperationResult {
  success: boolean
  data?: SkillLoadResult | SkillLoadResult[] | SkillConfig
  error?: string
}
