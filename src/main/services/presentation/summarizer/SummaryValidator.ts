import type { PptTemplateAiSummary } from '@shared/types/ppt-template'

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

/**
 * AI 总结结果校验器
 */
export class SummaryValidator {
  /**
   * 校验总结结果结构
   */
  validate(summary: unknown, expectedSlideCount: number): ValidationResult {
    const errors: string[] = []

    if (typeof summary !== 'object' || summary === null) {
      return {
        valid: false,
        errors: ['总结结果必须是对象']
      }
    }

    const data = summary as Partial<PptTemplateAiSummary>

    if (data.schemaVersion !== '1.0') {
      errors.push('schemaVersion 必须为 "1.0"')
    }

    if (typeof data.templateId !== 'string' || !data.templateId.trim()) {
      errors.push('templateId 必须是非空字符串')
    }

    if (typeof data.generatedAt !== 'string' || !data.generatedAt.trim()) {
      errors.push('generatedAt 必须是非空字符串')
    }

    if (typeof data.modelName !== 'string' || !data.modelName.trim()) {
      errors.push('modelName 必须是非空字符串')
    }

    if (typeof data.overallSummary !== 'object' || data.overallSummary === null) {
      errors.push('overallSummary 必须是对象')
    } else {
      if (typeof data.overallSummary.style !== 'string' || !data.overallSummary.style.trim()) {
        errors.push('overallSummary.style 必须是非空字符串')
      }

      if (
        !Array.isArray(data.overallSummary.useCases) ||
        data.overallSummary.useCases.some((item) => typeof item !== 'string')
      ) {
        errors.push('overallSummary.useCases 必须是字符串数组')
      }

      if (
        !Array.isArray(data.overallSummary.designHighlights) ||
        data.overallSummary.designHighlights.some((item) => typeof item !== 'string')
      ) {
        errors.push('overallSummary.designHighlights 必须是字符串数组')
      }

      if (
        typeof data.overallSummary.contentGuidelines !== 'string' ||
        !data.overallSummary.contentGuidelines.trim()
      ) {
        errors.push('overallSummary.contentGuidelines 必须是非空字符串')
      }
    }

    if (!Array.isArray(data.slideSummaries)) {
      errors.push('slideSummaries 必须是数组')
    } else {
      if (data.slideSummaries.length !== expectedSlideCount) {
        errors.push(
          `slideSummaries 数量不匹配，期望 ${expectedSlideCount}，实际 ${data.slideSummaries.length}`
        )
      }

      data.slideSummaries.forEach((slideSummary, index) => {
        if (typeof slideSummary !== 'object' || slideSummary === null) {
          errors.push(`slideSummaries[${index}] 必须是对象`)
          return
        }

        if (
          typeof slideSummary.slideIndex !== 'number' ||
          !Number.isInteger(slideSummary.slideIndex)
        ) {
          errors.push(`slideSummaries[${index}].slideIndex 必须是整数`)
        }

        if (slideSummary.slideIndex !== index) {
          errors.push(`slideSummaries[${index}].slideIndex 必须等于 ${index}`)
        }

        if (typeof slideSummary.pageType !== 'string' || !slideSummary.pageType.trim()) {
          errors.push(`slideSummaries[${index}].pageType 必须是非空字符串`)
        }

        if (typeof slideSummary.purpose !== 'string' || !slideSummary.purpose.trim()) {
          errors.push(`slideSummaries[${index}].purpose 必须是非空字符串`)
        }

        if (
          !Array.isArray(slideSummary.keyPoints) ||
          slideSummary.keyPoints.some((item) => typeof item !== 'string')
        ) {
          errors.push(`slideSummaries[${index}].keyPoints 必须是字符串数组`)
        }

        if (
          slideSummary.designNotes !== undefined &&
          typeof slideSummary.designNotes !== 'string'
        ) {
          errors.push(`slideSummaries[${index}].designNotes 必须是字符串`)
        }
      })
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }
}
