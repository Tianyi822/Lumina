import { capabilityRegistry } from './CapabilityRegistry'
import { PaperCapability } from './PaperCapability'
import { KnowledgeCapability } from './KnowledgeCapability'
import { LabCapability } from './LabCapability'
import { PaperWebCapability } from './PaperWebCapability'
import { McpCapability } from './McpCapability'

/** 是否已注册（防止重复注册） */
let registered = false

/**
 * 注册所有内置能力单元
 * 包括论文检索、知识库搜索、实验室、论文联网搜索和 MCP 外部工具。
 * 幂等操作，多次调用只生效一次。
 */
export function registerBuiltinCapabilities(): void {
  if (registered) return
  registered = true

  capabilityRegistry.register(new PaperCapability())
  capabilityRegistry.register(new KnowledgeCapability())
  capabilityRegistry.register(new LabCapability())
  capabilityRegistry.register(new PaperWebCapability())
  capabilityRegistry.register(new McpCapability())
}
