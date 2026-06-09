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

/** 会话类型到预设 ID 的映射 */
export const SESSION_TYPE_TO_PRESET: Record<string, string> = {
  paper: 'chat.paper',
  default: 'chat.default',
  knowledge: 'chat.default',
  tool: 'chat.default'
}
