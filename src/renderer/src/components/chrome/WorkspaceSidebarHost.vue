<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import SandboxList from '@renderer/components/sandbox/SandboxList.vue'
import WorkspaceSidebarChrome from '@renderer/components/chrome/WorkspaceSidebarChrome.vue'
import PaperSidebar from '@renderer/components/paper/PaperSidebar.vue'
import { getSidebarListItemMotionStyle } from '@renderer/utils/sidebarListMotion'
import { summarizeTranslationAnnotations } from '@shared/utils/paperTranslationAnnotations'
import {
  useKnowledgeStore,
  usePaperReaderStore,
  useSandboxStore,
  useUIStateStore
} from '@renderer/stores'
import { useNotification } from '@renderer/composables/useNotification'

const uiStateStore = useUIStateStore()
const knowledgeStore = useKnowledgeStore()
const sandboxStore = useSandboxStore()
const paperReaderStore = usePaperReaderStore()
const notify = useNotification()

const { currentView, isCurrentSidebarCollapsed } = storeToRefs(uiStateStore)
const { knowledgeBases, activeKbId } = storeToRefs(knowledgeStore)
const { currentSandbox, sandboxList, deleteConfirmState } = storeToRefs(sandboxStore)
const {
  papers,
  currentPaperId,
  renderProgressByPaperId,
  ocrProgressByPaperId,
  hasTranslationByPaperId
} = storeToRefs(paperReaderStore)

const knowledgeSearchQuery = ref('')
const sandboxSearchQuery = ref('')
const paperSearchQuery = ref('')
const isRefreshingSandboxList = ref(false)

const filteredKnowledgeBases = computed(() => {
  if (!knowledgeSearchQuery.value.trim()) {
    return knowledgeBases.value
  }

  const query = knowledgeSearchQuery.value.toLowerCase()
  return knowledgeBases.value.filter(
    (kb) =>
      kb.name.toLowerCase().includes(query) ||
      (kb.description && kb.description.toLowerCase().includes(query))
  )
})

const filteredSandboxs = computed(() => {
  if (!sandboxSearchQuery.value.trim()) {
    return sandboxList.value
  }

  const query = sandboxSearchQuery.value.toLowerCase()
  return sandboxList.value.filter((sandbox) => sandbox.name.toLowerCase().includes(query))
})

const filteredPapers = computed(() => {
  if (!paperSearchQuery.value.trim()) {
    return papers.value
  }

  const query = paperSearchQuery.value.toLowerCase()
  return papers.value.filter((paper) => paper.fileName.toLowerCase().includes(query))
})

const sidebarCount = computed(() => {
  if (currentView.value === 'paper') {
    return papers.value.length
  }

  if (currentView.value === 'knowledge') {
    return knowledgeBases.value.length
  }

  return sandboxList.value.length
})

const deletingSandboxId = computed(() => {
  return deleteConfirmState.value.isDeleting ? deleteConfirmState.value.sandboxId : null
})

function handleSelectKnowledgeBase(kbId: string): void {
  knowledgeStore.setActiveKb(kbId)
}

function handleCreateKnowledgeBase(): void {
  knowledgeStore.openCreateForm()
}

function handleManageKnowledgeFiles(): void {
  uiStateStore.openKnowledgeFileManager()
}

async function handleDeleteKnowledgeBase(kbId: string): Promise<void> {
  const confirmed = await notify.confirm('此操作不可撤销。', {
    title: '删除知识库',
    source: 'knowledge',
    danger: true
  })

  if (!confirmed) {
    return
  }

  const success = await knowledgeStore.deleteKnowledgeBase(kbId)
  if (!success) {
    notify.error('删除知识库失败', knowledgeStore.error || '未知错误', { source: 'knowledge' })
  }
}

function formatDocumentCount(linkedFileIds?: string[]): string {
  const count = linkedFileIds?.length || 0
  if (count === 0) return '0 个文档'
  if (count === 1) return '1 个文档'
  return `${count} 个文档`
}

function needsReindex(kb: { indexInvalidation?: { needsReindex?: boolean } }): boolean {
  return kb.indexInvalidation?.needsReindex === true
}

function handleOpenSandboxCreator(): void {
  uiStateStore.openSandboxCreator()
}

function handleOpenConfigManager(): void {
  uiStateStore.openConfigManager()
}

function handleSelectSandbox(sandboxId: string): void {
  void sandboxStore.handleSelectSandbox(sandboxId)
}

