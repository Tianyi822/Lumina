<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import { useUIStateStore } from '@renderer/stores'
import { usePaperReaderStore } from '@renderer/stores/paperReaderStore'
import type { PaperFigureItem, PaperTocEntry, PaperTocItem } from '@shared/types/paper'
import { hasPaperTranslationResult } from '@shared/utils/paperTranslation'

const emit = defineEmits<{
  (e: 'open-settings'): void
}>()

const uiStateStore = useUIStateStore()
const { isCurrentSidebarCollapsed, isPaperView } = storeToRefs(uiStateStore)

const paperReaderStore = usePaperReaderStore()
const {
  currentPaperId,
  currentPaperFigures,
  currentTranslationCache,
  figureCaptionTranslationMap,
  figureLoadingByPaperId,
  isCurrentPaperTranslating,
  paperTocTitle,
  paperTocItems,
  markdownLoading,
  showFigurePanel,
  translationVisible
} = storeToRefs(paperReaderStore)

interface PaperTocTreeNode {
  item: PaperTocItem
  children: PaperTocTreeNode[]
}

const tocContainerRef = ref<HTMLElement | null>(null)
const figureContainerRef = ref<HTMLElement | null>(null)
const showTocPanel = ref(false)

const shouldAvoidMacWindowControls = computed(() => {
  return window.electron?.process?.platform === 'darwin' && isCurrentSidebarCollapsed.value
})

const canOpenToc = computed(() => {
  return !!currentPaperId.value
})

const canOpenFigurePanel = computed(() => {
  return !!currentPaperId.value
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

function handleOpenSettings(): void {
  emit('open-settings')
}

function closeTocPanel(): void {
  showTocPanel.value = false
}

function closeFigurePanel(): void {
  paperReaderStore.closeFigurePanel()
}

function handleToggleSidebar(): void {
  uiStateStore.toggleCurrentSidebar()
}

/** 刷新论文 Markdown 内容 */
function handleRefreshMarkdown(): void {
  closeTocPanel()
  closeFigurePanel()

  if (currentPaperId.value) {
    paperReaderStore.loadMarkdown(currentPaperId.value)
  }
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
  paperReaderStore.openFigurePreview(figure)
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
    class="sm-workspace-toolbar__controls"
    :class="{
      'sm-workspace-toolbar__controls--avoid-window-controls': shouldAvoidMacWindowControls
    }"
  >
    <button
      class="sm-icon-button sm-workspace-toolbar__button"
      title="设置"
      aria-label="打开设置"
      @click="handleOpenSettings"
    >
      <SvgIcon name="settings" :size="14" />
    </button>

    <button
      class="sm-icon-button sm-workspace-toolbar__button"
      :title="isCurrentSidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'"
      :aria-label="isCurrentSidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'"
      @click="handleToggleSidebar"
    >
      <SvgIcon name="sidebar-toggle" :size="14" />
    </button>

    <button
      v-if="isPaperView"
      class="sm-icon-button sm-workspace-toolbar__button"
      title="刷新内容"
      aria-label="刷新论文内容"
      @click="handleRefreshMarkdown"
    >
      <SvgIcon name="refresh" :size="14" />
    </button>

    <button
      v-if="isPaperView"
      class="sm-icon-button sm-workspace-toolbar__button"
      :class="{
        'is-active': translationVisible,
        'is-pending': isCurrentPaperTranslating
      }"
      :title="translationButtonTitle"
      :aria-label="translationButtonTitle"
      :disabled="!currentPaperId"
      @click="handleToggleTranslation"
    >
      <SvgIcon name="translate" :size="14" />
    </button>

    <div v-if="isPaperView" ref="tocContainerRef" class="sm-workspace-toolbar__toc">
      <button
        class="sm-icon-button sm-workspace-toolbar__button"
        :class="{ 'is-active': showTocPanel }"
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
        class="sm-workspace-toolbar__toc-panel"
        role="dialog"
        aria-label="论文目录"
      >
        <div class="sm-workspace-toolbar__toc-header">论文目录</div>

        <div v-if="markdownLoading" class="sm-workspace-toolbar__toc-state">目录加载中</div>

        <div v-else-if="!hasAnyTocEntries" class="sm-workspace-toolbar__toc-state">
          未识别到可用目录
        </div>

        <div v-else class="sm-workspace-toolbar__toc-scroll">
          <button
            v-if="paperTocTitle"
            class="sm-workspace-toolbar__toc-title"
            :title="getTocEntryDisplayText(paperTocTitle)"
            type="button"
            @click="handleSelectTocItem(paperTocTitle.id)"
          >
            {{ getTocEntryDisplayText(paperTocTitle) }}
          </button>

          <div
            v-if="paperTocTitle && paperTocItems.length > 0"
            class="sm-workspace-toolbar__toc-divider"
            aria-hidden="true"
          />

          <ul v-if="paperTocItems.length > 0" class="sm-workspace-toolbar__toc-list">
            <li
              v-for="node in paperTocTree"
              :key="node.item.id"
              class="sm-workspace-toolbar__toc-node"
            >
              <button
                class="sm-workspace-toolbar__toc-item"
                :class="`sm-workspace-toolbar__toc-item--level-${node.item.level}`"
                :title="getTocEntryDisplayText(node.item)"
                type="button"
                @click="handleSelectTocItem(node.item.id)"
              >
                {{ getTocEntryDisplayText(node.item) }}
              </button>

              <ul
                v-if="node.children.length > 0"
                class="sm-workspace-toolbar__toc-list sm-workspace-toolbar__toc-list--child"
              >
                <li
                  v-for="child in node.children"
                  :key="child.item.id"
                  class="sm-workspace-toolbar__toc-node"
                >
                  <button
                    class="sm-workspace-toolbar__toc-item"
                    :class="`sm-workspace-toolbar__toc-item--level-${child.item.level}`"
                    :title="getTocEntryDisplayText(child.item)"
                    type="button"
                    @click="handleSelectTocItem(child.item.id)"
                  >
                    {{ getTocEntryDisplayText(child.item) }}
                  </button>

                  <ul
                    v-if="child.children.length > 0"
                    class="sm-workspace-toolbar__toc-list sm-workspace-toolbar__toc-list--child"
                  >
                    <li
                      v-for="grandchild in child.children"
                      :key="grandchild.item.id"
                      class="sm-workspace-toolbar__toc-node"
                    >
                      <button
                        class="sm-workspace-toolbar__toc-item"
                        :class="`sm-workspace-toolbar__toc-item--level-${grandchild.item.level}`"
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

    <div v-if="isPaperView" ref="figureContainerRef" class="sm-workspace-toolbar__figures">
      <button
        class="sm-icon-button sm-workspace-toolbar__button"
        :class="{ 'is-active': showFigurePanel }"
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
        class="sm-workspace-toolbar__figure-panel"
        role="dialog"
        aria-label="论文图片列表"
      >
        <div class="sm-workspace-toolbar__toc-header">论文图片</div>

        <div v-if="currentFigureLoading" class="sm-workspace-toolbar__toc-state">图片加载中</div>

        <div v-else-if="currentPaperFigures.length === 0" class="sm-workspace-toolbar__toc-state">
          未识别到可用图片
        </div>

        <div v-else class="sm-workspace-toolbar__figure-scroll">
          <div
            v-for="figure in currentPaperFigures"
            :key="figure.id"
            class="sm-workspace-toolbar__figure-item"
          >
            <img
              :src="figure.imagePath"
              :alt="getFigureItemLabel(figure)"
              class="sm-workspace-toolbar__figure-thumb"
            />

            <div class="sm-workspace-toolbar__figure-copy">
              <div class="sm-workspace-toolbar__figure-caption" :title="getFigureItemLabel(figure)">
                {{ getFigureItemLabel(figure) }}
              </div>
            </div>

            <button
              class="sm-workspace-toolbar__figure-preview"
              type="button"
              @click="handlePreviewFigure(figure)"
            >
              预览
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sm-workspace-toolbar__controls {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 4;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--sm-space-2);
  width: max-content;
  margin-left: 0;
  transition:
    top var(--sm-transition-medium),
    left var(--sm-transition-medium);
  -webkit-app-region: drag;
  user-select: none;
}

