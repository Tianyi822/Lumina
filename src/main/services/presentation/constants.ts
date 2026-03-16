import type { PptStyleConfig } from '@shared/types/ppt-export'

/** 最大推荐的幻灯片数量 */
export const MAX_RECOMMENDED_SLIDES = 50

/** 最大允许的幻灯片数量 */
export const MAX_ALLOWED_SLIDES = 100

/** 性能监控阈值（毫秒） */
export const PERFORMANCE_WARNING_THRESHOLD = 3000

/** 默认样式配置 */
export const DEFAULT_STYLE: Required<PptStyleConfig> = {
  primaryColor: '1E3A5F',
  backgroundColor: 'FFFFFF',
  titleFont: 'Microsoft YaHei',
  bodyFont: 'Microsoft YaHei',
  titleSize: 36,
  bodySize: 18
}

/** SVG 预览每英寸像素数 */
export const PREVIEW_PIXELS_PER_INCH = 96

/** SVG 预览兜底尺寸 */
export const DEFAULT_PREVIEW_SLIDE_SIZE_PX = {
  width: 1280,
  height: 720
}

/** Office 主题色兜底映射 */
export const OFFICE_THEME_COLORS: Record<string, string> = {
  accent1: '#4472c4',
  accent2: '#ed7d31',
  accent3: '#a5a5a5',
  accent4: '#ffc000',
  accent5: '#5b9bd5',
  accent6: '#70ad47',
  bg1: '#ffffff',
  bg2: '#e7e6e6',
  tx1: '#000000',
  tx2: '#44546a',
  dk1: '#000000',
  dk2: '#44546a',
  lt1: '#ffffff',
  lt2: '#e7e6e6'
}