function handleDeleteSandbox(sandboxId: string): void {
  void sandboxStore.handleDeleteSandbox(sandboxId)
}

async function handleRefreshSandboxList(): Promise<void> {
  if (isRefreshingSandboxList.value) {
    return
  }

  isRefreshingSandboxList.value = true

  try {
    await sandboxStore.refreshSandboxList()

    if (currentSandbox.value?.sandboxId) {
      await sandboxStore.loadSandbox(currentSandbox.value.sandboxId, true)
    }
  } finally {
    isRefreshingSandboxList.value = false
  }
}

// ==================== 论文相关事件处理 ====================

async function handleSelectPaper(paperId: string): Promise<void> {
  const openedPaper = await paperReaderStore.openPaper(paperId)
  if (!openedPaper) {
    window.api.logger.warn('[WorkspaceSidebarHost] 打开论文失败', { paperId })
  }
}

async function handleUploadPdf(): Promise<void> {
  await paperReaderStore.uploadAndRenderPdf()
}

async function handleDeletePaper(paperId: string): Promise<void> {
  const confirmed = await notify.confirm('此操作不可撤销。', {
    title: '删除论文',
    source: 'paper',
    danger: true
  })

  if (!confirmed) {
    return
  }

  const success = await paperReaderStore.deletePaper(paperId)
  if (!success) {
    notify.error('删除论文失败', '请稍后重试或查看日志获取更多信息。', { source: 'paper' })
  }
}

async function handleRetryPaper(paperId: string): Promise<void> {
  const result = await paperReaderStore.retryPaper(paperId)
  if (!result.success) {
    notify.error('重试失败', result.error || '未知错误', { source: 'paper' })
  }
}

async function handleDeleteTranslation(paperId: string): Promise<void> {
  const cachedAnnotations = paperReaderStore.annotationsByPaperId[paperId]
  const annotations = cachedAnnotations ?? (await paperReaderStore.loadAnnotations(paperId))
  const translationSummary = summarizeTranslationAnnotations(annotations)

  if (translationSummary.totalCount > 0) {
    const confirmLines = [
      '当前译文里已经有标注内容。',
      `其中包含 ${translationSummary.totalCount} 条译文标注。`
    ]

    if (translationSummary.noteCount > 0) {
      confirmLines.push(`笔记 ${translationSummary.noteCount} 条`)
    }

    if (translationSummary.highlightCount > 0) {
      confirmLines.push(`标记 ${translationSummary.highlightCount} 条`)
    }

    confirmLines.push('删除译文后，这些译文标注也会一起删除。')
    confirmLines.push('确定继续删除译文吗？')

    const confirmed = await notify.confirm(confirmLines.join('\n'), {
      title: '删除译文',
      source: 'paper',
      danger: true
    })

    if (!confirmed) {
      return
    }
  }

  const result = await paperReaderStore.deleteTranslation(paperId)
  if (!result.success) {
    notify.error('删除译文失败', result.error || '未知错误', { source: 'paper' })
  }
}
</script>