.sm-workspace-toolbar__controls--avoid-window-controls {
  left: calc(24px - var(--sm-space-3));
  top: var(--sm-titlebar-height);
}

.sm-workspace-toolbar__button {
  width: 30px;
  height: 30px;
  border-color: var(--sm-color-border-default);
  background: var(--sm-color-surface-2);
  -webkit-app-region: no-drag;
}

.sm-workspace-toolbar__button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.sm-workspace-toolbar__button.is-active,
.sm-workspace-toolbar__button:hover {
  background: var(--sm-color-surface-hover);
  border-color: var(--sm-color-border-strong);
}

.sm-workspace-toolbar__button.is-pending {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--sm-color-accent-default) 14%, transparent);
}

.sm-workspace-toolbar__button:hover:disabled {
  background: var(--sm-color-surface-2);
  border-color: var(--sm-color-border-default);
}

.sm-workspace-toolbar__toc {
  position: relative;
  -webkit-app-region: no-drag;
}

.sm-workspace-toolbar__toc-panel,
.sm-workspace-toolbar__figure-panel {
  position: absolute;
  top: 0;
  left: calc(100% + var(--sm-space-2));
  z-index: 20;
  width: 320px;
  max-width: min(320px, calc(100vw - 48px));
  padding: var(--sm-space-3);
  border: 1px solid var(--sm-color-border-default);
  border-radius: 12px;
  background: var(--sm-color-surface-2);
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.22);
}

.sm-workspace-toolbar__toc-panel {
  --sm-paper-toc-tree-indent: var(--sm-space-4);
}

