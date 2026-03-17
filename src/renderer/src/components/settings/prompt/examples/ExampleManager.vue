<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { usePromptEngineeringStore } from '@renderer/stores/promptEngineeringStore'
import type { EnhancedFewShotExample, ExampleFilter } from '@shared/types/prompt'
import { usePromptManager } from '@renderer/composables/settings/usePromptManager'

import ExampleListHeader from './ExampleListHeader.vue'
import ExampleTable from './ExampleTable.vue'
import ExampleEditDialog from './ExampleEditDialog.vue'

const store = usePromptEngineeringStore()
const { examples, examplesStats, filteredExamples, loading, exampleFilter } = storeToRefs(store)
const {
  showEditDialog,
  editingExample,
  selectedIds,
  searchQuery,
  updateExampleFilter,
  updateSearchQuery,
  openCreateExampleDialog,
  openEditExampleDialog,
  closeEditDialog,
  saveExample,
  confirmDeleteExamples,
  confirmClearDynamicExamples,
  importExamplesFromFile,
  exportExamplesToFile,
  extractExamplesFromSessions,
  setSelectedIds
} = usePromptManager()

function handleFilter(filter: Partial<ExampleFilter>): void {
  updateExampleFilter(filter)
}

async function handleSave(
  example: Omit<EnhancedFewShotExample, 'id' | 'createdAt' | 'usageCount'>
): Promise<void> {
  await saveExample(example)
}

function handleEdit(id: string): void {
  const example = examples.value.find((item) => item.id === id)
  if (!example) {
    return
  }

  openEditExampleDialog(example)
}

function handleDialogVisibility(visible: boolean): void {
  if (visible) {
    return
  }

  closeEditDialog()
}
</script>

<template>
  <div class="pe-example-manager">
    <!-- 说明区域 -->
    <div class="pe-info-box">
      <h3 class="pe-info-title">Few-shot 示例管理</h3>
      <p class="pe-info-description">
        管理用于增强 AI 工具调用能力的 Few-shot
        示例。静态示例为预定义示例，动态示例从历史对话中自动提取。
      </p>
    </div>

    <!-- 头部操作栏 -->
    <ExampleListHeader
      :stats="examplesStats"
      :filter="exampleFilter"
      :search-query="searchQuery"
      :loading="loading"
      @update:filter="handleFilter"
      @update:search-query="updateSearchQuery"
      @add="openCreateExampleDialog"
      @extract="extractExamplesFromSessions"
      @import="importExamplesFromFile"
      @export="exportExamplesToFile"
      @clear-dynamic="confirmClearDynamicExamples"
    />

    <ExampleTable
      :examples="filteredExamples"
      :selected-ids="selectedIds"
      :loading="loading"
      @edit="handleEdit"
      @delete="confirmDeleteExamples"
      @update:selected-ids="setSelectedIds"
    />

    <ExampleEditDialog
      :visible="showEditDialog"
      :example="editingExample"
      @update:visible="handleDialogVisibility"
      @save="handleSave"
      @cancel="closeEditDialog"
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
  background: var(--theme-background-secondary);
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
