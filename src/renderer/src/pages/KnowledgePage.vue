<script setup lang="ts">
import { ref } from 'vue'
import KnowledgeSidebar from '@renderer/components/KnowledgeSidebar.vue'
import KnowledgeMain from '@renderer/components/KnowledgeMain.vue'
import KnowledgeForm from '@renderer/components/knowledge/KnowledgeForm.vue'

import FileManagerModal from '@renderer/components/knowledge/FileManagerModal.vue'
import FileSelectorModal from '@renderer/components/knowledge/FileSelectorModal.vue'
import { useKnowledge } from '@renderer/composables/knowledge/useKnowledge'
import type { FileItem } from '@renderer/types'

// ==================== 知识库管理 ====================
const {
  knowledgeBases,
  activeKbId,
  showKnowledgeForm,
  handleSelectKB,
  handleCreateKB,
  handleDeleteKB,
  handleKnowledgeSubmit,
  handleKnowledgeCancel
} = useKnowledge()

// ==================== 文件管理 ====================
const showFileManager = ref(false)
const showFileSelector = ref(false)
const currentKBIdForSelector = ref<string>('')

// KnowledgeMain 组件引用
const knowledgeMainRef = ref<InstanceType<typeof KnowledgeMain> | null>(null)

function handleManageFiles(): void {
  showFileManager.value = true
}

function handleFileManagerClose(): void {
  showFileManager.value = false
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
  <div class="knowledge-page">
    <KnowledgeSidebar
      :knowledge-bases="knowledgeBases"
      :active-kb-id="activeKbId"
      @select-kb="handleSelectKB"
      @create-kb="handleCreateKB"
      @delete-kb="handleDeleteKB"
      @manage-files="handleManageFiles"
    />
    <KnowledgeMain
      ref="knowledgeMainRef"
      :knowledge-base="knowledgeBases.find((kb) => kb.id === activeKbId)"
      @add-files="handleAddFiles"
      @file-unlinked="handleFileUnlinked"
      @description-updated="handleDescriptionUpdated"
    />
  </div>

  <!-- 知识库表单模态框 -->
  <KnowledgeForm
    v-if="showKnowledgeForm"
    @submit="handleKnowledgeSubmit"
    @cancel="handleKnowledgeCancel"
  />

  <!-- 文件管理模态框 -->
  <FileManagerModal v-if="showFileManager" @close="handleFileManagerClose" />

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
</template>

<style scoped>
.knowledge-page {
  display: flex;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
</style>
