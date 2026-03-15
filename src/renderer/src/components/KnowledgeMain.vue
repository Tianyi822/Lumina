<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useKnowledgeIndexStore } from '@renderer/stores'
import type { KnowledgeBase } from '@renderer/types'
import { useKnowledgeFiles } from './knowledge/composables/useKnowledgeFiles'
import { useReindex } from './knowledge/composables/useReindex'
import StatsPanel from './knowledge/StatsPanel.vue'
import SearchPanel from './knowledge/SearchPanel.vue'
import FileListPanel from './knowledge/FileListPanel.vue'

const props = defineProps<{ knowledgeBase?: KnowledgeBase }>()
const emit = defineEmits<{
  (e: 'add-files', kbId: string): void
  (e: 'file-unlinked', kbId: string, fileId: string): void
  (e: 'description-updated', kbId: string, description: string): void
}>()

const currentKB = computed(() => props.knowledgeBase)
const indexStore = useKnowledgeIndexStore()

const stats = ref({ fileCount: 0, chunkCount: 0, dbSize: 0 })
const loadingStats = ref(false)

async function loadStats(): Promise<void> {
  if (!currentKB.value) return
  loadingStats.value = true
  try {
    const res = await window.api.knowledge.getStats(currentKB.value.id)
    if (res.success && res.data) stats.value = res.data
  } catch (e) {
    console.error('加载统计失败:', e)
  } finally {
    loadingStats.value = false
  }
}

const {
  linkedFiles,
  loadingFiles,
  unlinkingFileId,
  isDragging,
  loadLinkedFiles,
  handleUnlinkFile,
  handleAddFiles,
  handleFilesLinked,
  handleDragEnter,
  handleDragLeave,
  handleDragOver,
  handleDrop
} = useKnowledgeFiles(currentKB, emit, loadStats)

const { reindexing, handleReindex } = useReindex(currentKB, linkedFiles, loadStats)

const indexingStatus = computed(() =>
  currentKB.value ? indexStore.isKBIndexing(currentKB.value.id) : false
)
const kbIndexingFiles = computed(() =>
  currentKB.value ? indexStore.getKBIndexingFilesMap(currentKB.value.id) : {}
)

// 知识库简介编辑
const isEditingDescription = ref(false)
const editingDescription = ref('')
const descriptionTextareaRef = ref<HTMLTextAreaElement | null>(null)

function startEditDescription(): void {
  if (!currentKB.value) return
  editingDescription.value = currentKB.value.description || ''
  isEditingDescription.value = true
  setTimeout(() => descriptionTextareaRef.value?.focus(), 0)
}

async function saveDescription(): Promise<void> {
  if (!currentKB.value) return
  const text = editingDescription.value.trim()
  if (text === (currentKB.value.description || '')) {
    isEditingDescription.value = false
    return
  }
  try {
    const res = await window.api.knowledge.update(currentKB.value.id, { description: text })
    if (res.success) {
      if (currentKB.value) currentKB.value.description = text
      emit('description-updated', currentKB.value.id, text)
    } else alert('保存简介失败: ' + res.error)
  } catch (e) {
    alert('保存失败: ' + e)
  } finally {
    isEditingDescription.value = false
  }
}

function cancelEditDescription(): void {
  isEditingDescription.value = false
  editingDescription.value = ''
}

function handleDescriptionKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') cancelEditDescription()
  else if (e.key === 'Enter' && e.metaKey) void saveDescription()
}

function handleVisibilityChange(): void {
  if (document.visibilityState === 'visible' && currentKB.value)
    void indexStore.restoreStatus(currentKB.value.id)
}

watch(
  () => currentKB.value?.id,
  async (newId) => {
    if (currentKB.value && newId) {
      await loadLinkedFiles()
      await loadStats()
      await indexStore.restoreStatus(newId)
    } else {
      linkedFiles.value = []
      stats.value = { fileCount: 0, chunkCount: 0, dbSize: 0 }
    }
  },
  { immediate: true }
)

onMounted(() => {
  document.addEventListener('visibilitychange', handleVisibilityChange)
  if (currentKB.value) setTimeout(() => void indexStore.restoreStatus(currentKB.value!.id), 100)
})
onUnmounted(() => document.removeEventListener('visibilitychange', handleVisibilityChange))

defineExpose({ handleFilesLinked })
</script>

