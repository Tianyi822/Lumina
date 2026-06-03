import type { ConsumerPreset } from './ConsumerPreset'

export class PresetRegistry {
  private presets = new Map<string, ConsumerPreset>()

  register(preset: ConsumerPreset): void {
    this.presets.set(preset.id, preset)
  }

  get(id: string): ConsumerPreset | undefined {
    return this.presets.get(id)
  }

  getAll(): ConsumerPreset[] {
    return Array.from(this.presets.values())
  }
}

export const presetRegistry = new PresetRegistry()
