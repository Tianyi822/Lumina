<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useKnowledgeIndexStore } from '@renderer/stores'
import type { KnowledgeBase } from '@renderer/types'
import { useKnowledgeFiles } from './knowledge/composables/useKnowledgeFiles'
import styles from './KnowledgeMain.module.css'
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

const needsReindex = computed(() => currentKB.value?.indexInvalidation?.needsReindex === true)
const invalidatedFiles = computed(() => currentKB.value?.indexInvalidation?.files || [])
const invalidatedFileIds = computed(() => invalidatedFiles.value.map((file) => file.fileId))

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

async function refreshCurrentKnowledgeBase(): Promise<void> {
  if (!currentKB.value) return
  const result = await window.api.knowledge.getById(currentKB.value.id)
  if (result.success && result.data) {
    Object.assign(currentKB.value, result.data)
    currentKB.value.indexInvalidation = result.data.indexInvalidation
  }
}

const { reindexing, handleReindex } = useReindex(
  currentKB,
  linkedFiles,
  loadStats,
  refreshCurrentKnowledgeBase
)

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
  <main :class="styles.kbMain">
    <div v-if="currentKB" :class="styles.kbWorkspace">
      <section :class="styles.kbOverview">
        <div :class="styles.kbOverviewHeader">
          <div :class="styles.kbOverviewCopy">
            <div :class="styles.kbOverviewTitleRow">
              <div :class="styles.kbOverviewHeading">
                <h1 :class="styles.kbTitle">{{ currentKB.name }}</h1>
              </div>
            </div>

            <textarea
              v-if="isEditingDescription"
              ref="descriptionTextareaRef"
              v-model="editingDescription"
              :class="['sm-textarea', styles.kbDescription, styles.kbDescriptionEditing]"
              rows="3"
              placeholder="补充知识库用途、范围和检索约束..."
              @blur="saveDescription"
              @keydown="handleDescriptionKeydown"
            ></textarea>

            <p
              v-else
              :class="[styles.kbDescription, { 'kb-description-empty': !currentKB.description }]"
              @dblclick="startEditDescription"
            >
              {{ currentKB.description || '双击编辑，补充知识库用途、覆盖范围和检索约束。' }}
            </p>

            <StatsPanel :stats="stats" :loading-stats="loadingStats" :current-k-b="currentKB" />
          </div>
        </div>

        <div v-if="needsReindex" class="kb-reindex-notice">
          <div class="kb-reindex-notice__copy">
            <strong>需要重新索引</strong>
            <span>论文笔记已更新，重新索引后检索结果会使用最新笔记内容。</span>
            <ul v-if="invalidatedFiles.length > 0">
              <li v-for="file in invalidatedFiles" :key="file.fileId">{{ file.fileName }}</li>
            </ul>
          </div>
        </div>
      </section>

      <SearchPanel :current-k-b="currentKB" />
      <FileListPanel
        :linked-files="linkedFiles"
        :loading-files="loadingFiles"
        :is-dragging="isDragging"
        :unlinking-file-id="unlinkingFileId"
        :indexing-status="indexingStatus"
        :reindexing="reindexing"
        :kb-indexing-files="kbIndexingFiles"
        :invalidated-file-ids="invalidatedFileIds"
        @dragenter="handleDragEnter"
        @dragleave="handleDragLeave"
        @dragover="handleDragOver"
        @drop="handleDrop"
        @add-files="handleAddFiles"
        @reindex="handleReindex"
        @unlink-file="(id) => handleUnlinkFile(id, handleReindex)"
      />
    </div>
    <div v-else class="sm-empty empty-kb">
      <h2>选择或创建知识库</h2>
      <p>从左侧选择一个知识库，开始管理文档、索引和检索实验。</p>
    </div>
  </main>
</template>