<template>
  <main class="kb-main">
    <div v-if="currentKB" class="kb-content">
      <header class="kb-header">
        <div class="kb-title-row">
          <h1 class="kb-title">{{ currentKB.name }}</h1>
          <div class="kb-actions">
            <button
              class="btn-secondary reindex-btn"
              :disabled="indexingStatus || reindexing || linkedFiles.length === 0"
              @click="handleReindex"
            >
              <span v-if="reindexing" class="spinner-tiny"></span>
              {{ reindexing ? '索引中...' : '重新索引' }}
            </button>
            <button class="btn-primary add-files-btn" @click="handleAddFiles">+ 添加文档</button>
          </div>
        </div>
        <div class="kb-description-container">
          <textarea
            v-if="isEditingDescription"
            ref="descriptionTextareaRef"
            v-model="editingDescription"
            class="kb-description-input"
            rows="2"
            placeholder="输入知识库简介..."
            @blur="saveDescription"
            @keydown="handleDescriptionKeydown"
          ></textarea>
          <p
            v-else
            class="kb-description"
            :class="{ 'kb-description-empty': !currentKB.description }"
            @dblclick="startEditDescription"
          >
            {{ currentKB.description || '双击添加简介...' }}
          </p>
          <span v-if="!isEditingDescription" class="edit-hint" @click="startEditDescription"
            >编辑</span
          >
        </div>
        <StatsPanel :stats="stats" :loading-stats="loadingStats" :current-k-b="currentKB" />
      </header>
      <SearchPanel :current-k-b="currentKB" />
      <FileListPanel
        :linked-files="linkedFiles"
        :loading-files="loadingFiles"
        :is-dragging="isDragging"
        :unlinking-file-id="unlinkingFileId"
        :indexing-status="indexingStatus"
        :kb-indexing-files="kbIndexingFiles"
        @dragenter="handleDragEnter"
        @dragleave="handleDragLeave"
        @dragover="handleDragOver"
        @drop="handleDrop"
        @add-files="handleAddFiles"
        @unlink-file="(id) => handleUnlinkFile(id, handleReindex)"
      />
    </div>
    <div v-else class="empty-kb">
      <h2>选择或创建知识库</h2>
      <p>从左侧选择一个知识库，或创建新的知识库开始使用</p>
    </div>
  </main>
</template>

<style scoped>
.kb-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  background-color: var(--theme-bg);
  overflow: hidden;
}
.kb-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
.kb-header {
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--theme-border);
  flex-shrink: 0;
}
.kb-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}
.kb-title {
  font-size: 28px;
  font-weight: 600;
  color: var(--theme-text);
  margin: 0;
  line-height: 28px;
}
.kb-description-container {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 12px;
}
.kb-description {
  font-size: 13px;
  color: var(--theme-text-secondary);
  margin: 0;
  line-height: 1.5;
  cursor: pointer;
  flex: 1;
  padding: 4px 8px;
  border-radius: 6px;
  transition: all 0.15s ease;
}
.kb-description:hover {
  background-color: var(--theme-bg-secondary);
}
.kb-description-empty {
  color: var(--theme-text-muted);
  font-style: italic;
}
.kb-description-input {
  flex: 1;
  font-size: 13px;
  line-height: 1.5;
  padding: 4px 8px;
  border: 1px solid var(--theme-accent);
  border-radius: 6px;
  background-color: var(--theme-bg);
  color: var(--theme-text);
  resize: vertical;
  min-height: 40px;
  font-family: inherit;
}
.kb-description-input:focus {
  outline: none;
  box-shadow: 0 0 0 2px rgba(63, 185, 80, 0.2);
}
.edit-hint {
  font-size: 11px;
  color: var(--theme-text-muted);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.15s ease;
  opacity: 0;
}
.kb-description-container:hover .edit-hint {
  opacity: 1;
}
.edit-hint:hover {
  color: var(--theme-accent);
  background-color: var(--theme-bg-secondary);
}
.kb-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
.add-files-btn {
  padding: 0 14px;
  font-size: 13px;
  height: 28px;
  white-space: nowrap;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #46aa8f;
  border-color: rgba(70, 170, 143, 0.4);
}
.add-files-btn:hover {
  background: #3d9980;
}
.reindex-btn {
  padding: 0 12px;
  font-size: 13px;
  height: 28px;
  white-space: nowrap;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  color: var(--theme-text);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.reindex-btn:hover:not(:disabled) {
  background-color: var(--theme-bg-hover);
  border-color: var(--theme-accent);
}
.reindex-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.spinner-tiny {
  width: 12px;
  height: 12px;
  border: 2px solid var(--theme-border);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  display: inline-block;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.empty-kb {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 60px 20px;
}
.empty-kb h2 {
  font-size: 16px;
  font-weight: 600;
  color: var(--theme-text);
  margin: 0 0 8px 0;
}
.empty-kb p {
  font-size: 13px;
  color: var(--theme-text-secondary);
  margin: 0;
}
</style>
