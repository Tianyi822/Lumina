<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useZustandStore } from '@renderer/composables/useZustandStore'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import LabList from '@renderer/components/lab/LabList.vue'
import WorkspaceSidebarChrome from '@renderer/components/chrome/WorkspaceSidebarChrome.vue'
import PaperSidebar from '@renderer/components/paper/PaperSidebar.vue'
import { getSidebarListItemMotionStyle } from '@renderer/utils/sidebarListMotion'
import { summarizeTranslationAnnotations } from '@shared/utils/paperTranslationAnnotations'
import {
  useKnowledgeStore,
  usePaperReaderStore,
  useLabStore,
  useUIStateStore
} from '@renderer/stores'
import { useNotification } from '@renderer/composables/useNotification'
import styles from './WorkspaceSidebarHost.module.css'

const uiStateStore = useZustandStore(useUIStateStore)
const knowledgeStore = useZustandStore(useKnowledgeStore)
const labStore = useLabStore()
const paperReaderStore = usePaperReaderStore()
const notify = useNotification()

const currentView = computed(() => uiStateStore.currentView)
const isCurrentSidebarCollapsed = computed(() => uiStateStore.isCurrentSidebarCollapsed())
const { currentLab, labList, deleteConfirmState } = storeToRefs(labStore)
const {
  papers,
  currentPaperId,
  renderProgressByPaperId,
  ocrProgressByPaperId,
  hasTranslationByPaperId
} = storeToRefs(paperReaderStore)

const knowledgeSearchQuery = ref('')
const labSearchQuery = ref('')
const paperSearchQuery = ref('')
const isRefreshingLabList = ref(false)

const filteredKnowledgeBases = computed(() => {
  if (!knowledgeSearchQuery.value.trim()) {
    return knowledgeStore.knowledgeBases
  }

  const query = knowledgeSearchQuery.value.toLowerCase()
  return knowledgeStore.knowledgeBases.filter(
    (kb) =>
      kb.name.toLowerCase().includes(query) ||
      (kb.description && kb.description.toLowerCase().includes(query))
  )
})

const filteredLabs = computed(() => {
  if (!labSearchQuery.value.trim()) {
    return labList.value
  }

  const query = labSearchQuery.value.toLowerCase()
  return labList.value.filter((lab) => lab.name.toLowerCase().includes(query))
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
    return knowledgeStore.knowledgeBases.length
  }

  return labList.value.length
})

