import type { ToolAdapter } from '../UnifiedToolRegistry'
import type { MCPToolCallResult } from '@shared/types/mcp'
import type { ToolResultMetadata } from '../PipelineTypes'

/** 能力单元对外暴露的工具描述 */
export interface ToolDescriptor {
  /** 工具名称 */
  name: string
  /** 工具描述文本 */
  description: string
  /** 相关标签 */
  tags: string[]
}

/**
 * 能力单元接口
 * 一个能力单元代表一类可组合的子系统功能（如论文检索、知识库搜索、实验室执行等），
 * 封装了适配器创建、工具获取和结果增强。
 */
export interface CapabilityUnit {
  /** 能力唯一标识 */
  id: string
  /** 可读名称 */
  displayName: string
  /** 功能描述 */
  description: string
  /** 标签列表（用于搜索和归类） */
  tags: string[]
  /**
   * 根据上下文创建对应的 ToolAdapter 实例
   * @param context 能力所需的上下文数据
   * @returns 适配器实例；条件不满足时返回 null
   */
  createAdapter(context: unknown): ToolAdapter | null
  /**
   * 描述该能力提供的工具列表
   * @param context 上下文数据
   */
  describeTools(context: unknown): ToolDescriptor[]
  /**
   * 可选的自定义结果增强
   * 不实现则使用 ToolResultEnricher 默认策略
   */
  enrichResult?: (
    toolName: string,
    args: Record<string, unknown>,
    result: MCPToolCallResult
  ) => ToolResultMetadata
}
