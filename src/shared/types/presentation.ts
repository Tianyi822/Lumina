/**
 * PPT 模板类型
 */
export type BuiltinPresentationTemplate = 'lessonPlan' | 'business' | 'minimal'

/**
 * PPT 模板类型
 */
export type PresentationTemplate = BuiltinPresentationTemplate | 'custom'

/**
 * PPT 模板来源
 */
export type PresentationTemplateSource = 'builtin' | 'user'

/**
 * 幻灯片页面尺寸
 */
export interface PresentationPageSize {
  width: number
  height: number
}

/**
 * 幻灯片布局类型
 */
export type SlideLayout = 'title' | 'titleContent' | 'twoColumn' | 'blank' | 'comparison'

/**
 * 通用位置参数
 */
export interface PositionOptions {
  x?: number
  y?: number
  w?: number
  h?: number
}

/**
 * 主题配置
 */
export interface PresentationThemeConfig {
  primaryColor?: string
  secondaryColor?: string
  accentColor?: string
  backgroundColor?: string
  textColor?: string
  mutedTextColor?: string
  fontFace?: string
  headingFontFace?: string
}

/**
 * 文本样式
 */
export interface TextStyle {
  fontSize?: number
  bold?: boolean
  italic?: boolean
  color?: string
  align?: 'left' | 'center' | 'right'
  valign?: 'top' | 'middle' | 'bottom'
  bullet?: boolean
  margin?: number
  fontFace?: string
}

/**
 * 列表项
 */
export interface ListItem {
  text: string
  level?: number
}

/**
 * 表格样式
 */
export interface TableStyle {
  headerFillColor?: string
  headerTextColor?: string
  bodyFillColor?: string
  bodyTextColor?: string
  borderColor?: string
  striped?: boolean
}

/**
 * 图表数据序列
 */
export interface ChartSeries {
  name: string
  values: number[]
}

/**
 * 图表数据
 */
export interface ChartData {
  labels: string[]
  series: ChartSeries[]
}

/**
 * 图表选项
 */
export interface ChartOptions {
  title?: string
  showLegend?: boolean
  showValue?: boolean
  showCategoryAxis?: boolean
  showValueAxis?: boolean
}

/**
 * 文本内容
 */
export interface TextContent {
  text: string
  style?: TextStyle
}

/**
 * 列表内容
 */
export interface ListContent {
  items: ListItem[]
  ordered?: boolean
  style?: TextStyle
}

/**
 * 表格内容
 */
export interface TableContent {
  headers: string[]
  rows: string[][]
  style?: TableStyle
}

/**
 * 图表内容
 */
export interface ChartContent {
  type: 'bar' | 'line' | 'pie' | 'doughnut'
  data: ChartData
  options?: ChartOptions
}

/**
 * 图片内容
 */
export interface ImageContent {
  path?: string
  data?: string
  alt?: string
}

/**
 * 形状内容
 */
export interface ShapeContent {
  shape: 'rect' | 'roundRect' | 'ellipse' | 'chevron' | 'line'
  text?: string
  fillColor?: string
  lineColor?: string
  textColor?: string
}

/**
 * 代码块内容
 */
export interface CodeContent {
  code: string
  language?: string
}

/**
 * 幻灯片文本内容
 */
export interface TextSlideContent {
  type: 'text'
  data: TextContent
  options?: PositionOptions
}

/**
 * 幻灯片列表内容
 */
export interface ListSlideContent {
  type: 'list'
  data: ListContent
  options?: PositionOptions
}

/**
 * 幻灯片表格内容
 */
export interface TableSlideContent {
  type: 'table'
  data: TableContent
  options?: PositionOptions
}

/**
 * 幻灯片图表内容
 */
export interface ChartSlideContent {
  type: 'chart'
  data: ChartContent
  options?: PositionOptions
}

/**
 * 幻灯片图片内容
 */
