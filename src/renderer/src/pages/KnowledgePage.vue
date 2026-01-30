<script setup lang="ts">
import KnowledgeSidebar from '@renderer/components/KnowledgeSidebar.vue'
import KnowledgeMain from '@renderer/components/KnowledgeMain.vue'
import KnowledgeForm from '@renderer/components/knowledge/KnowledgeForm.vue'
import DocumentUploader from '@renderer/components/knowledge/DocumentUploader.vue'
import { useKnowledge } from '@renderer/composables/knowledge/useKnowledge'

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
</script>

<template>
  <div class="knowledge-page">
    <KnowledgeSidebar
      :knowledge-bases="knowledgeBases"
      :active-kb-id="activeKbId"
      @select-kb="handleSelectKB"
      @create-kb="handleCreateKB"
      @delete-kb="handleDeleteKB"
    />
    <KnowledgeMain
      :knowledge-base="knowledgeBases.find((kb) => kb.id === activeKbId)"
      @upload-documents="handleUploadDocuments"
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
</template>

<style scoped>
.knowledge-page {
  display: flex;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
</style>