const deletingLabId = computed(() => {
  return deleteConfirmState.value.isDeleting ? deleteConfirmState.value.labId : null
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

function handleOpenLabCreator(): void {
  uiStateStore.openLabCreator()
}

function handleOpenConfigManager(): void {
  uiStateStore.openConfigManager()
}

function handleSelectLab(labId: string): void {
  void labStore.handleSelectLab(labId)
}

function handleDeleteLab(labId: string): void {
  void labStore.handleDeleteLab(labId)
}

async function handleRefreshLabList(): Promise<void> {
  if (isRefreshingLabList.value) {
    return
  }

  isRefreshingLabList.value = true

  try {
    await labStore.refreshLabList()

    if (currentLab.value?.labId) {
      await labStore.loadLab(currentLab.value.labId, true)
    }
  } finally {
    isRefreshingLabList.value = false
  }
}

let removeSshStatusListener: (() => void) | null = null

onMounted(() => {
  removeSshStatusListener = window.api.ssh.onConnectionStatus(() => {
    void labStore.refreshLabList()
  })
})

onBeforeUnmount(() => {
  removeSshStatusListener?.()
  removeSshStatusListener = null
})

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
  <div :class="[styles['sm-sidebar-frame'], { 'is-collapsed': isCurrentSidebarCollapsed }]">
    <aside :class="['sm-sidebar-shell', styles['sm-workspace-sidebar-host']]">
      <WorkspaceSidebarChrome :count="sidebarCount" :actions-key="currentView">
        <template #actions>
          <template v-if="currentView === 'paper'">
            <button
              :class="[
                'sm-button',
                'sm-button--primary',
                styles['sm-workspace-sidebar-host__action']
              ]"
              @click="handleUploadPdf"
            >
              上传 PDF
            </button>
          </template>

          <template v-else-if="currentView === 'knowledge'">
            <button
              :class="[
                'sm-button',
                'sm-button--primary',
                styles['sm-workspace-sidebar-host__action']
              ]"
              @click="handleCreateKnowledgeBase"
            >
              新建知识库
            </button>
            <button
              :class="[
                'sm-button',
                'sm-button--secondary',
                styles['sm-workspace-sidebar-host__action']
              ]"
              @click="handleManageKnowledgeFiles"
            >
              管理文件
            </button>
          </template>

          <template v-else>
            <button
              :class="[
                'sm-button',
                'sm-button--primary',
                styles['sm-workspace-sidebar-host__action']
              ]"
              @click="handleOpenLabCreator"
            >
              创建实验室
            </button>
            <button
              :class="[
                'sm-button',
                'sm-button--secondary',
                styles['sm-workspace-sidebar-host__action']
              ]"
              @click="handleOpenConfigManager"
            >
              管理配置
            </button>
          </template>
        </template>
      </WorkspaceSidebarChrome>

      <div :class="styles['sm-workspace-sidebar-host__viewport']">
        <div :class="styles['sm-workspace-sidebar-host__panel']">
          <Transition name="sm-sidebar-search-switch" mode="out-in" appear>
            <div
              :key="`search-${currentView}`"
              :class="['sm-sidebar-shell__search', styles['sm-workspace-sidebar-host__search']]"
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
                <div :class="styles['sm-workspace-sidebar-host__search--lab']">
                  <input
                    v-model="labSearchQuery"
                    type="text"
                    class="sm-input"
                    placeholder="搜索实验室"
                  />
                  <button
                    :class="['sm-icon-button', styles['sm-workspace-sidebar-host__refresh-button']]"
                    title="刷新列表"
                    :disabled="isRefreshingLabList"
                    @click="handleRefreshLabList"
                  >
                    <SvgIcon name="refresh" :size="14" :spin="isRefreshingLabList" />
                  </button>
                </div>
              </template>
            </div>
          </Transition>

          <Transition name="sm-sidebar-body-switch" mode="out-in" appear>
            <div
              :key="`body-${currentView}`"
              :class="[
                'sm-sidebar-shell__body',
                'sm-sidebar-shell__body--flush',
                styles['sm-workspace-sidebar-host__body']
              ]"
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
                <div :class="styles['sm-workspace-sidebar-host__kb-list']">
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
                        styles['sm-workspace-sidebar-host__kb-item'],
                        { [styles['is-active']]: kb.id === knowledgeStore.activeKbId }
                      ]"
                      :style="getSidebarListItemMotionStyle(index)"
                      @click="handleSelectKnowledgeBase(kb.id)"
                    >
                      <div :class="styles['sm-workspace-sidebar-host__kb-icon']">
                        {{ kb.name.charAt(0).toUpperCase() }}
                      </div>

                      <div :class="styles['sm-workspace-sidebar-host__kb-info']">
                        <div :class="styles['sm-workspace-sidebar-host__kb-name-row']">
                          <div :class="styles['sm-workspace-sidebar-host__kb-name']">
                            {{ kb.name }}
                          </div>
                          <span
                            v-if="needsReindex(kb)"
                            :class="styles['sm-workspace-sidebar-host__kb-stale']"
                          >
                            需重索引
                          </span>
                        </div>
                        <div :class="styles['sm-workspace-sidebar-host__kb-meta']">
                          {{ formatDocumentCount(kb.linkedFileIds) }}
                        </div>
                      </div>

                      <button
                        :class="styles['sm-workspace-sidebar-host__kb-delete']"
                        title="删除知识库"
                        @click.stop="handleDeleteKnowledgeBase(kb.id)"
                      >
                        <SvgIcon name="trash" :size="14" />
                      </button>
                    </div>
                  </TransitionGroup>

                  <div v-else :class="styles['sm-workspace-sidebar-host__empty']">
                    <div :class="styles['sm-workspace-sidebar-host__empty-text']">
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
                <LabList
                  :labs="filteredLabs"
                  :active-lab-id="currentLab?.labId"
                  :deleting-lab-id="deletingLabId"
                  @select="handleSelectLab"
                  @delete="handleDeleteLab"
                />
              </template>
            </div>
          </Transition>
        </div>
      </div>
    </aside>
  </div>
</template>