<template>
  <div class="sm-sidebar-frame" :class="{ 'is-collapsed': isCurrentSidebarCollapsed }">
    <aside class="sm-sidebar-shell sm-workspace-sidebar-host">
      <WorkspaceSidebarChrome :count="sidebarCount" :actions-key="currentView">
        <template #actions>
          <template v-if="currentView === 'paper'">
            <button
              class="sm-button sm-button--primary sm-workspace-sidebar-host__action"
              @click="handleUploadPdf"
            >
              上传 PDF
            </button>
          </template>

          <template v-else-if="currentView === 'knowledge'">
            <button
              class="sm-button sm-button--primary sm-workspace-sidebar-host__action"
              @click="handleCreateKnowledgeBase"
            >
              新建知识库
            </button>
            <button
              class="sm-button sm-button--secondary sm-workspace-sidebar-host__action"
              @click="handleManageKnowledgeFiles"
            >
              管理文件
            </button>
          </template>

          <template v-else>
            <button
              class="sm-button sm-button--primary sm-workspace-sidebar-host__action"
              @click="handleOpenSandboxCreator"
            >
              新建沙箱
            </button>
            <button
              class="sm-button sm-button--secondary sm-workspace-sidebar-host__action"
              @click="handleOpenConfigManager"
            >
              管理配置
            </button>
          </template>
        </template>
      </WorkspaceSidebarChrome>

      <div class="sm-workspace-sidebar-host__viewport">
        <div class="sm-workspace-sidebar-host__panel">
          <Transition name="sm-sidebar-search-switch" mode="out-in" appear>
            <div
              :key="`search-${currentView}`"
              class="sm-sidebar-shell__search sm-workspace-sidebar-host__search"
            >
              <template v-if="currentView === 'paper'">
                <input
                  v-model="paperSearchQuery"
                  type="text"
                  class="sm-input"
                  placeholder="搜索论文"
                />
              </template>

              <template v-else-if="currentView === 'knowledge'">
                <input
                  v-model="knowledgeSearchQuery"
                  type="text"
                  class="sm-input"
                  placeholder="搜索知识库"
                />
              </template>

              <template v-else>
                <div class="sm-workspace-sidebar-host__search--sandbox">
                  <input
                    v-model="sandboxSearchQuery"
                    type="text"
                    class="sm-input"
                    placeholder="搜索沙箱"
                  />
                  <button
                    class="sm-icon-button sm-workspace-sidebar-host__refresh-button"
                    title="刷新列表"
                    :disabled="isRefreshingSandboxList"
                    @click="handleRefreshSandboxList"
                  >
                    <SvgIcon name="refresh" :size="14" :spin="isRefreshingSandboxList" />
                  </button>
                </div>
              </template>
            </div>
          </Transition>

          <Transition name="sm-sidebar-body-switch" mode="out-in" appear>
            <div
              :key="`body-${currentView}`"
              class="sm-sidebar-shell__body sm-sidebar-shell__body--flush sm-workspace-sidebar-host__body"
            >
              <template v-if="currentView === 'paper'">
                <PaperSidebar
                  :papers="filteredPapers"
                  :current-paper-id="currentPaperId"
                  :render-progress-by-paper-id="renderProgressByPaperId"
                  :ocr-progress-by-paper-id="ocrProgressByPaperId"
                  :has-translation-by-paper-id="hasTranslationByPaperId"
                  @select-paper="handleSelectPaper"
                  @upload-pdf="handleUploadPdf"
                  @delete-paper="handleDeletePaper"
                  @delete-translation="handleDeleteTranslation"
                  @retry-paper="handleRetryPaper"
                />
              </template>

              <template v-else-if="currentView === 'knowledge'">
                <div class="sm-workspace-sidebar-host__kb-list">
                  <TransitionGroup
                    v-if="filteredKnowledgeBases.length > 0"
                    name="sm-sidebar-list-item"
                    tag="div"
                    appear
                  >
                    <div
                      v-for="(kb, index) in filteredKnowledgeBases"
                      :key="kb.id"
                      :class="[
                        'sm-workspace-sidebar-host__kb-item',
                        { 'is-active': kb.id === activeKbId }
                      ]"
                      :style="getSidebarListItemMotionStyle(index)"
                      @click="handleSelectKnowledgeBase(kb.id)"
                    >
                      <div class="sm-workspace-sidebar-host__kb-icon">
                        {{ kb.name.charAt(0).toUpperCase() }}
                      </div>

                      <div class="sm-workspace-sidebar-host__kb-info">
                        <div class="sm-workspace-sidebar-host__kb-name-row">
                          <div class="sm-workspace-sidebar-host__kb-name">{{ kb.name }}</div>
                          <span v-if="needsReindex(kb)" class="sm-workspace-sidebar-host__kb-stale">
                            需重索引
                          </span>
                        </div>
                        <div class="sm-workspace-sidebar-host__kb-meta">
                          {{ formatDocumentCount(kb.linkedFileIds) }}
                        </div>
                      </div>

                      <button
                        class="sm-workspace-sidebar-host__kb-delete"
                        title="删除知识库"
                        @click.stop="handleDeleteKnowledgeBase(kb.id)"
                      >
                        <SvgIcon name="trash" :size="14" />
                      </button>
                    </div>
                  </TransitionGroup>

                  <div v-else class="sm-workspace-sidebar-host__empty">
                    <div class="sm-workspace-sidebar-host__empty-text">
                      {{ knowledgeSearchQuery ? '未找到匹配的知识库' : '暂无知识库' }}
                    </div>
                    <button
                      v-if="!knowledgeSearchQuery"
                      class="sm-button sm-button--secondary sm-button--small"
                      @click="handleCreateKnowledgeBase"
                    >
                      创建第一个知识库
                    </button>
                  </div>
                </div>
              </template>

              <template v-else>
                <SandboxList
                  :sandboxs="filteredSandboxs"
                  :active-sandbox-id="currentSandbox?.sandboxId"
                  :deleting-sandbox-id="deletingSandboxId"
                  @select="handleSelectSandbox"
                  @delete="handleDeleteSandbox"
                />
              </template>
            </div>
          </Transition>
        </div>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.sm-sidebar-frame {
  position: relative;
}

