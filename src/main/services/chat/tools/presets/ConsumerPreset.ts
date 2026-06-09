import type { CapabilityComposition } from '../PipelineTypes'

/**
 * 消费者预设
 * 定义一种消费场景的默认能力选择和编排策略
 */
export interface ConsumerPreset {
  /** 预设唯一标识，如 'chat.paper'、'chat.default' */
  id: string
  /** 默认激活的能力 ID 列表 */
  defaultCapabilities: string[]
  /** 默认的能力编排定义 */
  defaultComposition: CapabilityComposition
}
