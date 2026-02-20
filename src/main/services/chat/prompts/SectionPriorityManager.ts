/**
 * 章节优先级管理器
 * 负责管理提示词章节的优先级配置和动态调整
 */

import type { ReactPromptSections } from './types'
import { logger } from '../../logger'
import { configManager } from '../../config'

/**
 * 章节优先级级别
 */
export type SectionPriorityLevel = 'essential' | 'high' | 'medium' | 'low'

/**
 * 章节优先级配置
 */
export interface PromptSectionPriority {
  /** 章节名称 */
  section: keyof ReactPromptSections
  /** 优先级级别 */
  priority: SectionPriorityLevel
  /** 该章节最少需要的 tokens (估算) */
  minTokens: number
  /** 是否可压缩 */
  compressible: boolean
  /** 压缩后保留的最小比例 (0-1) */
  minRetentionRatio: number
}

/**
 * 优先级配置集合
 */
export interface SectionPriorityConfig {
  /** 配置版本 */
  version: string
  /** 章节优先级列表 */
  priorities: PromptSectionPriority[]
  /** 最后更新时间 */
  updatedAt: string
}

/**
 * 章节裁剪结果
 */
export interface SectionPruningResult {
  /** 保留的章节 */
  keptSections: Partial<ReactPromptSections>
  /** 被移除的章节 */
  removedSections: (keyof ReactPromptSections)[]
  /** 被压缩的章节 */
  compressedSections: (keyof ReactPromptSections)[]
  /** 使用的 token 数量 */
  usedTokens: number
  /** 目标 token 数量 */
  targetTokens: number
}

/**
 * 默认章节优先级配置
 */
const DEFAULT_PRIORITIES: PromptSectionPriority[] = [
  {
    section: 'coreInstructions',
    priority: 'essential',
    minTokens: 100,
    compressible: false,
    minRetentionRatio: 1.0
  },
  {
    section: 'reactProcess',
    priority: 'essential',
    minTokens: 150,
    compressible: true,
    minRetentionRatio: 0.6
  },
  {
    section: 'toolBestPractices',
    priority: 'high',
    minTokens: 80,
    compressible: true,
    minRetentionRatio: 0.5
  },
  {
    section: 'errorHandling',
    priority: 'medium',
    minTokens: 60,
    compressible: true,
    minRetentionRatio: 0.4
  },
  {
    section: 'outputFormat',
    priority: 'medium',
    minTokens: 50,
    compressible: true,
    minRetentionRatio: 0.5
  },
  {
    section: 'sandboxManagement',
    priority: 'low',
    minTokens: 40,
    compressible: true,
    minRetentionRatio: 0.3
  }
]

/**
 * 优先级数值映射 (用于排序)
 */
const PRIORITY_VALUES: Record<SectionPriorityLevel, number> = {
  essential: 4,
  high: 3,
  medium: 2,
  low: 1
}

/**
 * 章节优先级管理器类
 */
export class SectionPriorityManager {
  private config: SectionPriorityConfig
  private customPriorities: Map<keyof ReactPromptSections, Partial<PromptSectionPriority>> = new Map()

  constructor() {
    this.config = this.loadDefaultConfig()
    this.loadFromConfig()
  }

  /**
   * 加载默认配置
   */
  private loadDefaultConfig(): SectionPriorityConfig {
    return {
      version: '1.0.0',
      priorities: [...DEFAULT_PRIORITIES],
      updatedAt: new Date().toISOString()
    }
  }

  /**
   * 从应用配置加载
   */
  private loadFromConfig(): void {
    try {
      const appConfig = configManager.getConfig()
      if (appConfig?.promptConfig) {
        // 可以从 promptConfig 中加载自定义优先级
        // 目前使用默认配置
      }
    } catch (error) {
      logger.warn('加载章节优先级配置失败', 'main', { error })
    }
  }

  /**
   * 获取所有章节优先级
   */
  getAllPriorities(): PromptSectionPriority[] {
    return this.config.priorities.map(p => ({
      ...p,
      ...this.customPriorities.get(p.section)
    }))
  }

  /**
   * 获取指定章节的优先级
   */
  getPriority(section: keyof ReactPromptSections): PromptSectionPriority | undefined {
    const base = this.config.priorities.find(p => p.section === section)
    if (!base) return undefined

    const custom = this.customPriorities.get(section)
    return { ...base, ...custom }
  }

