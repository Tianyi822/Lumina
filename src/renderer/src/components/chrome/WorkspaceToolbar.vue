<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useZustandStore } from '@renderer/composables/useZustandStore'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import { useUIStateStore } from '@renderer/stores'
import { usePaperReaderStore } from '@renderer/stores/paperReaderStore'
import type { PaperFigureItem, PaperTocEntry, PaperTocItem } from '@shared/types/paper'
import { hasPaperTranslationResult } from '@shared/utils/paperTranslation'
import styles from './WorkspaceToolbar.module.css'

const uiState = useZustandStore(useUIStateStore)

const paperReaderStore = useZustandStore(usePaperReaderStore)

// 状态属性（通过 computed 保持响应式）
const currentPaperId = computed(() => paperReaderStore.currentPaperId)
const figureLoadingByPaperId = computed(() => paperReaderStore.figureLoadingByPaperId)
const markdownLoading = computed(() => paperReaderStore.markdownLoading)
const originalPdfVisible = computed(() => paperReaderStore.originalPdfVisible)
const showFigurePanel = computed(() => paperReaderStore.showFigurePanel)
const translationVisible = computed(() => paperReaderStore.translationVisible)
const zoomPercent = computed(() => paperReaderStore.zoomPercent)
const paperTocTitle = computed(() => paperReaderStore.paperTocTitle)
const paperTocItems = computed(() => paperReaderStore.paperTocItems)

// Getter 函数（需要显式调用）
const currentPaperFigures = computed(() => paperReaderStore.currentPaperFigures())
const currentTranslationCache = computed(() => paperReaderStore.currentTranslationCache())
const figureCaptionTranslationMap = computed(() => paperReaderStore.figureCaptionTranslationMap())
const isOcrCompleted = computed(() => paperReaderStore.isOcrCompleted())
const isCurrentPaperTranslating = computed(() => paperReaderStore.isCurrentPaperTranslating())
const canZoomIn = computed(() => paperReaderStore.canZoomIn())
const canZoomOut = computed(() => paperReaderStore.canZoomOut())

interface PaperTocTreeNode {
  item: PaperTocItem
  children: PaperTocTreeNode[]
}

const tocContainerRef = ref<HTMLElement | null>(null)
const figureContainerRef = ref<HTMLElement | null>(null)
const figurePanelRef = ref<HTMLElement | null>(null)
const showTocPanel = ref(false)

const isPaperView = computed(() => uiState.isPaperView())
const isKnowledgeView = computed(() => uiState.isKnowledgeView())
const isCurrentSidebarCollapsed = computed(() => uiState.isCurrentSidebarCollapsed())
const paperChatPanelOpen = computed(() => uiState.paperChatPanelOpen)

const isPaperToolbar = computed(() => {
  return isPaperView.value && !!currentPaperId.value
})

const isKnowledgeToolbar = computed(() => {
  return isKnowledgeView.value
})

const canOpenToc = computed(() => {
  return !!currentPaperId.value
})

const canOpenFigurePanel = computed(() => {
  return !!currentPaperId.value
})

const canOpenPaperChat = computed(() => {
  return !!currentPaperId.value && isOcrCompleted.value
})

const hasTranslationCache = computed(() => {
  return hasPaperTranslationResult(currentTranslationCache.value)
})

const translationButtonTitle = computed(() => {
  if (translationVisible.value) {
    return isCurrentPaperTranslating.value ? '隐藏译文（后台继续翻译）' : '隐藏译文'
  }

  if (hasTranslationCache.value) {
    return isCurrentPaperTranslating.value ? '显示译文（后台正在翻译）' : '显示译文'
  }

  return isCurrentPaperTranslating.value ? '显示译文（后台正在翻译）' : '翻译论文'
})

const currentFigureLoading = computed(() => {
  if (!currentPaperId.value) {
    return false
  }

  return !!figureLoadingByPaperId.value[currentPaperId.value]
})

const hasAnyTocEntries = computed(() => {
  return !!paperTocTitle.value || paperTocItems.value.length > 0
})

