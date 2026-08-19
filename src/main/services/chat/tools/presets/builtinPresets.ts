import type { ConsumerPreset } from './ConsumerPreset'

/**
 * 论文聊天预设
 * 默认激活论文检索能力，知识库按需启用，结果使用智能合并
 */
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

/**
 * 默认聊天预设
 * 不默认激活任何能力，不使用管道和合并
 */
export const CHAT_DEFAULT_PRESET: ConsumerPreset = {
  id: 'chat.default',
  defaultCapabilities: [],
  defaultComposition: { stages: [], mergeStrategy: 'none' }
}

/**
 * 写作聊天预设
 * 默认激活写作编辑能力；论文与知识库仅在用户选择后启用；结果不做合并
 */
export const CHAT_WRITER_PRESET: ConsumerPreset = {
  id: 'chat.writer',
  defaultCapabilities: ['writer'],
  defaultComposition: {
    stages: [
      { capabilityId: 'writer', mode: 'on_demand' },
      { capabilityId: 'paper', mode: 'on_demand' },
      { capabilityId: 'knowledge', mode: 'on_demand' }
    ],
    mergeStrategy: 'none'
  }
}

/** 会话类型到预设 ID 的映射 */
export const SESSION_TYPE_TO_PRESET: Record<string, string> = {
  paper: 'chat.paper',
  default: 'chat.default',
  knowledge: 'chat.default',
  tool: 'chat.default',
  writer: 'chat.writer'
}
