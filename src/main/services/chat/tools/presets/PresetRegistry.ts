import type { ConsumerPreset } from './ConsumerPreset'

/**
 * 预设注册表
 * 管理能力预设（ConsumerPreset）的注册和查询。
 * 预设用于定义不同会话类型的默认能力和编排策略。
 */
export class PresetRegistry {
  /** 预设 ID -> ConsumerPreset */
  private presets = new Map<string, ConsumerPreset>()

  /** 注册一个预设 */
  register(preset: ConsumerPreset): void {
    this.presets.set(preset.id, preset)
  }

  /** 根据 ID 获取预设 */
  get(id: string): ConsumerPreset | undefined {
    return this.presets.get(id)
  }

  /** 获取所有已注册的预设 */
  getAll(): ConsumerPreset[] {
    return Array.from(this.presets.values())
  }
}

/** 全局单例 */
export const presetRegistry = new PresetRegistry()