  /**
   * 更新章节优先级
   */
  updatePriority(
    section: keyof ReactPromptSections,
    updates: Partial<Omit<PromptSectionPriority, 'section'>>
  ): boolean {
    const existing = this.config.priorities.find(p => p.section === section)
    if (!existing) {
      logger.warn('尝试更新不存在的章节优先级', 'main', { section })
      return false
    }

    this.customPriorities.set(section, {
      ...this.customPriorities.get(section),
      ...updates
    })

    this.config.updatedAt = new Date().toISOString()
    logger.info('章节优先级已更新', 'main', { section, updates })
    return true
  }

  /**
   * 重置为默认配置
   */
  resetToDefault(): void {
    this.config = this.loadDefaultConfig()
    this.customPriorities.clear()
    logger.info('章节优先级已重置为默认值', 'main')
  }

  /**
   * 根据 token 预算裁剪章节
   * 核心逻辑：优先保留高优先级章节，低优先级章节可被移除或压缩
   */
  pruneSections(
    sections: ReactPromptSections,
    targetTokens: number
  ): SectionPruningResult {
    const sortedSections = this.getSortedSectionsByPriority(sections)
    const result: SectionPruningResult = {
      keptSections: {},
      removedSections: [],
      compressedSections: [],
      usedTokens: 0,
      targetTokens
    }

    let remainingTokens = targetTokens

    // 第一遍：保留 essential 章节
    for (const { section, content, priority } of sortedSections) {
      if (priority.priority === 'essential') {
        const tokens = this.estimateTokens(content)
        if (tokens <= remainingTokens) {
          result.keptSections[section] = content
          result.usedTokens += tokens
          remainingTokens -= tokens
        } else if (priority.compressible) {
          // 尝试压缩
          const compressed = this.compressSection(content, remainingTokens, priority.minRetentionRatio)
          if (compressed && this.estimateTokens(compressed) <= remainingTokens) {
            result.keptSections[section] = compressed
            result.compressedSections.push(section)
            result.usedTokens += this.estimateTokens(compressed)
            remainingTokens -= this.estimateTokens(compressed)
          } else {
            // 无法保留，记录为移除
            result.removedSections.push(section)
          }
        } else {
          // 不可压缩，按比例截断
          const truncated = this.truncateSection(content, remainingTokens)
          result.keptSections[section] = truncated
          result.compressedSections.push(section)
          result.usedTokens += remainingTokens
          remainingTokens = 0
        }
      }
    }

    // 第二遍：处理高优先级章节
    for (const { section, content, priority } of sortedSections) {
      if (priority.priority === 'high' && remainingTokens > 0) {
        const tokens = this.estimateTokens(content)
        if (tokens <= remainingTokens) {
          result.keptSections[section] = content
          result.usedTokens += tokens
          remainingTokens -= tokens
        } else if (priority.compressible && remainingTokens >= priority.minTokens * priority.minRetentionRatio) {
          const compressed = this.compressSection(content, remainingTokens, priority.minRetentionRatio)
          if (compressed) {
            result.keptSections[section] = compressed
            result.compressedSections.push(section)
            const compressedTokens = this.estimateTokens(compressed)
            result.usedTokens += compressedTokens
            remainingTokens -= compressedTokens
          } else {
            result.removedSections.push(section)
          }
        } else {
          result.removedSections.push(section)
        }
      }
    }

    // 第三遍：处理中优先级章节
    for (const { section, content, priority } of sortedSections) {
      if (priority.priority === 'medium' && remainingTokens > 0) {
        const tokens = this.estimateTokens(content)
        if (tokens <= remainingTokens) {
          result.keptSections[section] = content
          result.usedTokens += tokens
          remainingTokens -= tokens
        } else if (priority.compressible && remainingTokens >= priority.minTokens * priority.minRetentionRatio) {
          const compressed = this.compressSection(content, remainingTokens, priority.minRetentionRatio)
          if (compressed) {
            result.keptSections[section] = compressed
            result.compressedSections.push(section)
            const compressedTokens = this.estimateTokens(compressed)
            result.usedTokens += compressedTokens
            remainingTokens -= compressedTokens
          } else {
            result.removedSections.push(section)
          }
        } else {
          result.removedSections.push(section)
        }
      }
    }

    // 第四遍：处理低优先级章节
    for (const { section, content, priority } of sortedSections) {
      if (priority.priority === 'low' && remainingTokens > 0) {
        const tokens = this.estimateTokens(content)
        if (tokens <= remainingTokens) {
          result.keptSections[section] = content
          result.usedTokens += tokens
          remainingTokens -= tokens
        } else if (priority.compressible && remainingTokens >= priority.minTokens * priority.minRetentionRatio) {
          const compressed = this.compressSection(content, remainingTokens, priority.minRetentionRatio)
          if (compressed) {
            result.keptSections[section] = compressed
            result.compressedSections.push(section)
            const compressedTokens = this.estimateTokens(compressed)
            result.usedTokens += compressedTokens
            remainingTokens -= compressedTokens
          } else {
            result.removedSections.push(section)
          }
        } else {
          result.removedSections.push(section)
        }
      }
    }

    logger.debug('章节裁剪完成', 'main', {
      targetTokens,
      usedTokens: result.usedTokens,
      keptCount: Object.keys(result.keptSections).length,
      removedCount: result.removedSections.length,
      compressedCount: result.compressedSections.length
    })

    return result
  }

