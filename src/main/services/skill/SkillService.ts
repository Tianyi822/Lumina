import { existsSync, readFileSync, statSync } from 'fs'
import { join, resolve } from 'path'
import { z } from 'zod'
import { configManager } from '@main/services/config'
import { logger } from '@main/services/logger'
import type { Logger } from '@main/services/logger'
import type { AppConfig } from '@main/types/config'
import type {
  SkillConfig,
  SkillDefinition,
  SkillDirectoryConfig,
  SkillLoadResult,
  SkillManifest,
  SkillSummary
} from '@shared/types/skill'
import { DEFAULT_SKILL_CONFIG } from '@shared/types/skill'

const SKILL_MANIFEST_FILE = 'skill.json'
const SKILL_INSTRUCTIONS_FILE = 'SKILL.md'
const SKILL_CONTENT_MAX_LENGTH = 80_000

const sessionTypeSchema = z.enum(['default', 'tool', 'knowledge', 'paper'])

const skillManifestSchema = z
  .object({
    id: z
      .string()
      .trim()
      .min(2, 'id 至少需要 2 个字符')
      .max(64, 'id 不能超过 64 个字符')
      .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, 'id 只能包含字母、数字、点、下划线和连字符'),
    name: z.string().trim().min(1, 'name 不能为空').max(80, 'name 不能超过 80 个字符'),
    description: z
      .string()
      .trim()
      .min(1, 'description 不能为空')
      .max(1000, 'description 不能超过 1000 个字符'),
    version: z.string().trim().min(1, 'version 不能为空').max(40, 'version 不能超过 40 个字符'),
    activation: z
      .object({
        keywords: z.array(z.string().trim().min(1)).optional().default([]),
        sessionTypes: z.array(sessionTypeSchema).optional().default([]),
        contexts: z.array(z.string().trim().min(1)).optional().default([])
      })
      .strict(),
    tags: z.array(z.string().trim().min(1)).optional().default([]),
    language: z.string().trim().optional(),
    frameworks: z.array(z.string().trim().min(1)).optional().default([])
  })
  .strict()

interface SkillServiceOptions {
  getConfig?: () => AppConfig | null
  saveConfig?: (config: AppConfig) => { success: boolean; error?: string }
  logger?: Logger
}

interface SkillInstructionReadResult {
  success: boolean
  skill?: SkillSummary
  instructions?: string
  error?: string
}

function cloneSkillConfig(config: SkillConfig): SkillConfig {
  return {
    directories: config.directories.map((directory) => ({ ...directory }))
  }
}

function normalizeDirectoryPath(directoryPath: string): string {
  return resolve(directoryPath.trim())
}

/**
 * 外部 Skill 包加载服务
 */
export class SkillService {
  private readonly getConfig: () => AppConfig | null
  private readonly saveConfig: (config: AppConfig) => { success: boolean; error?: string }
  private readonly log: Logger
  private loadedResults: SkillLoadResult[] = []
  private configSignature = ''

  constructor(options: SkillServiceOptions = {}) {
    this.getConfig = options.getConfig ?? (() => configManager.getConfig())
    this.saveConfig = options.saveConfig ?? ((config) => configManager.saveConfig(config))
    this.log = options.logger ?? logger
  }

  initialize(): void {
    this.reload()
  }

  list(): SkillLoadResult[] {
    this.syncWithConfig()
    return this.loadedResults.map((result) => ({
      ...result,
      skill: result.skill ? { ...result.skill } : undefined,
      errors: result.errors ? [...result.errors] : undefined
    }))
  }

  getSkillConfig(): SkillConfig {
    const config = this.getConfig()
    return cloneSkillConfig(config?.skills ?? DEFAULT_SKILL_CONFIG)
  }

  updateSkillConfig(partialConfig: Partial<SkillConfig>): { success: boolean; error?: string } {
    const config = this.getConfig()
    if (!config) {
      return { success: false, error: '配置未加载' }
    }

    const nextSkills: SkillConfig = {
      ...(config.skills ?? DEFAULT_SKILL_CONFIG),
      ...partialConfig,
      directories: partialConfig.directories ?? config.skills?.directories ?? []
    }

    const result = this.saveConfig({
      ...config,
      skills: nextSkills
    })

    if (result.success) {
      this.reload()
    }

    return result
  }

