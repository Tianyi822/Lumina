/**
 * PPT 预设样式配置
 * 提供多种预设的样式主题供用户选择
 */

import PptxGenJS from 'pptxgenjs'
import type { PptStylePreset, PptStyleConfig } from '@shared/types/ppt-export'

/** EMU 到英寸的转换率 */
const EMU_PER_INCH = 914400

/** 默认幻灯片尺寸（16:9，英寸） */
const DEFAULT_SLIDE_WIDTH = 13.333
const DEFAULT_SLIDE_HEIGHT = 7.5

/**
 * PPT 预设样式列表
 * 包含商务蓝、简约白、渐变紫三种预设样式
 */
export const PPT_STYLE_PRESETS: PptStylePreset[] = [
  {
    id: 'professional-blue',
    name: '商务蓝',
    config: {
      primaryColor: '1E3A5F',
      backgroundColor: 'FFFFFF',
      titleFont: 'Microsoft YaHei',
      bodyFont: 'Microsoft YaHei',
      titleSize: 36,
      bodySize: 18
    }
  },
  {
    id: 'minimal-white',
    name: '简约白',
    config: {
      primaryColor: '333333',
      backgroundColor: 'FFFFFF',
      titleFont: 'Arial',
      bodyFont: 'Arial',
      titleSize: 32,
      bodySize: 16
    }
  },
  {
    id: 'creative-gradient',
    name: '渐变紫',
    config: {
      primaryColor: '6B5B95',
      backgroundColor: 'F5F5F5',
      titleFont: 'Arial',
      bodyFont: 'Arial',
      titleSize: 34,
      bodySize: 17
    }
  }
]

/**
 * 根据 ID 获取预设样式
 */
export function getPresetStyle(presetId: string): PptStylePreset | undefined {
  return PPT_STYLE_PRESETS.find((preset) => preset.id === presetId)
}

/**
 * 获取默认预设样式
 */
export function getDefaultPresetStyle(): PptStylePreset {
  return PPT_STYLE_PRESETS[0]
}

/**
 * 应用样式配置到生成器
 * @param _pptx - PptxGenJS 实例
 * @param _config - 样式配置
 */
export function applyStyleConfig(_pptx: PptxGenJS, _config: PptStyleConfig): void {
  // PptxGenJS 不支持全局样式设置
  // 样式需要在创建每个元素时单独应用
  // 这里只记录配置，供后续使用
}

/**
 * 设置幻灯片尺寸
 * @param pptx - PptxGenJS 实例
 * @param width - 宽度（EMU 或英寸）
 * @param height - 高度（EMU 或英寸）
 * @param unit - 单位类型，'emu' 或 'inch'
 */
export function setSlideSize(
  pptx: PptxGenJS,
  width: number,
  height: number,
  unit: 'emu' | 'inch' = 'inch'
): void {
  let widthInInch = width
  let heightInInch = height

  // 如果单位是 EMU，转换为英寸
  if (unit === 'emu') {
    widthInInch = width / EMU_PER_INCH
    heightInInch = height / EMU_PER_INCH
  }

  // 定义自定义布局
  pptx.defineLayout({ name: 'CUSTOM', width: widthInInch, height: heightInInch })
  pptx.layout = 'CUSTOM'
}

/**
 * 从 EMU 转换为英寸
 * @param emu - EMU 单位值
 * @returns 英寸值
 */
export function convertEmuToInches(emu: number): number {
  return emu / EMU_PER_INCH
}

/**
 * 从英寸转换为 EMU
 * @param inches - 英寸值
 * @returns EMU 单位值
 */
export function convertInchesToEmu(inches: number): number {
  return Math.round(inches * EMU_PER_INCH)
}

/**
 * 获取默认幻灯片尺寸（英寸）
 */
export function getDefaultSlideSize(): { width: number; height: number } {
  return {
    width: DEFAULT_SLIDE_WIDTH,
    height: DEFAULT_SLIDE_HEIGHT
  }
}

/**
 * 获取常用幻灯片尺寸
 */
export const COMMON_SLIDE_SIZES = {
  '16:9': { width: 13.333, height: 7.5 },
  '16:10': { width: 13.333, height: 8.333 },
  '4:3': { width: 10, height: 7.5 },
  'A4': { width: 10.83, height: 15.35 }
} as const

/**
 * 根据比例获取幻灯片尺寸
 * @param ratio - 宽高比
 * @returns 尺寸信息（英寸）
 */
export function getSlideSizeByRatio(
  ratio: keyof typeof COMMON_SLIDE_SIZES
): { width: number; height: number } | undefined {
  return COMMON_SLIDE_SIZES[ratio]
}
