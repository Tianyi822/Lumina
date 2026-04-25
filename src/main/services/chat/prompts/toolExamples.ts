import type { FewShotExample, EnhancedFewShotExample, ExampleSelectionCriteria } from './types'
import { exampleRepository } from '../examples'
import { logger } from '../../logger'

/**
 * 根据配置获取指定数量的示例
 */
export async function getFewShotExamplesAsync(
  count: number = 3,
  options: {
    minQualityScore?: number
    requiredTools?: string[]
  } = {}
): Promise<EnhancedFewShotExample[]> {
  const { minQualityScore = 0.6, requiredTools = [] } = options

  try {
    await exampleRepository.initialize()

    const criteria: ExampleSelectionCriteria = {
      maxCount: count,
      minQualityScore,
      requiredTools: requiredTools.length > 0 ? requiredTools : undefined
    }

    const examples = (await exampleRepository.getAll())
      .filter((example) => example.qualityScore >= criteria.minQualityScore)
      .filter((example) => {
        if (!criteria.requiredTools || criteria.requiredTools.length === 0) {
          return true
        }

        return criteria.requiredTools.some((tool) => example.toolsUsed.includes(tool))
      })
      .sort((left, right) => {
        if (right.qualityScore !== left.qualityScore) {
          return right.qualityScore - left.qualityScore
        }

        return left.usageCount - right.usageCount
      })
      .slice(0, criteria.maxCount)

    if (examples.length > 0) {
      await exampleRepository.update(
        examples.map((example) => ({
          ...example,
          usageCount: example.usageCount + 1,
          lastUsedAt: new Date().toISOString()
        }))
      )
    }

    return examples
  } catch (error) {
    logger.warn('获取 Few-shot 示例失败', 'main', { error })
    return []
  }
}

// 将示例格式化为提示词文本
export function formatFewShotExample(example: FewShotExample): string {
  let text = `**用户**: ${example.userQuery}\n\n`
  text += `**思考**: ${example.thought}\n\n`

  if (example.toolCalls && example.toolCalls.length > 0) {
    text += `**工具调用**:\n`
    for (const toolCall of example.toolCalls) {
      const MAX_RESULT_LENGTH = 500
      const result =
        toolCall.result.length > MAX_RESULT_LENGTH
          ? toolCall.result.slice(0, MAX_RESULT_LENGTH) + '\n...[结果已截断]'
          : toolCall.result

      text += `- 工具: ${toolCall.name}\n`
      text += `  参数: ${JSON.stringify(toolCall.arguments, null, 2)}\n`
      text += `  结果: ${result}\n\n`
    }
  }

  text += `**最终答案**: ${example.finalAnswer}\n`
  return text
}

/**
 * 格式化增强示例
 */
export function formatEnhancedFewShotExample(example: EnhancedFewShotExample): string {
  return formatFewShotExample(example)
}