  addExternalDirectory(directoryPath: string): {
    success: boolean
    data?: SkillLoadResult
    error?: string
  } {
    const config = this.getConfig()
    if (!config) {
      return { success: false, error: '配置未加载' }
    }

    const normalizedPath = normalizeDirectoryPath(directoryPath)
    const currentSkillConfig = config.skills ?? DEFAULT_SKILL_CONFIG
    if (currentSkillConfig.directories.some((directory) => directory.path === normalizedPath)) {
      return { success: false, error: '该 Skill 目录已添加' }
    }

    const validation = this.validatePath(normalizedPath, true)
    if (!validation.success || !validation.skill) {
      return {
        success: false,
        data: validation,
        error: validation.error ?? validation.errors?.[0]
      }
    }

    const duplicate = this.list().find(
      (result) =>
        result.success &&
        result.skill?.id === validation.skill?.id &&
        result.directoryPath !== normalizedPath
    )
    if (duplicate?.skill) {
      return {
        success: false,
        data: validation,
        error: `Skill id 与已添加目录重复: ${duplicate.skill.id}`
      }
    }

    const directoryConfig: SkillDirectoryConfig = {
      path: normalizedPath,
      enabled: true,
      addedAt: new Date().toISOString()
    }

    const result = this.saveConfig({
      ...config,
      skills: {
        ...currentSkillConfig,
        directories: [...currentSkillConfig.directories, directoryConfig]
      }
    })

    if (!result.success) {
      return result
    }

    this.reload()
    return { success: true, data: validation }
  }

  remove(directoryPath: string): { success: boolean; error?: string } {
    const config = this.getConfig()
    if (!config) {
      return { success: false, error: '配置未加载' }
    }

    const normalizedPath = normalizeDirectoryPath(directoryPath)
    const currentSkillConfig = config.skills ?? DEFAULT_SKILL_CONFIG
    const directories = currentSkillConfig.directories.filter(
      (directory) => directory.path !== normalizedPath
    )

    const result = this.saveConfig({
      ...config,
      skills: {
        ...currentSkillConfig,
        directories
      }
    })

    if (result.success) {
      this.reload()
    }

    return result
  }

  setEnabled(directoryPath: string, enabled: boolean): { success: boolean; error?: string } {
    const config = this.getConfig()
    if (!config) {
      return { success: false, error: '配置未加载' }
    }

    const normalizedPath = normalizeDirectoryPath(directoryPath)
    const currentSkillConfig = config.skills ?? DEFAULT_SKILL_CONFIG
    const directories = currentSkillConfig.directories.map((directory) =>
      directory.path === normalizedPath ? { ...directory, enabled } : directory
    )

    const result = this.saveConfig({
      ...config,
      skills: {
        ...currentSkillConfig,
        directories
      }
    })

    if (result.success) {
      this.reload()
    }

    return result
  }

  reload(): SkillLoadResult[] {
    const config = this.getConfig()
    const directories = config?.skills?.directories ?? []
    const results = directories.map((directory) =>
      this.validatePath(directory.path, directory.enabled)
    )
    const idCounts = new Map<string, number>()

    for (const result of results) {
      if (result.success && result.skill) {
        idCounts.set(result.skill.id, (idCounts.get(result.skill.id) ?? 0) + 1)
      }
    }

    this.loadedResults = results.map((result) => {
      if (!result.success || !result.skill) {
        return result
      }

      const count = idCounts.get(result.skill.id) ?? 0
      if (count <= 1) {
        return result
      }

      const error = `Skill id 重复: ${result.skill.id}`
      return {
        directoryPath: result.directoryPath,
        enabled: result.enabled,
        success: false,
        errors: [error],
        error
      }
    })
    this.configSignature = this.buildConfigSignature()

    this.log.info('Skill 目录加载完成', 'main', {
      total: this.loadedResults.length,
      valid: this.loadedResults.filter((result) => result.success).length
    })

    return this.list()
  }

  validatePath(directoryPath: string, enabled = true): SkillLoadResult {
    const normalizedPath = normalizeDirectoryPath(directoryPath)
    const errors: string[] = []

    if (!existsSync(normalizedPath)) {
      return this.createFailure(normalizedPath, enabled, '目录不存在')
    }

    try {
      if (!statSync(normalizedPath).isDirectory()) {
        return this.createFailure(normalizedPath, enabled, '路径不是目录')
      }
    } catch (error) {
      return this.createFailure(
        normalizedPath,
        enabled,
        `无法读取目录: ${error instanceof Error ? error.message : String(error)}`
      )
    }

    const manifestPath = join(normalizedPath, SKILL_MANIFEST_FILE)
    const instructionsPath = join(normalizedPath, SKILL_INSTRUCTIONS_FILE)

    if (!existsSync(manifestPath)) {
      errors.push(`缺少 ${SKILL_MANIFEST_FILE}`)
    }
    if (!existsSync(instructionsPath)) {
      errors.push(`缺少 ${SKILL_INSTRUCTIONS_FILE}`)
    }
    if (errors.length > 0) {
      return this.createFailure(normalizedPath, enabled, errors)
    }

    const manifestResult = this.readManifest(manifestPath)
    if (!manifestResult.success) {
      return this.createFailure(normalizedPath, enabled, manifestResult.errors)
    }

    const instructions = readFileSync(instructionsPath, 'utf-8').trim()
    if (!instructions) {
      return this.createFailure(normalizedPath, enabled, `${SKILL_INSTRUCTIONS_FILE} 不能为空`)
    }

    const skill: SkillDefinition = {
      ...manifestResult.manifest,
      directoryPath: normalizedPath,
      instructions: instructions.slice(0, SKILL_CONTENT_MAX_LENGTH),
      enabled,
      loadedAt: new Date().toISOString()
    }

    return {
      directoryPath: normalizedPath,
      enabled,
      success: true,
      skill
    }
  }