.sm-workspace-sidebar-host {
  position: relative;
}

.sm-workspace-sidebar-host__action {
  width: 100%;
  min-height: 36px;
}

.sm-workspace-sidebar-host__viewport {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.sm-workspace-sidebar-host__panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.sm-workspace-sidebar-host__search {
  display: flex;
}

.sm-workspace-sidebar-host__search--sandbox {
  display: flex;
  width: 100%;
  gap: 8px;
  align-items: center;
}

.sm-workspace-sidebar-host__search--sandbox .sm-input {
  flex: 1;
  min-width: 0;
}

.sm-workspace-sidebar-host__body {
  flex: 1;
  min-height: 0;
}

.sm-workspace-sidebar-host__body.sm-sidebar-body-switch-enter-active,
.sm-workspace-sidebar-host__body.sm-sidebar-body-switch-leave-active {
  transition: none;
}

.sm-workspace-sidebar-host__body.sm-sidebar-body-switch-enter-from,
.sm-workspace-sidebar-host__body.sm-sidebar-body-switch-leave-to,
.sm-workspace-sidebar-host__body.sm-sidebar-body-switch-enter-to,
.sm-workspace-sidebar-host__body.sm-sidebar-body-switch-leave-from {
  opacity: 1;
  transform: translateX(0);
}

.sm-workspace-sidebar-host__refresh-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  background: var(--sm-color-surface-2);
  border: 1px solid var(--sm-color-border-default);
  border-radius: 8px;
  color: var(--sm-color-text-secondary);
  flex-shrink: 0;
}

.sm-workspace-sidebar-host__refresh-button:hover:not(:disabled) {
  background-color: var(--sm-color-surface-hover);
  border-color: var(--sm-color-border-strong);
  color: var(--sm-color-text-primary);
}

.sm-workspace-sidebar-host__kb-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.sm-workspace-sidebar-host__kb-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  margin-bottom: 8px;
  border: 1px solid transparent;
  border-radius: 12px;
  cursor: pointer;
  position: relative;
  transition:
    background-color var(--sm-transition-fast),
    border-color var(--sm-transition-fast);
}

.sm-workspace-sidebar-host__kb-item:hover {
  background-color: var(--sm-color-surface-2);
  border-color: var(--sm-color-border-default);
}

.sm-workspace-sidebar-host__kb-item.is-active {
  background-color: var(--sm-color-surface-selected);
  border-color: var(--sm-color-border-selected);
}

.sm-workspace-sidebar-host__kb-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background-color: var(--sm-color-surface-2);
  border: 1px solid var(--sm-color-border-default);
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
}

.sm-workspace-sidebar-host__kb-info {
  flex: 1;
  min-width: 0;
}

.sm-workspace-sidebar-host__kb-name {
  flex: 1;
  min-width: 0;
  margin-bottom: 2px;
  font-size: 13px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sm-workspace-sidebar-host__kb-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.sm-workspace-sidebar-host__kb-stale {
  flex-shrink: 0;
  padding: 2px 6px;
  border: 1px solid rgba(213, 161, 74, 0.36);
  border-radius: var(--sm-radius-sm);
  background: rgba(213, 161, 74, 0.12);
  color: rgba(226, 181, 99, 0.95);
  font-size: 10px;
  line-height: 1.2;
}

.sm-workspace-sidebar-host__kb-meta {
  font-size: 11px;
  color: var(--sm-color-text-secondary);
}

.sm-workspace-sidebar-host__kb-delete {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--sm-color-text-tertiary);
  font-size: 12px;
  opacity: 0;
  cursor: pointer;
  transition: all 0.15s ease;
}

.sm-workspace-sidebar-host__kb-item:hover .sm-workspace-sidebar-host__kb-delete {
  opacity: 1;
}

.sm-workspace-sidebar-host__kb-delete:hover {
  background-color: rgba(199, 120, 120, 0.12);
  border-color: rgba(199, 120, 120, 0.28);
  color: rgba(199, 120, 120, 0.92);
}

.sm-workspace-sidebar-host__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
}

.sm-workspace-sidebar-host__empty-text {
  margin-bottom: 16px;
  font-size: 13px;
  color: var(--sm-color-text-secondary);
}
</style>
