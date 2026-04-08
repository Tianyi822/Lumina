<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import { useUIStateStore } from '@renderer/stores'
import { usePaperReaderStore } from '@renderer/stores/paperReaderStore'
import type { PaperTocItem } from '@renderer/stores/paperReaderStore'
import type { PaperFigureItem } from '@shared/types/paper'

const emit = defineEmits<{
  (e: 'open-settings'): void
}>()

const uiStateStore = useUIStateStore()
const { isCurrentSidebarCollapsed, isPaperView } = storeToRefs(uiStateStore)

const paperReaderStore = usePaperReaderStore()
const {
  currentPaper,
  currentPaperId,
  currentPaperFigures,
  figureLoadingByPaperId,
  paperTocItems,
  markdownLoading,
  showFigurePanel
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

const currentFigureLoading = computed(() => {
  if (!currentPaperId.value) {
    return false
  }

  return !!figureLoadingByPaperId.value[currentPaperId.value]
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

/** 论文文件名（去掉 .pdf 后缀） */
const paperFileName = computed(() => {
  const name = currentPaper.value?.fileName
  if (!name) return ''
  return name.replace(/\.pdf$/i, '')
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
  return figure.caption || figure.subCaption || '暂无图注'
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
    class="sm-workspace-toolbar"
    :class="{ 'sm-workspace-toolbar--avoid-window-controls': shouldAvoidMacWindowControls }"
  >
    <div class="sm-workspace-toolbar__controls">
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

          <div v-else-if="paperTocItems.length === 0" class="sm-workspace-toolbar__toc-state">
            未识别到可用目录
          </div>

          <div v-else class="sm-workspace-toolbar__toc-scroll">
            <ul class="sm-workspace-toolbar__toc-list">
              <li
                v-for="node in paperTocTree"
                :key="node.item.id"
                class="sm-workspace-toolbar__toc-node"
              >
                <button
                  class="sm-workspace-toolbar__toc-item"
                  :class="`sm-workspace-toolbar__toc-item--level-${node.item.level}`"
                  :title="node.item.text"
                  type="button"
                  @click="handleSelectTocItem(node.item.id)"
                >
                  {{ node.item.text }}
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
                      :title="child.item.text"
                      type="button"
                      @click="handleSelectTocItem(child.item.id)"
                    >
                      {{ child.item.text }}
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
                          :title="grandchild.item.text"
                          type="button"
                          @click="handleSelectTocItem(grandchild.item.id)"
                        >
                          {{ grandchild.item.text }}
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
                <div class="sm-workspace-toolbar__figure-page">
                  第 {{ figure.pageIndex + 1 }} 页
                </div>
                <div
                  class="sm-workspace-toolbar__figure-caption"
                  :title="getFigureItemLabel(figure)"
                >
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

    <div v-if="isPaperView && paperFileName" class="sm-workspace-toolbar__paper-file">
      <span class="sm-workspace-toolbar__paper-name" :title="paperFileName">
        {{ paperFileName }}
      </span>
    </div>

    <div class="sm-workspace-toolbar__balance-spacer" aria-hidden="true"></div>
  </div>
</template>

<style scoped>
.sm-workspace-toolbar {
  display: grid;
  grid-template-columns: minmax(max-content, 1fr) auto minmax(max-content, 1fr);
  align-items: center;
  column-gap: var(--sm-space-4);
  width: 100%;
  min-height: var(--sm-titlebar-height);
  margin-left: 0;
  transition: margin-left var(--sm-transition-medium);
  -webkit-app-region: drag;
}

.sm-workspace-toolbar--avoid-window-controls {
  margin-left: 84px;
}

.sm-workspace-toolbar__controls {
  display: inline-flex;
  align-items: center;
  gap: var(--sm-space-2);
  justify-self: start;
  -webkit-app-region: no-drag;
}

.sm-workspace-toolbar__button {
  width: 32px;
  height: 32px;
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

.sm-workspace-toolbar__button:hover:disabled {
  background: var(--sm-color-surface-2);
  border-color: var(--sm-color-border-default);
}

.sm-workspace-toolbar__toc {
  position: relative;
}

.sm-workspace-toolbar__toc-panel,
.sm-workspace-toolbar__figure-panel {
  position: absolute;
  top: calc(100% + var(--sm-space-2));
  left: 0;
  z-index: 20;
  width: 320px;
  max-width: min(320px, calc(100vw - 48px));
  padding: var(--sm-space-3);
  border: 1px solid var(--sm-color-border-default);
  border-radius: 12px;
  background: var(--sm-color-surface-2);
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.22);
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

.sm-workspace-toolbar__figures {
  position: relative;
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

.sm-workspace-toolbar__figure-page {
  color: var(--sm-color-text-tertiary);
  font-size: 11px;
  line-height: 1.4;
}

.sm-workspace-toolbar__figure-caption {
  margin-top: 4px;
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
  padding-left: var(--sm-space-2);
  border-left: 1px solid var(--sm-color-border-subtle);
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
  font-weight: 500;
}

.sm-workspace-toolbar__toc-item--level-3 {
  color: var(--sm-color-text-tertiary);
}

.sm-workspace-toolbar__paper-file {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  height: 100%;
  justify-self: center;
}

.sm-workspace-toolbar__paper-name {
  max-width: min(100%, 420px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--sm-color-text-primary);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.2;
  text-align: center;
}

.sm-workspace-toolbar__balance-spacer {
  min-width: 0;
}
</style>
