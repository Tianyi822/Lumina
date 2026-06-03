import type { CapabilityUnit, ToolDescriptor } from './CapabilityUnit'
import type { ToolAdapter } from '../UnifiedToolRegistry'
import { LabToolAdapter } from '../adapters/LabToolAdapter'

export class LabCapability implements CapabilityUnit {
  id = 'lab'
  displayName = '实验室工具'
  description = '代码执行、容器操作、实验复现'
  tags = ['代码执行', '容器', '实验复现', 'SSH']

  createAdapter(): ToolAdapter | null {
    return new LabToolAdapter()
  }

  describeTools(): ToolDescriptor[] {
    return [
      {
        name: 'lab__exec_command',
        description: '在容器中执行命令',
        tags: this.tags
      }
    ]
  }
}
