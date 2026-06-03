import type { CapabilityComposition } from '../PipelineTypes'

export interface ConsumerPreset {
  id: string
  defaultCapabilities: string[]
  defaultComposition: CapabilityComposition
}
