/**
 * PPT 模板工具服务
 * 将本地 PPT 模板能力封装为模型可调用的内建工具
 */

import { logger } from '@main/services/logger'
import type { MCPTool, MCPToolCallResult } from '@main/types/mcp'
import { getPptTemplateService } from './PptTemplateService'

interface ToolArgs {
  [key: string]: unknown
}

type AnalysisDetailLevel = 'summary' | 'full'

const TEMPLATE_SELECTION_VISIBLE_COUNT = 6

/**
 * PPT 模板工具服务
 */
export class PresentationToolService {
  /**
   * 获取可用工具定义
   */
  getTools(): MCPTool[] {
    return [
      {
        name: 'presentation__list_templates',
        description:
          '获取当前可用于 PPT 生成的模板列表，只返回已经完成解析的模板。适合在回答前了解用户当前有哪些模板可选。',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        },
        serverName: 'presentation'
      },
      {
        name: 'presentation__request_template_selection',
        description:
          '请求用户从已有 PPT 模板中选择一个模板继续。若当前没有可用模板，会返回提示信息而不会弹出空选项。',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        },
        serverName: 'presentation'
      },
      {
        name: 'presentation__get_template_analysis',
        description:
          '读取指定 PPT 模板的结构分析结果。默认返回适合模型理解的摘要；需要完整分析时可将 detailLevel 设为 full。',
        inputSchema: {
          type: 'object',
          properties: {
            templateId: {
              type: 'string',
              description: 'PPT 模板 ID'
            },
            detailLevel: {
              type: 'string',
              enum: ['summary', 'full'],
              description: '分析详情级别，默认 summary'
            }
          },
          required: ['templateId']
        },
        serverName: 'presentation'
      }
    ]
  }

  /**
   * 执行工具调用
   */
  async callTool(name: string, args: ToolArgs): Promise<MCPToolCallResult> {
    logger.info(`执行 PPT 模板工具: ${name}`, 'main', { args })

    try {
      switch (name) {
        case 'presentation__list_templates':
          return this.listTemplates()
        case 'presentation__request_template_selection':
          return this.requestTemplateSelection()
        case 'presentation__get_template_analysis':
          return this.getTemplateAnalysis(args)
        default:
          return {
            success: false,
            error: `未知工具: ${name}`
          }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`PPT 模板工具执行失败: ${name}`, 'main', { error: errorMessage, args })
      return {
        success: false,
        error: errorMessage
      }
    }
  }

  /**
   * 获取可用模板列表
   */
  private listTemplates(): MCPToolCallResult {
    const templates = getPptTemplateService().getAvailableTemplates()

    if (templates.length === 0) {
      return {
        success: true,
        content: [
          {
            type: 'text',
            text: '当前没有可用的 PPT 模板。请先在设置页上传并完成解析，然后再继续生成 PPT。'
          }
        ]
      }
    }

    const payload = templates.map((template) => ({
      id: template.id,
      name: template.name,
      originalFileName: template.originalFileName,
      slideCount: template.slideCount,
      createdAt: template.createdAt
    }))

    return {
      success: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify(payload, null, 2)
        }
      ]
    }
  }

  /**
   * 请求用户选择模板
   */
  private requestTemplateSelection(): MCPToolCallResult {
    const templates = getPptTemplateService().getAvailableTemplates()

    if (templates.length === 0) {
      return {
        success: true,
        content: [
          {
            type: 'text',
            text: '当前没有可用的 PPT 模板。请先提醒用户到设置页上传模板，再继续生成 PPT。'
          }
        ]
      }
    }

    return {
      success: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            user_interaction_required: true,
            interactionType: 'presentation_template',
            initialVisibleCount: TEMPLATE_SELECTION_VISIBLE_COUNT,
            question: '请选择一个 PPT 模板继续，我会根据你选中的模板结构来规划内容。',
            options: templates.map((template) => ({
              value: template.id,
              label: template.name,
              description: `${template.slideCount} 页 · ${template.originalFileName}`
            }))
          })
        }
      ]
    }
  }

  /**
   * 获取模板分析结果
   */
  private getTemplateAnalysis(args: ToolArgs): MCPToolCallResult {
    const templateId = typeof args.templateId === 'string' ? args.templateId : ''
    const detailLevel = args.detailLevel === 'full' ? 'full' : 'summary'

    if (!templateId.trim()) {
      return {
        success: false,
        error: '缺少必需参数: templateId'
      }
    }

    const template = getPptTemplateService().getAvailableTemplateById(templateId)
    if (!template) {
      return {
        success: false,
        error: '模板不存在或尚未分析完成，请重新选择模板'
      }
    }

    const analysis = getPptTemplateService().getTemplateAnalysisForTool(
      templateId,
      detailLevel as AnalysisDetailLevel
    )

    if (!analysis) {
      return {
        success: false,
        error: '模板分析结果不存在，请重新选择模板'
      }
    }

    return {
      success: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify(analysis, null, 2)
        }
      ]
    }
  }
}

/**
 * PPT 模板工具服务单例
 */
export const presentationToolService = new PresentationToolService()
