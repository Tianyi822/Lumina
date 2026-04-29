<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useUIStateStore } from '@renderer/stores'
import type { ViewMode } from '@renderer/stores/uiStateStore'

const uiStateStore = useUIStateStore()
const { currentView, isKnowledgeView, isLabView, isPaperView } = storeToRefs(uiStateStore)

async function switchView(view: ViewMode): Promise<void> {
  if (currentView.value !== view) {
    await uiStateStore.setCurrentView(view)
  }
}
</script>

<template>
  <div class="sm-view-switcher" role="tablist" aria-label="工作区切换">
    <button
      class="sm-view-switcher__button"
      :class="{ 'is-active': isPaperView }"
      :aria-selected="isPaperView"
      @click="switchView('paper')"
    >
      论文
    </button>
    <button
      class="sm-view-switcher__button"
      :class="{ 'is-active': isKnowledgeView }"
      :aria-selected="isKnowledgeView"
      @click="switchView('knowledge')"
    >
      知识库
    </button>
    <button
      class="sm-view-switcher__button"
      :class="{ 'is-active': isLabView }"
      :aria-selected="isLabView"
      @click="switchView('lab')"
    >
      实验室
    </button>
  </div>
</template>

<style scoped>
.sm-view-switcher {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  background: var(--sm-color-surface-1);
  border: 1px solid var(--sm-color-border-default);
  border-radius: 10px;
  -webkit-app-region: no-drag;
}

.sm-view-switcher__button {
  min-width: 66px;
  height: 28px;
  padding: 0 14px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--sm-color-text-secondary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color var(--sm-transition-fast),
    border-color var(--sm-transition-fast),
    color var(--sm-transition-fast);
}

.sm-view-switcher__button:hover:not(.is-active) {
  background: var(--sm-color-surface-hover);
  color: var(--sm-color-text-primary);
}

.sm-view-switcher__button.is-active {
  background: var(--sm-color-surface-active);
  border-color: var(--sm-color-border-default);
  color: var(--sm-color-text-primary);
}

@media (max-width: 760px) {
  .sm-view-switcher__button {
    min-width: 66px;
    padding: 0 10px;
  }
}
</style>
