import { computed } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type { EnhancedFewShotExample, ExampleFilter } from '@shared/types/prompt'

/**
 * 创建筛选后的示例列表
 */
export function createFilteredExamples(
  examples: Ref<EnhancedFewShotExample[]>,
  exampleFilter: Ref<ExampleFilter>
): ComputedRef<EnhancedFewShotExample[]> {
  return computed(() => {
    let result = [...examples.value]
    const filter = exampleFilter.value

    if (filter.minQualityScore !== undefined) {
      const minQualityScore = filter.minQualityScore
      result = result.filter((example) => example.qualityScore >= minQualityScore)
    }

    if (filter.toolName) {
      result = result.filter((example) => example.toolsUsed.includes(filter.toolName!))
    }

    if (filter.toolNames && filter.toolNames.length > 0) {
      result = result.filter((example) =>
        filter.toolNames!.some((toolName) => example.toolsUsed.includes(toolName))
      )
    }

    if (filter.searchQuery) {
      const query = filter.searchQuery.toLowerCase()
      result = result.filter(
        (example) =>
          example.userQuery.toLowerCase().includes(query) ||
          example.thought.toLowerCase().includes(query) ||
          example.toolsUsed.some((tool) => tool.toLowerCase().includes(query))
      )
    }

    if (filter.dateRange) {
      const start = new Date(filter.dateRange.start).getTime()
      const end = new Date(filter.dateRange.end).getTime()
      result = result.filter((example) => {
        const created = new Date(example.createdAt).getTime()
        return created >= start && created <= end
      })
    }

    if (filter.sortBy) {
      const order = filter.sortOrder === 'asc' ? 1 : -1
      switch (filter.sortBy) {
        case 'quality':
          result.sort((left, right) => (left.qualityScore - right.qualityScore) * order)
          break
        case 'usage':
          result.sort((left, right) => (left.usageCount - right.usageCount) * order)
          break
        case 'date':
          result.sort((left, right) => {
            const leftTime = new Date(left.createdAt).getTime()
            const rightTime = new Date(right.createdAt).getTime()
            return (leftTime - rightTime) * order
          })
          break
      }
    } else {
      result.sort((left, right) => right.qualityScore - left.qualityScore)
    }

    return result
  })
}
