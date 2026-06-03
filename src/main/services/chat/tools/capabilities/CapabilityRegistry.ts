import type { CapabilityUnit } from './CapabilityUnit'

export class CapabilityRegistry {
  private units = new Map<string, CapabilityUnit>()

  register(unit: CapabilityUnit): void {
    this.units.set(unit.id, unit)
  }

  get(id: string): CapabilityUnit | undefined {
    return this.units.get(id)
  }

  getAll(): CapabilityUnit[] {
    return Array.from(this.units.values())
  }

  findByTags(tags: string[]): CapabilityUnit[] {
    return this.getAll().filter((unit) =>
      tags.some((tag) => unit.tags.some((ut) => ut.includes(tag)))
    )
  }
}

export const capabilityRegistry = new CapabilityRegistry()
