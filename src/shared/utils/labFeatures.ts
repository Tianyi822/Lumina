import type { LabDisciplineId, LabFeaturesConfig } from '@shared/types/config'

export interface LabDisciplinePreset {
  id: LabDisciplineId
  label: string
  description: string
  /** SvgIcon 图标名称 */
  icon: string
}

/** 已实现的学科实验室列表（后续可扩展更多学科） */
export const LAB_DISCIPLINE_PRESETS: LabDisciplinePreset[] = [
  {
    id: 'computer',
    label: '计算机',
    description: 'Docker 容器与 SSH 远程连接，用于代码实验与系统运维。',
    icon: 'lab-computer'
  }
]

export const DEFAULT_LAB_DISCIPLINE_TOGGLES: Record<LabDisciplineId, boolean> = {
  computer: false
}

export function createDefaultLabFeatures(): LabFeaturesConfig {
  return {
    disciplines: { ...DEFAULT_LAB_DISCIPLINE_TOGGLES }
  }
}

/** 归一化实验室配置，兼容旧版 labEnabled 单开关 */
export function normalizeLabFeatures(raw?: Partial<LabFeaturesConfig> | null): LabFeaturesConfig {
  const disciplines = { ...DEFAULT_LAB_DISCIPLINE_TOGGLES, ...raw?.disciplines }

  if (raw?.labEnabled === true && !Object.values(disciplines).some(Boolean)) {
    disciplines.computer = true
  }

  return { disciplines }
}

export function isAnyLabDisciplineEnabled(features?: Partial<LabFeaturesConfig> | null): boolean {
  return Object.values(normalizeLabFeatures(features).disciplines).some(Boolean)
}

export function isLabDisciplineEnabled(
  features: Partial<LabFeaturesConfig> | null | undefined,
  disciplineId: LabDisciplineId
): boolean {
  return normalizeLabFeatures(features).disciplines[disciplineId] ?? false
}
