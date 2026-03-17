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
  <div class="pe-example-manager">
    <!-- 说明区域 -->
    <div class="pe-info-box">
      <h3 class="pe-info-title">Few-shot 示例管理</h3>
      <p class="pe-info-description">
        管理用于增强 AI 工具调用能力的 Few-shot 示例，可在此查看、筛选和维护已有示例。
        动态示例可从历史对话中自动提取。
      </p>
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
.pe-example-manager {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
}

/* 说明区域 */
.pe-info-box {
  padding: 16px;
  background: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 8px;
}

.pe-info-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--theme-text);
  margin: 0 0 8px 0;
}

.pe-info-description {
  font-size: 13px;
  color: var(--theme-text-secondary);
  margin: 0;
  line-height: 1.6;
}
</style>
