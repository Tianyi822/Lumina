import type { CapabilityUnit, ToolDescriptor } from './CapabilityUnit'
import type { ToolAdapter } from '../UnifiedToolRegistry'
import { LabToolAdapter } from '../adapters/LabToolAdapter'

/**
 * 实验室工具能力
 * 提供远程命令执行、文件操作、SSH 连接管理等实验室工具
 */
export class LabCapability implements CapabilityUnit {
  id = 'lab'
  displayName = '实验室工具'
  description = '远程命令执行、文件操作、SSH 连接管理'
  tags = ['命令执行', '文件操作', 'SSH']

  createAdapter(): ToolAdapter | null {
    return new LabToolAdapter()
  }

  describeTools(): ToolDescriptor[] {
    return [
      {
        name: 'lab__exec_command',
        description: '在远程服务器中执行命令',
        tags: this.tags
      }
    ]
  }
}