const paperTocTree = computed<PaperTocTreeNode[]>(() => {
  const roots: PaperTocTreeNode[] = []
  let currentLevel1: PaperTocTreeNode | null = null
  let currentLevel2: PaperTocTreeNode | null = null

  for (const item of paperTocItems.value) {
    const node: PaperTocTreeNode = {
      item,
      children: []
    }

    if (item.level === 1) {
      roots.push(node)
      currentLevel1 = node
      currentLevel2 = null
      continue
    }

    if (item.level === 2) {
      if (currentLevel1) {
        currentLevel1.children.push(node)
      } else {
        roots.push(node)
      }

      currentLevel2 = node
      continue
    }

    if (currentLevel2) {
      currentLevel2.children.push(node)
    } else if (currentLevel1) {
      currentLevel1.children.push(node)
    } else {
      roots.push(node)
    }
  }

  return roots
})

function closeTocPanel(): void {
  showTocPanel.value = false
}

function closeFigurePanel(): void {
  paperReaderStore.closeFigurePanel()
}

function handleToggleOriginalPdf(): void {
  if (!currentPaperId.value) {
    return
  }

  closeTocPanel()
  closeFigurePanel()
  paperReaderStore.closeFigurePreview()
  paperReaderStore.toggleOriginalPdfVisible()
}

async function handleToggleTranslation(): Promise<void> {
  if (!currentPaperId.value) {
    return
  }

  closeTocPanel()
  closeFigurePanel()
  await paperReaderStore.toggleTranslationVisible()
}

function handleToggleToc(): void {
  if (!canOpenToc.value) {
    return
  }

  closeFigurePanel()
  showTocPanel.value = !showTocPanel.value
}

async function handleToggleFigurePanel(): Promise<void> {
  if (!canOpenFigurePanel.value) {
    return
  }

  closeTocPanel()
  await paperReaderStore.toggleFigurePanel()
}

function handleTogglePaperChat(): void {
  if (!canOpenPaperChat.value) {
    return
  }

  closeTocPanel()
  closeFigurePanel()
  uiState.togglePaperChatPanel()
}

function handleSelectTocItem(headingId: string): void {
  if (paperReaderStore.scrollToHeading(headingId)) {
    closeTocPanel()
  }
}

function getFigureItemLabel(figure: PaperFigureItem): string {
  if (translationVisible.value) {
    const translated = figureCaptionTranslationMap.value[figure.id]
    if (translated) return translated
  }
  return figure.caption || figure.subCaption || '暂无图注'
}

function getTocEntryDisplayText(entry: PaperTocEntry): string {
  if (translationVisible.value && entry.translatedText) {
    return entry.translatedText
  }
  return entry.text
}

function handlePreviewFigure(figure: PaperFigureItem): void {
  const panelRect = figurePanelRef.value?.getBoundingClientRect()

  paperReaderStore.openFigurePreview(figure, {
    initialRect: panelRect
      ? {
          left: panelRect.left,
          top: panelRect.top,
          width: panelRect.width
        }
      : undefined
  })
}

function handleClickOutside(event: MouseEvent): void {
  const target = event.target as Node

  if (showTocPanel.value && tocContainerRef.value && !tocContainerRef.value.contains(target)) {
    closeTocPanel()
  }

  if (
    showFigurePanel.value &&
    figureContainerRef.value &&
    !figureContainerRef.value.contains(target)
  ) {
    closeFigurePanel()
  }
}

function handleKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    if (showTocPanel.value) {
      closeTocPanel()
    }

    if (showFigurePanel.value) {
      closeFigurePanel()
    }
  }
}

watch(isPaperView, (value) => {
  if (!value) {
    closeTocPanel()
    closeFigurePanel()
  }
})

watch(currentPaperId, () => {
  closeTocPanel()
  closeFigurePanel()
})

