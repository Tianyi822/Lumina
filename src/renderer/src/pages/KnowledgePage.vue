<script setup lang="ts">
import { ref } from 'vue'
import KnowledgeSidebar from '@renderer/components/KnowledgeSidebar.vue'
import KnowledgeMain from '@renderer/components/KnowledgeMain.vue'
import KnowledgeForm from '@renderer/components/knowledge/KnowledgeForm.vue'
import DocumentUploader from '@renderer/components/knowledge/DocumentUploader.vue'
import FileManagerModal from '@renderer/components/knowledge/FileManagerModal.vue'
import FileSelectorModal from '@renderer/components/knowledge/FileSelectorModal.vue'
import { useKnowledge } from '@renderer/composables/knowledge/useKnowledge'
import type { FileItem } from '@renderer/types'

// ==================== 知识库管理 ====================
const {
  knowledgeBases,
  activeKbId,
  showKnowledgeForm,
  showDocumentUploader,
  handleSelectKB,
  handleCreateKB,
  handleDeleteKB,
  handleKnowledgeSubmit,
  handleKnowledgeCancel,
  handleUploadDocuments,
  handleDocumentUpload,
  handleUploaderCancel
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
  // 通过 ref 调用 KnowledgeMain 组件的方法
  if (knowledgeMainRef.value) {
    knowledgeMainRef.value.handleFilesLinked(files)
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
      @upload-documents="handleUploadDocuments"
      @add-files="handleAddFiles"
    />
  </div>

  <!-- 知识库表单模态框 -->
  <KnowledgeForm
    v-if="showKnowledgeForm"
    @submit="handleKnowledgeSubmit"
    @cancel="handleKnowledgeCancel"
  />

  <!-- 文档上传模态框 -->
  <DocumentUploader
    v-if="showDocumentUploader"
    @upload="handleDocumentUpload"
    @cancel="handleUploaderCancel"
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
