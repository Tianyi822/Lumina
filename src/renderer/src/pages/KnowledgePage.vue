<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import KnowledgeMain from '@renderer/components/KnowledgeMain.vue'
import KnowledgeForm from '@renderer/components/knowledge/KnowledgeForm.vue'

import FileManagerModal from '@renderer/components/knowledge/FileManagerModal.vue'
import FileSelectorModal from '@renderer/components/knowledge/FileSelectorModal.vue'
import { useKnowledgeStore, useUIStateStore } from '@renderer/stores'
import { useNotification } from '@renderer/composables/useNotification'
import type { FileItem } from '@renderer/types'

// ==================== 知识库管理（直接使用 Store）====================
const knowledgeStore = useKnowledgeStore()
const { knowledgeBases, activeKbId: storeActiveKbId, showForm } = storeToRefs(knowledgeStore)
const uiStateStore = useUIStateStore()
const { showKnowledgeFileManager } = storeToRefs(uiStateStore)
const notify = useNotification()

// 兼容旧接口命名（将 null 转为 undefined）
const activeKbId = computed(() => storeActiveKbId.value ?? undefined)
const showKnowledgeForm = showForm

// ==================== 生命周期 ====================
onMounted(async () => {
  await knowledgeStore.loadKnowledgeBases()
})

async function handleKnowledgeSubmit(data: {
  name: string
  description: string
  embeddingConfig: {
    baseUrl: string
    apiKey?: string
    displayName?: string
    model: string
    dimensions: number
  }
  embeddingDimension: number
  chunkSize: number
  chunkOverlap: number
}): Promise<void> {
  const success = await knowledgeStore.handleFormSubmit(data)
  if (!success) {
    notify.error('创建知识库失败', knowledgeStore.error || '未知错误', { source: 'knowledge' })
  }
}

function handleKnowledgeCancel(): void {
  knowledgeStore.closeForm()
}

// ==================== 文件管理 ====================
const showFileSelector = ref(false)
const currentKBIdForSelector = ref<string>('')

// KnowledgeMain 组件引用
const knowledgeMainRef = ref<InstanceType<typeof KnowledgeMain> | null>(null)

function handleFileManagerClose(): void {
  uiStateStore.closeKnowledgeFileManager()
}

function handleAddFiles(kbId: string): void {
  currentKBIdForSelector.value = kbId
  showFileSelector.value = true
}

function handleFileSelectorClose(): void {
  showFileSelector.value = false
  currentKBIdForSelector.value = ''
}

function handleFilesLinked(files: FileItem[]): void {
  // 通过 ref 调用 KnowledgeMain 组件的方法更新 UI
  if (knowledgeMainRef.value) {
    knowledgeMainRef.value.handleFilesLinked(files)
  }

  // 更新 knowledgeBases 中的 linkedFileIds 和 documentCount，确保 Sidebar 能正确显示
  const kb = knowledgeBases.value.find((k) => k.id === currentKBIdForSelector.value)
  if (kb) {
    const newFileIds = files.map((f) => f.id)
    kb.linkedFileIds = [...(kb.linkedFileIds || []), ...newFileIds]
    kb.documentCount = kb.linkedFileIds.length
  }
}

function handleFileUnlinked(kbId: string, fileId: string): void {
  // 更新 knowledgeBases 中的 linkedFileIds 和 documentCount，确保 Sidebar 能正确显示
  const kb = knowledgeBases.value.find((k) => k.id === kbId)
  if (kb && kb.linkedFileIds) {
    kb.linkedFileIds = kb.linkedFileIds.filter((id) => id !== fileId)
    kb.documentCount = kb.linkedFileIds.length
  }
}

function handleDescriptionUpdated(kbId: string, description: string): void {
  // 更新 knowledgeBases 中的描述，确保数据同步
  const kb = knowledgeBases.value.find((k) => k.id === kbId)
  if (kb) {
    kb.description = description
  }
}
</script>

<template>
  <div class="knowledge-page sm-workspace-view">
    <KnowledgeMain
      ref="knowledgeMainRef"
      :knowledge-base="knowledgeBases.find((kb) => kb.id === activeKbId)"
      @add-files="handleAddFiles"
      @file-unlinked="handleFileUnlinked"
      @description-updated="handleDescriptionUpdated"
    />

    <!-- 知识库表单模态框 -->
    <KnowledgeForm
      v-if="showKnowledgeForm"
      @submit="handleKnowledgeSubmit"
      @cancel="handleKnowledgeCancel"
    />

    <!-- 文件管理模态框 -->
    <FileManagerModal v-if="showKnowledgeFileManager" @close="handleFileManagerClose" />

    <!-- 文件选择模态框 -->
    <FileSelectorModal
      v-if="showFileSelector"
      :kb-id="currentKBIdForSelector"
      :linked-file-ids="
        knowledgeBases.find((kb) => kb.id === currentKBIdForSelector)?.linkedFileIds || []
      "
      @close="handleFileSelectorClose"
      @files-linked="handleFilesLinked"
    />
  </div>
</template>

<style scoped>
.knowledge-page {
  position: relative;
}
</style>
