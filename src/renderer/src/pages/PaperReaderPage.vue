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
  currentAnnotations,
  currentReaderDocument,
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
      <div v-if="!currentPaperId" class="paper-reader-page__empty-state">
        <div class="sm-empty paper-reader-page__empty-card">
          <span class="paper-reader-page__empty-eyebrow">论文阅读</span>
          <h2>选择一篇论文开始阅读</h2>
          <p>从左侧列表中选择已有文献，或直接上传 PDF 开始阅读。</p>
          <button
            class="sm-button sm-button--primary"
            type="button"
            @click="store.uploadAndRenderPdf()"
          >
            上传 PDF
          </button>
        </div>
      </div>

      <PaperMarkdownView
        v-else-if="isOcrCompleted"
        :content="markdownContent"
        :loading="markdownLoading"
        :paper-id="currentPaperId || ''"
        :base-path="paperBasePath || undefined"
        :annotations="currentAnnotations"
        :reader-document="currentReaderDocument"
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

.paper-reader-page__empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--sm-space-6);
}

.paper-reader-page__empty-card {
  width: min(520px, 100%);
  background: var(--sm-color-surface-2);
  border-style: solid;
}

.paper-reader-page__empty-card .paper-reader-page__empty-eyebrow {
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--sm-color-text-tertiary);
}

.paper-reader-page__empty-card h2 {
  margin: 0;
  font-size: 18px;
  color: var(--sm-color-text-primary);
}

.paper-reader-page__empty-card p {
  margin: 0;
  max-width: 420px;
  line-height: 1.6;
}
</style>