.sm-workspace-toolbar__toc-header {
  margin-bottom: var(--sm-space-2);
  color: var(--sm-color-text-primary);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
}

.sm-workspace-toolbar__toc-state {
  padding: var(--sm-space-3) 0;
  color: var(--sm-color-text-tertiary);
  font-size: 12px;
  line-height: 1.6;
}

.sm-workspace-toolbar__toc-scroll {
  max-height: 360px;
  overflow-y: auto;
}

.sm-workspace-toolbar__toc-title {
  display: block;
  width: 100%;
  padding: 4px 0 0;
  border: none;
  background: transparent;
  color: var(--sm-color-text-primary);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.45;
  text-align: left;
  cursor: pointer;
}

.sm-workspace-toolbar__toc-title:hover {
  color: var(--sm-color-text-primary);
  opacity: 0.9;
}

.sm-workspace-toolbar__toc-divider {
  height: 1px;
  margin: var(--sm-space-3) 0 var(--sm-space-2);
  background: var(--sm-color-border-subtle);
}

.sm-workspace-toolbar__figures {
  position: relative;
  -webkit-app-region: no-drag;
}

.sm-workspace-toolbar__figure-panel {
  width: 380px;
  max-width: min(380px, calc(100vw - 48px));
}

.sm-workspace-toolbar__figure-scroll {
  max-height: 420px;
  overflow-y: auto;
}

.sm-workspace-toolbar__figure-item {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--sm-space-3);
  padding: var(--sm-space-2) 0;
}

.sm-workspace-toolbar__figure-item + .sm-workspace-toolbar__figure-item {
  border-top: 1px solid var(--sm-color-border-subtle);
}

.sm-workspace-toolbar__figure-thumb {
  width: 64px;
  height: 64px;
  border: 1px solid var(--sm-color-border-default);
  border-radius: 10px;
  background: var(--sm-color-surface-1);
  object-fit: cover;
}

.sm-workspace-toolbar__figure-copy {
  min-width: 0;
}

.sm-workspace-toolbar__figure-caption {
  color: var(--sm-color-text-secondary);
  font-size: 12px;
  line-height: 1.5;
  display: -webkit-box;
  overflow: hidden;
  text-overflow: ellipsis;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

.sm-workspace-toolbar__figure-preview {
  border: 1px solid var(--sm-color-border-default);
  border-radius: 8px;
  background: var(--sm-color-surface-1);
  color: var(--sm-color-text-primary);
  font-size: 12px;
  line-height: 1;
  padding: 8px 12px;
  cursor: pointer;
  transition:
    background-color var(--sm-transition-fast),
    border-color var(--sm-transition-fast);
}

.sm-workspace-toolbar__figure-preview:hover {
  background: var(--sm-color-surface-hover);
  border-color: var(--sm-color-border-strong);
}

.sm-workspace-toolbar__toc-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.sm-workspace-toolbar__toc-list--child {
  margin-top: var(--sm-space-1);
  margin-left: var(--sm-space-2);
  padding-left: var(--sm-paper-toc-tree-indent);
  border-left: 1px solid var(--sm-color-border-subtle);
}

.sm-workspace-toolbar__toc-node {
  position: relative;
}

.sm-workspace-toolbar__toc-list--child > .sm-workspace-toolbar__toc-node::before {
  content: '';
  position: absolute;
  left: calc(var(--sm-paper-toc-tree-indent) * -1);
  top: 15px;
  width: calc(var(--sm-paper-toc-tree-indent) - var(--sm-space-2));
  height: 1px;
  background: var(--sm-color-border-subtle);
}

.sm-workspace-toolbar__toc-list--child > .sm-workspace-toolbar__toc-node::after {
  content: '';
  position: absolute;
  left: calc(var(--sm-paper-toc-tree-indent) * -1 + var(--sm-space-2) - 2px);
  top: 12px;
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: var(--sm-color-border-strong);
}

.sm-workspace-toolbar__toc-node + .sm-workspace-toolbar__toc-node {
  margin-top: 2px;
}

.sm-workspace-toolbar__toc-item {
  display: block;
  width: 100%;
  padding: 6px 8px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--sm-color-text-secondary);
  font-size: 12px;
  line-height: 1.5;
  text-align: left;
  cursor: pointer;
  transition:
    background-color var(--sm-transition-fast),
    color var(--sm-transition-fast);
}

.sm-workspace-toolbar__toc-item:hover {
  background: var(--sm-color-surface-hover);
  color: var(--sm-color-text-primary);
}

.sm-workspace-toolbar__toc-item--level-1 {
  font-size: 12px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
}

.sm-workspace-toolbar__toc-item--level-2 {
  padding-left: 10px;
  font-weight: 500;
}

.sm-workspace-toolbar__toc-item--level-3 {
  padding-left: 12px;
  color: var(--sm-color-text-tertiary);
}
</style>
