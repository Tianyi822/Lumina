import { capabilityRegistry } from './CapabilityRegistry'
import { PaperCapability } from './PaperCapability'
import { KnowledgeCapability } from './KnowledgeCapability'
import { LabCapability } from './LabCapability'
import { PaperWebCapability } from './PaperWebCapability'
import { McpCapability } from './McpCapability'

let registered = false

export function registerBuiltinCapabilities(): void {
  if (registered) return
  registered = true

  capabilityRegistry.register(new PaperCapability())
  capabilityRegistry.register(new KnowledgeCapability())
  capabilityRegistry.register(new LabCapability())
  capabilityRegistry.register(new PaperWebCapability())
  capabilityRegistry.register(new McpCapability())
}
