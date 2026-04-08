<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { usePaperReaderStore } from '@renderer/stores/paperReaderStore'
import PaperMarkdownView from '@renderer/components/paper/PaperMarkdownView.vue'
import PaperFigurePreview from '@renderer/components/paper/PaperFigurePreview.vue'

const store = usePaperReaderStore()

const {
  currentPaperId,
  markdownContent,
  markdownLoading,
  isOcrCompleted,
  paperBasePath,
  translationVisible,
  currentTranslationCache
} = storeToRefs(store)

onMounted(async () => {
  store.ensureOcrProgressListener()
  await store.loadPapers()

  if (currentPaperId.value && isOcrCompleted.value) {
    await store.loadMarkdown(currentPaperId.value)
  }
})

onBeforeUnmount(() => {
  store.resetFigureUiState()
})
</script>

<template>
  <div class="paper-reader-page sm-workspace-view">
    <div
      class="paper-reader-page__main"
      :class="{ 'paper-reader-page__main--reader': isOcrCompleted }"
    >
      <PaperMarkdownView
        v-if="isOcrCompleted"
        :content="markdownContent"
        :loading="markdownLoading"
        :paper-id="currentPaperId || ''"
        :base-path="paperBasePath || undefined"
        :translation-visible="translationVisible"
        :translation-cache="currentTranslationCache"
      />
    </div>

    <PaperFigurePreview />
  </div>
</template>

<style scoped>
.paper-reader-page {
  position: relative;
}

.paper-reader-page__main {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  overflow: auto;
  padding: var(--sm-space-5);
}

.paper-reader-page__main--reader {
  align-items: stretch;
  justify-content: stretch;
  overflow: hidden;
  padding: 0;
}
</style>