watch(markdownLoading, (loading) => {
  if (loading) {
    closeTocPanel()
    closeFigurePanel()
  }
})

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  document.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <div
    :class="[
      styles['sm-workspace-toolbar__controls'],
      {
        [styles['sm-workspace-toolbar__controls--paper']]: isPaperToolbar,
        [styles['sm-workspace-toolbar__controls--knowledge']]:
          isKnowledgeToolbar && !isPaperToolbar,
        [styles['sm-workspace-toolbar__controls--chrome-safe']]:
          isPaperToolbar && isCurrentSidebarCollapsed
      }
    ]"
  >
    <template v-if="isPaperView && currentPaperId">
      <button
        :class="['sm-icon-button', styles['sm-workspace-toolbar__button']]"
        title="缩小"
        aria-label="缩小"
        :disabled="!canZoomOut"
        @click="paperReaderStore.zoomOut()"
      >
        <SvgIcon name="zoom-out" :size="14" />
      </button>
      <button
        :class="[
          'sm-icon-button',
          styles['sm-workspace-toolbar__button'],
          styles['sm-workspace-toolbar__zoom-display']
        ]"
        :title="`${zoomPercent}%`"
        aria-label="重置缩放"
        :disabled="zoomPercent === 100"
        @click="paperReaderStore.resetZoom()"
      >
        <span :class="styles['sm-workspace-toolbar__zoom-text']">{{ zoomPercent }}%</span>
      </button>
      <button
        :class="['sm-icon-button', styles['sm-workspace-toolbar__button']]"
        title="放大"
        aria-label="放大"
        :disabled="!canZoomIn"
        @click="paperReaderStore.zoomIn()"
      >
        <SvgIcon name="zoom-in" :size="14" />
      </button>
    </template>

    <button
      v-if="isPaperView && currentPaperId && !originalPdfVisible"
      :class="[
        'sm-icon-button',
        styles['sm-workspace-toolbar__button'],
        {
          [styles['is-active']]: translationVisible,
          [styles['is-pending']]: isCurrentPaperTranslating
        }
      ]"
      :title="translationButtonTitle"
      :aria-label="translationButtonTitle"
      @click="handleToggleTranslation"
    >
      <SvgIcon name="translate" :size="14" />
    </button>

    <div
      v-if="isPaperView && currentPaperId && !originalPdfVisible"
      ref="tocContainerRef"
      :class="styles['sm-workspace-toolbar__toc']"
    >
      <button
        :class="[
          'sm-icon-button',
          styles['sm-workspace-toolbar__button'],
          { [styles['is-active']]: showTocPanel }
        ]"
        title="论文目录"
        aria-label="打开论文目录"
        aria-haspopup="dialog"
        :aria-expanded="showTocPanel"
        :disabled="!canOpenToc"
        @click="handleToggleToc"
      >
        <SvgIcon name="toc" :size="14" />
      </button>

      <div
        v-if="showTocPanel"
        :class="styles['sm-workspace-toolbar__toc-panel']"
        role="dialog"
        aria-label="论文目录"
      >
        <div :class="styles['sm-workspace-toolbar__toc-header']">论文目录</div>

        <div v-if="markdownLoading" :class="styles['sm-workspace-toolbar__toc-state']">
          目录加载中
        </div>

        <div v-else-if="!hasAnyTocEntries" :class="styles['sm-workspace-toolbar__toc-state']">
          未识别到可用目录
        </div>

        <div v-else :class="styles['sm-workspace-toolbar__toc-scroll']">
          <button
            v-if="paperTocTitle"
            :class="styles['sm-workspace-toolbar__toc-title']"
            :title="getTocEntryDisplayText(paperTocTitle)"
            type="button"
            @click="handleSelectTocItem(paperTocTitle.id)"
          >
            {{ getTocEntryDisplayText(paperTocTitle) }}
          </button>

          <div
            v-if="paperTocTitle && paperTocItems.length > 0"
            :class="styles['sm-workspace-toolbar__toc-divider']"
            aria-hidden="true"
          />

          <ul v-if="paperTocItems.length > 0" :class="styles['sm-workspace-toolbar__toc-list']">
            <li
              v-for="node in paperTocTree"
              :key="node.item.id"
              :class="styles['sm-workspace-toolbar__toc-node']"
            >
              <button
                :class="[
                  styles['sm-workspace-toolbar__toc-item'],
                  styles[`sm-workspace-toolbar__toc-item--level-${node.item.level}`]
                ]"
                :title="getTocEntryDisplayText(node.item)"
                type="button"
                @click="handleSelectTocItem(node.item.id)"
              >
                {{ getTocEntryDisplayText(node.item) }}
              </button>

              <ul
                v-if="node.children.length > 0"
                :class="[
                  styles['sm-workspace-toolbar__toc-list'],
                  styles['sm-workspace-toolbar__toc-list--child']
                ]"
              >
                <li
                  v-for="child in node.children"
                  :key="child.item.id"
                  :class="styles['sm-workspace-toolbar__toc-node']"
                >
                  <button
                    :class="[
                      styles['sm-workspace-toolbar__toc-item'],
                      styles[`sm-workspace-toolbar__toc-item--level-${child.item.level}`]
                    ]"
                    :title="getTocEntryDisplayText(child.item)"
                    type="button"
                    @click="handleSelectTocItem(child.item.id)"
                  >
                    {{ getTocEntryDisplayText(child.item) }}
                  </button>

                  <ul
                    v-if="child.children.length > 0"
                    :class="[
                      styles['sm-workspace-toolbar__toc-list'],
                      styles['sm-workspace-toolbar__toc-list--child']
                    ]"
                  >
                    <li
                      v-for="grandchild in child.children"
                      :key="grandchild.item.id"
                      :class="styles['sm-workspace-toolbar__toc-node']"
                    >
                      <button
                        :class="[
                          styles['sm-workspace-toolbar__toc-item'],
                          styles[`sm-workspace-toolbar__toc-item--level-${grandchild.item.level}`]
                        ]"
                        :title="getTocEntryDisplayText(grandchild.item)"
                        type="button"
                        @click="handleSelectTocItem(grandchild.item.id)"
                      >
                        {{ getTocEntryDisplayText(grandchild.item) }}
                      </button>
                    </li>
                  </ul>
                </li>
              </ul>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <div
      v-if="isPaperView && currentPaperId && !originalPdfVisible"
      ref="figureContainerRef"
      :class="styles['sm-workspace-toolbar__figures']"
    >
      <button
        :class="[
          'sm-icon-button',
          styles['sm-workspace-toolbar__button'],
          { [styles['is-active']]: showFigurePanel }
        ]"
        title="论文图片"
        aria-label="打开论文图片列表"
        aria-haspopup="dialog"
        :aria-expanded="showFigurePanel"
        :disabled="!canOpenFigurePanel"
        @click="handleToggleFigurePanel"
      >
        <SvgIcon name="image" :size="14" />
      </button>

      <div
        v-if="showFigurePanel"
        ref="figurePanelRef"
        :class="styles['sm-workspace-toolbar__figure-panel']"
        role="dialog"
        aria-label="论文图片列表"
      >
        <div :class="styles['sm-workspace-toolbar__toc-header']">论文图片</div>

        <div v-if="currentFigureLoading" :class="styles['sm-workspace-toolbar__toc-state']">
          图片加载中
        </div>

        <div
          v-else-if="currentPaperFigures.length === 0"
          :class="styles['sm-workspace-toolbar__toc-state']"
        >
          未识别到可用图片
        </div>

        <div v-else :class="styles['sm-workspace-toolbar__figure-scroll']">
          <div
            v-for="figure in currentPaperFigures"
            :key="figure.id"
            :class="styles['sm-workspace-toolbar__figure-item']"
          >
            <img
              :src="figure.imagePath"
              :alt="getFigureItemLabel(figure)"
              :class="styles['sm-workspace-toolbar__figure-thumb']"
            />

            <div :class="styles['sm-workspace-toolbar__figure-copy']">
              <div
                :class="styles['sm-workspace-toolbar__figure-caption']"
                :title="getFigureItemLabel(figure)"
              >
                {{ getFigureItemLabel(figure) }}
              </div>
            </div>

            <button
              :class="styles['sm-workspace-toolbar__figure-preview']"
              type="button"
              @click="handlePreviewFigure(figure)"
            >
              预览
            </button>
          </div>
        </div>
      </div>
    </div>

    <button
      v-if="isPaperView && currentPaperId"
      :class="[
        'sm-icon-button',
        styles['sm-workspace-toolbar__button'],
        { [styles['is-active']]: originalPdfVisible }
      ]"
      title="PDF 原件"
      aria-label="PDF 原件"
      type="button"
      @click="handleToggleOriginalPdf"
    >
      <span :class="styles['sm-workspace-toolbar__original-text']">原</span>
    </button>

    <button
      v-if="isPaperView && canOpenPaperChat"
      :class="[
        'sm-icon-button',
        styles['sm-workspace-toolbar__button'],
        { [styles['is-active']]: paperChatPanelOpen }
      ]"
      title="聊天"
      aria-label="聊天"
      type="button"
      @click="handleTogglePaperChat"
    >
      <SvgIcon name="chat" :size="14" />
    </button>
  </div>
</template>
