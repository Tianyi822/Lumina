import type { CapabilityUnit, ToolDescriptor } from './CapabilityUnit'
import type { ToolAdapter } from '../UnifiedToolRegistry'
import type { LabDisciplineId } from '@shared/types/config'
import { LabToolAdapter } from '../adapters/LabToolAdapter'
import { getDisciplineToolSet } from '../../../lab/disciplineToolSets'
import { labToolService } from '../../../lab'

/** 实验室能力的上下文数据 */
interface LabCapabilityContext {
  /** 当前会话激活的实验室学科；无则不启用实验室工具 */
  labDiscipline?: LabDisciplineId | null
  /** 当前会话绑定的实验室 ID */
  labId?: string | null
}

/**
 * 实验室工具能力
 * 提供远程命令执行、文件操作、PTY 终端等实验室工具
 * 按 context.labDiscipline 决策是否启用及暴露哪些工具
 */
export class LabCapability implements CapabilityUnit {
  id = 'lab'
  displayName = '实验室工具'
  description = '远程命令执行、文件操作、PTY 终端交互'
  tags = ['命令执行', '文件操作', 'PTY']

  createAdapter(context: unknown): ToolAdapter | null {
    const ctx = context as LabCapabilityContext
    // 无学科：不启用实验室工具
    if (!ctx.labDiscipline) return null
    // 未知学科：不启用
    if (!getDisciplineToolSet(ctx.labDiscipline)) return null

    return new LabToolAdapter({ labDiscipline: ctx.labDiscipline, labId: ctx.labId })
  }

  describeTools(context: unknown): ToolDescriptor[] {
    const ctx = context as LabCapabilityContext
    if (!ctx.labDiscipline) return []
    if (!getDisciplineToolSet(ctx.labDiscipline)) return []

    // getTools 已按 discipline 过滤，直接映射为 ToolDescriptor
    return labToolService.getTools({ discipline: ctx.labDiscipline }).map((tool) => ({
      name: tool.name,
      description: tool.description,
      tags: this.tags
    }))
  }
}
