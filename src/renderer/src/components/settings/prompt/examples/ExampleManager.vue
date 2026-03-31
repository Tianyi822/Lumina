<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { usePromptEngineeringStore } from '@renderer/stores/promptEngineeringStore'
import type { ExampleFilter } from '@shared/types/prompt'
import { usePromptManager } from '@renderer/composables/settings/usePromptManager'

import ExampleListHeader from './ExampleListHeader.vue'
import ExampleTable from './ExampleTable.vue'

const store = usePromptEngineeringStore()
const { examples, examplesStats, filteredExamples, examplesLoading, exampleFilter } =
  storeToRefs(store)
const {
  selectedIds,
  searchQuery,
  updateExampleFilter,
  updateSearchQuery,
  confirmDeleteExamples,
  confirmClearDynamicExamples,
  importExamplesFromFile,
  exportExamplesToFile,
  extractExamplesFromSessions,
  setSelectedIds
} = usePromptManager()

// 从所有示例中提取工具名称列表
const availableTools = computed(() => {
  const toolSet = new Set<string>()
  for (const example of examples.value) {
    if (example.toolsUsed) {
      for (const tool of example.toolsUsed) {
        if (tool) {
          toolSet.add(tool)
        }
      }
    }
  }
  return Array.from(toolSet).sort()
})

function handleFilter(filter: Partial<ExampleFilter>): void {
  updateExampleFilter(filter)
}
</script>

<template>
  <div class="sm-prompt-example-manager">
    <div class="sm-settings-banner">
      <div>
        <h3 class="sm-settings-page__section-title">Few-shot 示例管理</h3>
        <p class="sm-settings-page__section-description">
          管理用于增强 AI 工具调用能力的 Few-shot 示例，可在此查看和筛选已有示例。
        </p>
      </div>
    </div>

    <!-- 头部操作栏 -->
    <ExampleListHeader
      :stats="examplesStats"
      :filter="exampleFilter"
      :search-query="searchQuery"
      :loading="examplesLoading"
      :available-tools="availableTools"
      @update:filter="handleFilter"
      @update:search-query="updateSearchQuery"
      @extract="extractExamplesFromSessions"
      @import="importExamplesFromFile"
      @export="exportExamplesToFile"
      @clear-dynamic="confirmClearDynamicExamples"
    />

    <ExampleTable
      :examples="filteredExamples"
      :selected-ids="selectedIds"
      :loading="examplesLoading"
      @delete="confirmDeleteExamples"
      @update:selected-ids="setSelectedIds"
    />
  </div>
</template>

<style scoped>
.sm-prompt-example-manager {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-4);
}
</style>
