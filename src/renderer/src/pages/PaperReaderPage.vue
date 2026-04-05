<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue'
import { storeToRefs } from 'pinia'
import { usePaperReaderStore } from '@renderer/stores/paperReaderStore'

// 子组件
import PaperMarkdownView from '@renderer/components/paper/PaperMarkdownView.vue'

const store = usePaperReaderStore()

// ==================== Store 状态解构 ====================

const {
  currentPaperId,
  markdownContent,
  markdownLoading,
  isOcrCompleted,
  paperBasePath
} = storeToRefs(store)

// ==================== 生命周期 ====================

onMounted(async () => {
  await store.loadPapers()

  // 如果已有选中论文且已完成 OCR，自动加载 Markdown
  if (currentPaperId.value && isOcrCompleted.value) {
    await store.loadMarkdown(currentPaperId.value)
  }
})

onBeforeUnmount(() => {
  store.cleanupOcrListener()
})
</script>

<template>
  <div class="paper-reader-page sm-workspace-view">
    <div
      class="paper-reader-page__main"
      :class="{ 'paper-reader-page__main--reader': isOcrCompleted }"
    >
      <!-- 已完成 OCR → Markdown 阅读视图 -->
      <PaperMarkdownView
        v-if="isOcrCompleted"
        :content="markdownContent"
        :loading="markdownLoading"
        :paper-id="currentPaperId || ''"
        :base-path="paperBasePath || undefined"
      />
    </div>
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
