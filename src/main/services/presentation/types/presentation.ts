import type {
  PresentationPageSize,
  PresentationTemplate,
  PresentationThemeConfig,
  TemplateInfo
} from '@shared/types/presentation'

/**
 * 运行时主题配置
 */
export interface ResolvedTheme {
  primaryColor: string
  secondaryColor: string
  accentColor: string
  backgroundColor: string
  textColor: string
  mutedTextColor: string
  fontFace: string
  headingFontFace: string
}

/**
 * 模板运行时元信息
 */
export interface PresentationTemplateDefinition extends TemplateInfo {
  id: PresentationTemplate
  defaultTheme: Required<PresentationThemeConfig>
  pageSize?: PresentationPageSize
}