  /**
   * 获取按优先级排序的章节列表
   */
  private getSortedSectionsByPriority(
    sections: ReactPromptSections
  ): Array<{
    section: keyof ReactPromptSections
    content: string
    priority: PromptSectionPriority
  }> {
    const result: Array<{
      section: keyof ReactPromptSections
      content: string
      priority: PromptSectionPriority
    }> = []

    for (const [key, content] of Object.entries(sections)) {
      const sectionKey = key as keyof ReactPromptSections
      const priority = this.getPriority(sectionKey)
      if (priority && content) {
        result.push({ section: sectionKey, content, priority })
      }
    }

    // 按优先级降序排序
    result.sort((a, b) => PRIORITY_VALUES[b.priority.priority] - PRIORITY_VALUES[a.priority.priority])

    return result
  }

  /**
   * 压缩章节内容
   */
  private compressSection(content: string, maxTokens: number, minRatio: number): string | null {
    const originalTokens = this.estimateTokens(content)
    const minTokens = Math.floor(originalTokens * minRatio)

    if (maxTokens < minTokens) {
      return null
    }

    // 简单的压缩策略：保留前 maxTokens * 0.8 的字符
    const maxChars = Math.floor(maxTokens * 4)
    if (content.length <= maxChars) {
      return content
    }

    // 尝试在句子边界截断
    const sentences = content.split(/([。！？.!?])/)
    let compressed = ''
    let currentTokens = 0

    for (let i = 0; i < sentences.length; i += 2) {
      const sentence = sentences[i]
      const punctuation = sentences[i + 1] || ''
      const fullSentence = sentence + punctuation
      const sentenceTokens = this.estimateTokens(fullSentence)

      if (currentTokens + sentenceTokens > maxTokens) {
        break
      }

      compressed += fullSentence
      currentTokens += sentenceTokens
    }

    return compressed || content.substring(0, maxChars)
  }

  /**
   * 截断章节内容
   */
  private truncateSection(content: string, maxTokens: number): string {
    const maxChars = Math.floor(maxTokens * 4)
    if (content.length <= maxChars) {
      return content
    }
    return content.substring(0, maxChars) + '...'
  }

  /**
   * 估算 token 数量
   */
  private estimateTokens(text: string): number {
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length
    const otherChars = text.length - chineseChars
    return Math.ceil(chineseChars / 2 + otherChars / 4)
  }

  /**
   * 导出配置
   */
  exportConfig(): SectionPriorityConfig {
    return {
      ...this.config,
      priorities: this.getAllPriorities()
    }
  }

  /**
   * 导入配置
   */
  importConfig(config: SectionPriorityConfig): boolean {
    try {
      // 验证配置
      if (!config.priorities || !Array.isArray(config.priorities)) {
        throw new Error('无效的配置格式')
      }

      // 验证每个章节
      const validSections: (keyof ReactPromptSections)[] = [
        'coreInstructions', 'reactProcess', 'errorHandling',
        'toolBestPractices', 'outputFormat', 'sandboxManagement'
      ]

      for (const p of config.priorities) {
        if (!validSections.includes(p.section)) {
          throw new Error(`无效的章节: ${String(p.section)}`)
        }
      }

      this.config = {
        ...config,
        updatedAt: new Date().toISOString()
      }
      this.customPriorities.clear()

      logger.info('章节优先级配置已导入', 'main')
      return true
    } catch (error) {
      logger.error('导入章节优先级配置失败', 'main', { error })
      return false
    }
  }
}

// 导出单例实例
export const sectionPriorityManager = new SectionPriorityManager()