export interface ImageSlideContent {
  type: 'image'
  data: ImageContent
  options?: PositionOptions
}

/**
 * 幻灯片形状内容
 */
export interface ShapeSlideContent {
  type: 'shape'
  data: ShapeContent
  options?: PositionOptions
}

/**
 * 幻灯片代码内容
 */
export interface CodeSlideContent {
  type: 'code'
  data: CodeContent
  options?: PositionOptions
}

/**
 * 幻灯片内容
 */
export type SlideContent =
  | TextSlideContent
  | ListSlideContent
  | TableSlideContent
  | ChartSlideContent
  | ImageSlideContent
  | ShapeSlideContent
  | CodeSlideContent

/**
 * 单页幻灯片配置
 */
export interface SlideConfig {
  layout: SlideLayout
  title?: string
  subtitle?: string
  content: SlideContent[]
  notes?: string
}

/**
 * 演示文稿配置
 */
export interface PresentationConfig {
  title: string
  author?: string
  company?: string
  subject?: string
  template: PresentationTemplate
  customTemplateId?: string
  slides: SlideConfig[]
  theme?: PresentationThemeConfig
}

/**
 * 导出 PPT 请求
 */
export interface ExportPresentationRequest {
  content?: string
  config?: PresentationConfig
  title?: string
  author?: string
  company?: string
  subject?: string
  template?: PresentationTemplate
  customTemplateId?: string
  theme?: PresentationThemeConfig
  timestamp?: string
}

/**
 * 构建 PPT 草稿请求
 */
export interface BuildPresentationDraftRequest {
  content: string
  title?: string
  author?: string
  company?: string
  subject?: string
  template?: PresentationTemplate
  customTemplateId?: string
  theme?: PresentationThemeConfig
}

/**
 * 导出 PPT 结果
 */
export interface ExportPresentationResult {
  success: boolean
  data?: number[]
  fileName?: string
  mimeType?: string
  error?: string
}

/**
 * 构建 PPT 草稿结果
 */
export interface BuildPresentationDraftResult {
  success: boolean
  data?: PresentationConfig
  error?: string
}

/**
 * 模板信息
 */
export interface TemplateInfo {
  id: PresentationTemplate
  selectionKey: string
  source: PresentationTemplateSource
  name: string
  description: string
  userTemplateId?: string
  baseTemplate?: BuiltinPresentationTemplate
  recommendedFor?: string[]
  previewColors?: string[]
  theme?: PresentationThemeConfig
  pageSize?: PresentationPageSize
  originalFileName?: string
}

/**
 * 用户保存的 PPT 模板
 */
export interface UserPresentationTemplate {
  id: string
  name: string
  description: string
  originalFileName: string
  baseTemplate: BuiltinPresentationTemplate
  theme: PresentationThemeConfig
  previewColors?: string[]
  pageSize?: PresentationPageSize
  createdAt: string
}

/**
 * 导入 PPT 模板请求
 */
export interface ImportPresentationTemplateRequest {
  data: number[]
  fileName: string
  name?: string
  baseTemplate?: BuiltinPresentationTemplate
}

/**
 * 导入 PPT 模板结果
 */
export interface ImportPresentationTemplateResult {
  success: boolean
  data?: TemplateInfo
  error?: string
}

/**
 * 删除 PPT 模板请求
 */
export interface DeletePresentationTemplateRequest {
  templateId: string
  source: PresentationTemplateSource
}

/**
 * 删除 PPT 模板结果
 */
export interface DeletePresentationTemplateResult {
  success: boolean
  error?: string
}

/**
 * 校验项
 */
export interface ValidationIssue {
  path: string
  message: string
  severity: 'error' | 'warning'
}

/**
 * 配置校验结果
 */
export interface ValidationResult {
  valid: boolean
  issues: ValidationIssue[]
}

/**
 * PPT 预览结果
 */
export interface PresentationPreviewResult {
  success: boolean
  images?: string[]
  error?: string
}
