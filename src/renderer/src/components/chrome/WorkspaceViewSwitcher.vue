<script setup lang="ts">
import { computed } from 'vue'
import { useZustandStore } from '@renderer/composables/useZustandStore'
import { useUIStateStore } from '@renderer/stores'
import type { ViewMode } from '@renderer/stores/uiStateStore'
import styles from './WorkspaceViewSwitcher.module.css'

const uiState = useZustandStore(useUIStateStore)
const currentView = computed(() => uiState.currentView)
const isKnowledgeView = computed(() => uiState.isKnowledgeView())
const isLabView = computed(() => uiState.isLabView())
const isPaperView = computed(() => uiState.isPaperView())

async function switchView(view: ViewMode): Promise<void> {
  if (currentView.value !== view) {
    await uiState.setCurrentView(view)
  }
}
</script>

<template>
  <div :class="styles['sm-view-switcher']" role="tablist" aria-label="工作区切换">
    <button
      :class="[styles['sm-view-switcher__button'], { [styles['is-active']]: isPaperView }]"
      :aria-selected="isPaperView"
      @click="switchView('paper')"
    >
      论文
    </button>
    <button
      :class="[styles['sm-view-switcher__button'], { [styles['is-active']]: isKnowledgeView }]"
      :aria-selected="isKnowledgeView"
      @click="switchView('knowledge')"
    >
      知识库
    </button>
    <button
      :class="[styles['sm-view-switcher__button'], { [styles['is-active']]: isLabView }]"
      :aria-selected="isLabView"
      @click="switchView('lab')"
    >
      实验室
    </button>
  </div>
</template>
