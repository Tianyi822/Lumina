import type { CapabilityUnit } from './CapabilityUnit'

/**
 * 能力注册表
 * 集中管理所有 CapabilityUnit 的注册、查询和标签搜索。
 * 能力单元在这里注册后，可供 CapabilityComposer 和 CapabilityManager 使用。
 */
export class CapabilityRegistry {
  /** 能力 ID -> 能力单元 */
  private units = new Map<string, CapabilityUnit>()

  /** 注册一个能力单元 */
  register(unit: CapabilityUnit): void {
    this.units.set(unit.id, unit)
  }

  /** 根据 ID 获取能力单元 */
  get(id: string): CapabilityUnit | undefined {
    return this.units.get(id)
  }

  /** 获取所有已注册的能力单元 */
  getAll(): CapabilityUnit[] {
    return Array.from(this.units.values())
  }

  /** 按标签搜索能力单元（部分匹配） */
  findByTags(tags: string[]): CapabilityUnit[] {
    return this.getAll().filter((unit) =>
      tags.some((tag) => unit.tags.some((ut) => ut.includes(tag)))
    )
  }
}

/** 全局单例 */
export const capabilityRegistry = new CapabilityRegistry()
