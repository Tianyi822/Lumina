import { capabilityRegistry } from './CapabilityRegistry'
import { PaperCapability } from './PaperCapability'
import { KnowledgeCapability } from './KnowledgeCapability'
import { PaperWebCapability } from './PaperWebCapability'
import { McpCapability } from './McpCapability'
import { WriterCapability } from './WriterCapability'

/** 是否已注册（防止重复注册） */
let registered = false

/**
 * 注册所有内置能力单元
 * 包括论文检索、知识库搜索、论文联网搜索、写作编辑和 MCP 外部工具。
 * 幂等操作，多次调用只生效一次。
 */
export function registerBuiltinCapabilities(): void {
  if (registered) return
  registered = true

  capabilityRegistry.register(new PaperCapability())
  capabilityRegistry.register(new KnowledgeCapability())
  capabilityRegistry.register(new PaperWebCapability())
  capabilityRegistry.register(new WriterCapability())
  capabilityRegistry.register(new McpCapability())
}
