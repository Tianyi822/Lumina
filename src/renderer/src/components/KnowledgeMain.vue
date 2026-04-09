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
    window.api.logger.error('[KnowledgeMain] 加载统计失败', {
      error: e instanceof Error ? e.message : String(e),
      kbId: currentKB.value.id
    })
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

// 知识库简介编辑（双击编辑，失焦自动保存）
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
  isEditingDescription.value = false
  if (text === (currentKB.value.description || '')) return
  try {
    const res = await window.api.knowledge.update(currentKB.value.id, { description: text })
    if (res.success) {
      if (currentKB.value) currentKB.value.description = text
      emit('description-updated', currentKB.value.id, text)
    }
  } catch {
    // 静默失败，不阻断用户操作
  }
}

function handleDescriptionKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    isEditingDescription.value = false
  }
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
    <div v-if="currentKB" class="kb-workspace">
      <section class="kb-overview">
        <div class="kb-overview__header">
          <div class="kb-overview__copy">
            <div class="kb-overview__title-row">
              <div class="kb-overview__heading">
                <h1 class="kb-title">{{ currentKB.name }}</h1>
                <span class="kb-overview__count">{{ linkedFiles.length }} 个文档</span>
              </div>
            </div>
          </div>

          <div class="kb-actions">
            <button
              class="sm-button sm-button--secondary reindex-btn"
              :disabled="indexingStatus || reindexing || linkedFiles.length === 0"
              @click="handleReindex"
            >
              <span v-if="reindexing" class="sm-spinner"></span>
              {{ reindexing ? '索引中...' : '重新索引' }}
            </button>
            <button class="sm-button sm-button--primary add-files-btn" @click="handleAddFiles">
              添加文档
            </button>
          </div>
        </div>

        <textarea
          v-if="isEditingDescription"
          ref="descriptionTextareaRef"
          v-model="editingDescription"
          class="sm-textarea kb-description kb-description--editing"
          rows="3"
          placeholder="补充知识库用途、范围和检索约束..."
          @blur="saveDescription"
          @keydown="handleDescriptionKeydown"
        ></textarea>

        <p
          v-else
          class="kb-description"
          :class="{ 'kb-description-empty': !currentKB.description }"
          @dblclick="startEditDescription"
        >
          {{ currentKB.description || '双击编辑，补充知识库用途、覆盖范围和检索约束。' }}
        </p>

        <StatsPanel :stats="stats" :loading-stats="loadingStats" :current-k-b="currentKB" />
      </section>

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
    <div v-else class="sm-empty empty-kb">
      <h2>选择或创建知识库</h2>
      <p>从左侧选择一个知识库，开始管理文档、索引和检索实验。</p>
    </div>
  </main>
</template>

<style scoped>
.kb-main {
  flex: 1;
  display: flex;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.kb-workspace {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
  padding: var(--sm-space-6);
  gap: var(--sm-space-4);
  overflow-y: auto;
}

.kb-overview {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-4);
  padding: var(--sm-space-5) var(--sm-space-6);
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-lg);
  background: var(--sm-color-surface-1);
  flex-shrink: 0;
}

.kb-overview__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sm-space-5);
}

.kb-overview__copy {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-3);
  flex: 1;
  min-width: 0;
}

.kb-overview__title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sm-space-4);
}

.kb-overview__heading {
  display: flex;
  align-items: stretch;
  gap: var(--sm-space-3);
  min-width: 0;
}

.kb-overview__count {
  display: inline-flex;
  align-items: center;
  align-self: stretch;
  padding: 0 10px;
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-md);
  background: rgba(255, 255, 255, 0.03);
  color: var(--sm-color-text-secondary);
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}

.kb-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  line-height: 1.2;
  color: var(--sm-color-text-primary);
}

.kb-description {
  margin: 0;
  padding: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--sm-color-text-secondary);
}

.kb-description--editing {
  padding: var(--sm-space-3);
}

.kb-description-empty {
  color: var(--sm-color-text-tertiary);
}

.kb-actions {
  display: flex;
  gap: var(--sm-space-2);
  flex-shrink: 0;
}

.add-files-btn {
  white-space: nowrap;
}

.reindex-btn {
  white-space: nowrap;
}

.empty-kb {
  flex: 1;
  margin: var(--sm-space-6);
}

.empty-kb h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
}

.empty-kb p {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--sm-color-text-secondary);
}

@media (max-width: 960px) {
  .kb-workspace {
    padding: var(--sm-space-4);
  }

  .kb-overview {
    padding: var(--sm-space-4);
  }

  .kb-overview__header,
  .kb-overview__title-row {
    flex-direction: column;
    align-items: stretch;
  }

  .kb-overview__heading {
    flex-direction: column;
  }

  .kb-overview__count {
    align-self: flex-start;
    min-height: 28px;
  }

  .kb-actions {
    width: 100%;
    flex-wrap: wrap;
  }

  .kb-actions > button {
    flex: 1 1 180px;
  }
}
</style>
