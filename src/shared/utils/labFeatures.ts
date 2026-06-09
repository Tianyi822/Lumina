import type { LabDisciplineId, LabFeaturesConfig } from '@shared/types/config'

/** 学科实验室预设信息 */
export interface LabDisciplinePreset {
  /** 学科标识 */
  id: LabDisciplineId
  /** 显示名称 */
  label: string
  /** 功能描述文本 */
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

/** 创建默认的实验室功能配置（全部关闭） */
export function createDefaultLabFeatures(): LabFeaturesConfig {
  return {
    disciplines: { ...DEFAULT_LAB_DISCIPLINE_TOGGLES }
  }
}

/**
 * 归一化实验室配置，兼容旧版 labEnabled 单开关
 * 如果旧版 labEnabled 为 true 且所有学科开关均为 false，则自动启用计算机学科
 */
export function normalizeLabFeatures(raw?: Partial<LabFeaturesConfig> | null): LabFeaturesConfig {
  const disciplines = { ...DEFAULT_LAB_DISCIPLINE_TOGGLES, ...raw?.disciplines }

  if (raw?.labEnabled === true && !Object.values(disciplines).some(Boolean)) {
    disciplines.computer = true
  }

  return { disciplines }
}

/** 判断是否有任一学科实验室已启用 */
export function isAnyLabDisciplineEnabled(features?: Partial<LabFeaturesConfig> | null): boolean {
  return Object.values(normalizeLabFeatures(features).disciplines).some(Boolean)
}

/** 判断指定学科实验室是否已启用 */
export function isLabDisciplineEnabled(
  features: Partial<LabFeaturesConfig> | null | undefined,
  disciplineId: LabDisciplineId
): boolean {
  return normalizeLabFeatures(features).disciplines[disciplineId] ?? false
}