  listAvailableSkills(query?: string): SkillSummary[] {
    this.syncWithConfig()

    const normalizedQuery = query?.trim().toLowerCase()
    const summaries = this.loadedResults
      .map((result) => result.skill)
      .filter((skill): skill is SkillDefinition => Boolean(skill?.enabled))
      .map((skill) => this.toSummary(skill))

    if (!normalizedQuery) {
      return summaries
    }

    return summaries.filter((summary) => this.matchesSummaryQuery(summary, normalizedQuery))
  }

  readSkillInstructions(skillId: string): SkillInstructionReadResult {
    this.syncWithConfig()

    const normalizedSkillId = skillId.trim()
    if (!normalizedSkillId) {
      return { success: false, error: '缺少必需参数: skillId' }
    }

    const skill = this.loadedResults
      .map((result) => result.skill)
      .find((candidate) => candidate?.enabled && candidate.id === normalizedSkillId)

    if (!skill) {
      return { success: false, error: `未找到可用 Skill: ${normalizedSkillId}` }
    }

    return {
      success: true,
      skill: this.toSummary(skill),
      instructions: skill.instructions
    }
  }

  hasAvailableSkills(): boolean {
    return this.listAvailableSkills().length > 0
  }

  private toSummary(skill: SkillDefinition): SkillSummary {
    return {
      id: skill.id,
      name: skill.name,
      description: skill.description,
      version: skill.version,
      activation: {
        keywords: [...(skill.activation.keywords ?? [])],
        sessionTypes: [...(skill.activation.sessionTypes ?? [])],
        contexts: [...(skill.activation.contexts ?? [])]
      },
      tags: skill.tags ? [...skill.tags] : undefined,
      language: skill.language,
      frameworks: skill.frameworks ? [...skill.frameworks] : undefined
    }
  }

  private matchesSummaryQuery(summary: SkillSummary, query: string): boolean {
    const haystack = [
      summary.id,
      summary.name,
      summary.description,
      summary.version,
      summary.language ?? '',
      ...(summary.tags ?? []),
      ...(summary.frameworks ?? []),
      ...(summary.activation.keywords ?? []),
      ...(summary.activation.contexts ?? []),
      ...(summary.activation.sessionTypes ?? [])
    ]
      .join('\n')
      .toLowerCase()

    return haystack.includes(query)
  }

  private readManifest(
    manifestPath: string
  ): { success: true; manifest: SkillManifest } | { success: false; errors: string[] } {
    try {
      const rawManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
      const parsed = skillManifestSchema.safeParse(rawManifest)
      if (!parsed.success) {
        return {
          success: false,
          errors: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        }
      }

      return {
        success: true,
        manifest: parsed.data
      }
    } catch (error) {
      return {
        success: false,
        errors: [
          `读取 ${SKILL_MANIFEST_FILE} 失败: ${error instanceof Error ? error.message : String(error)}`
        ]
      }
    }
  }

  private syncWithConfig(): void {
    const signature = this.buildConfigSignature()
    if (signature !== this.configSignature) {
      this.reload()
    }
  }

  private buildConfigSignature(): string {
    const config = this.getConfig()
    return JSON.stringify(config?.skills ?? DEFAULT_SKILL_CONFIG)
  }

  private createFailure(
    directoryPath: string,
    enabled: boolean,
    errorOrErrors: string | string[] | undefined
  ): SkillLoadResult {
    const errors = Array.isArray(errorOrErrors)
      ? errorOrErrors
      : errorOrErrors
        ? [errorOrErrors]
        : ['未知错误']
    return {
      directoryPath,
      enabled,
      success: false,
      errors,
      error: errors[0]
    }
  }
}

export const skillService = new SkillService()
