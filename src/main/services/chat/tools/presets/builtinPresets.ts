import type { ConsumerPreset } from './ConsumerPreset'

export const CHAT_PAPER_PRESET: ConsumerPreset = {
  id: 'chat.paper',
  defaultCapabilities: ['paper'],
  defaultComposition: {
    stages: [
      { capabilityId: 'paper', mode: 'required' },
      { capabilityId: 'knowledge', mode: 'on_demand' }
    ],
    mergeStrategy: 'smart_merge'
  }
}

export const CHAT_DEFAULT_PRESET: ConsumerPreset = {
  id: 'chat.default',
  defaultCapabilities: [],
  defaultComposition: { stages: [], mergeStrategy: 'none' }
}

export const SESSION_TYPE_TO_PRESET: Record<string, string> = {
  paper: 'chat.paper',
  default: 'chat.default',
  knowledge: 'chat.default',
  tool: 'chat.default'
}
