import type { MCPTool, MCPToolCallResult } from '@shared/types/mcp'
import type { SkillSummary } from '@shared/types/skill'
import { logger } from '@main/services/logger'
import { skillService, type SkillService } from './SkillService'

interface SkillToolArgs {
  [key: string]: unknown
}

/**
 * 将外部 Skill 包封装为模型可渐进读取的工具。
 */
export class SkillToolService {
  private readonly service: SkillService

  constructor(service: SkillService = skillService) {
    this.service = service
  }

  getTools(): MCPTool[] {
    return [
      {
        name: 'skill__list',
        description:
          '列出用户已启用的 Skill 摘要。用于判断是否存在适合当前任务的工作说明；不会返回完整 SKILL.md 内容。',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description:
                '可选过滤词。可使用任务关键词、技术栈、会话类型或上下文类型缩小候选 Skill。'
            }
          },
          required: []
        },
        serverName: 'skill'
      },
      {
        name: 'skill__read',
        description:
          '读取指定 Skill 的完整 SKILL.md 说明书。仅在 skill__list 摘要显示该 Skill 与当前任务相关时调用。',
        inputSchema: {
          type: 'object',
          properties: {
            skillId: {
              type: 'string',
              description: '要读取的 Skill id，来自 skill__list 返回结果中的 id 字段。'
            }
          },
          required: ['skillId']
        },
        serverName: 'skill'
      }
    ]
  }

  callTool(name: string, args: SkillToolArgs): MCPToolCallResult {
    logger.info(`执行 Skill 工具: ${name}`, 'main', { args })

    switch (name) {
      case 'skill__list':
        return this.listSkills(args)
      case 'skill__read':
        return this.readSkill(args)
      default:
        return {
          success: false,
          error: `未知工具: ${name}`
        }
    }
  }

  private listSkills(args: SkillToolArgs): MCPToolCallResult {
    const query = typeof args.query === 'string' ? args.query : undefined
    const skills = this.service.listAvailableSkills(query)

    if (skills.length === 0) {
      return {
        success: true,
        content: [
          {
            type: 'text',
            text: query ? `没有找到与 "${query}" 相关的可用 Skill。` : '当前没有可用 Skill。'
          }
        ]
      }
    }

    return {
      success: true,
      content: [
        {
          type: 'text',
          text: `可用 Skill 摘要（不含完整说明书）：\n\n${this.formatSummaries(skills)}`
        }
      ]
    }
  }

  private readSkill(args: SkillToolArgs): MCPToolCallResult {
    const skillId = typeof args.skillId === 'string' ? args.skillId : ''
    const result = this.service.readSkillInstructions(skillId)

    if (!result.success || !result.skill || !result.instructions) {
      return {
        success: false,
        error: result.error ?? '读取 Skill 失败'
      }
    }

    return {
      success: true,
      content: [
        {
          type: 'text',
          text: `# Skill: ${result.skill.name}\n\n${this.formatSummary(result.skill)}\n\n## SKILL.md\n\n${result.instructions}`
        }
      ]
    }
  }

  private formatSummaries(skills: SkillSummary[]): string {
    return JSON.stringify(skills, null, 2)
  }

  private formatSummary(skill: SkillSummary): string {
    return JSON.stringify(skill, null, 2)
  }
}

export const skillToolService = new SkillToolService()
