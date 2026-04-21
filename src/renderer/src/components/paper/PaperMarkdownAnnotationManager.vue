<script setup lang="ts">
import type { PaperAnnotation } from '@shared/types/paper'

interface AnnotationManagerActions {
  orphanAnnotations: PaperAnnotation[]
  rebindAnnotationId: string | null
  getAnnotationTypeLabel: (annotation: PaperAnnotation) => string
  getAnnotationStatusLabel: (annotation: PaperAnnotation) => string | null
  startRebind: (annotation: PaperAnnotation) => void
  scrollToSegment: (segmentStableId: string) => void
  handleDeleteAnnotation: (annotationId: string) => Promise<void>
  handleCancelComposer: () => void
}

defineProps<{
  actions: AnnotationManagerActions
}>()
</script>

<template>
  <section
    v-if="actions.orphanAnnotations.length > 0 || actions.rebindAnnotationId"
    class="paper-markdown-view__manager"
  >
    <div class="paper-markdown-view__manager-header">
      <div>
        <div class="paper-markdown-view__manager-title">异常标注管理</div>
        <p class="paper-markdown-view__manager-text">
          这里集中显示需要人工确认的标注。点击"手动重新绑定"后，直接在正文里重新选择对应文本即可。
        </p>
      </div>
      <button
        v-if="actions.rebindAnnotationId"
        class="sm-button sm-button--secondary"
        type="button"
        @click="actions.handleCancelComposer"
      >
        取消重绑
      </button>
    </div>

    <article
      v-for="annotation in actions.orphanAnnotations"
      :key="annotation.id"
      class="paper-markdown-view__manager-card"
      :class="{
        'paper-markdown-view__manager-card--active': actions.rebindAnnotationId === annotation.id
      }"
    >
      <div class="paper-markdown-view__manager-meta">
        <span class="paper-markdown-view__note-type">
          {{ actions.getAnnotationTypeLabel(annotation) }}
        </span>
        <span class="paper-markdown-view__note-status">
          {{ actions.getAnnotationStatusLabel(annotation) || '待人工处理' }}
        </span>
      </div>
      <div v-if="annotation.comment" class="paper-markdown-view__manager-comment">
        {{ annotation.comment }}
      </div>
      <div class="paper-markdown-view__manager-selection">
        {{ annotation.selectedTextSnapshot }}
      </div>
      <div class="paper-markdown-view__manager-actions">
        <button
          class="sm-button sm-button--secondary"
          type="button"
          @click="actions.startRebind(annotation)"
        >
          手动重新绑定
        </button>
        <button
          class="sm-button sm-button--secondary"
          type="button"
          @click="actions.scrollToSegment(annotation.semanticAnchor.segmentStableId)"
        >
          查看当前段落
        </button>
        <button
          class="sm-button sm-button--danger"
          type="button"
          @click="actions.handleDeleteAnnotation(annotation.id)"
        >
          删除标注
        </button>
      </div>
    </article>
  </section>
</template>

<style scoped>
.paper-markdown-view__manager {
  margin-bottom: var(--sm-space-4);
  border: 1px solid var(--sm-color-border-default);
  border-radius: 16px;
  background: var(--sm-color-surface-1);
  padding: var(--sm-space-4);
}

.paper-markdown-view__manager-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sm-space-3);
}

.paper-markdown-view__manager-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
}

.paper-markdown-view__manager-text {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--sm-color-text-secondary);
}

.paper-markdown-view__manager-card {
  margin-top: var(--sm-space-3);
  border: 1px solid var(--sm-color-border-default);
  border-radius: 14px;
  background: var(--sm-color-surface-2);
  padding: var(--sm-space-3);
}

.paper-markdown-view__manager-card--active {
  border-color: var(--sm-color-border-accent);
  background: color-mix(in srgb, var(--sm-color-accent-08) 68%, var(--sm-color-surface-2));
}

.paper-markdown-view__manager-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sm-space-2);
  align-items: center;
}

.paper-markdown-view__manager-comment {
  margin-top: var(--sm-space-2);
  font-size: 13px;
  line-height: 1.75;
  color: var(--sm-color-text-primary);
}

.paper-markdown-view__manager-selection {
  margin-top: var(--sm-space-2);
  font-size: 12px;
  line-height: 1.65;
  color: var(--sm-color-text-secondary);
}

.paper-markdown-view__manager-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sm-space-2);
  margin-top: var(--sm-space-3);
}

.paper-markdown-view__note-type,
.paper-markdown-view__note-status {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  line-height: 1.4;
}

.paper-markdown-view__note-type {
  background: var(--sm-color-accent-12);
  color: var(--sm-color-text-secondary);
}

.paper-markdown-view__note-status {
  background: color-mix(in srgb, var(--sm-color-status-warning) 18%, transparent);
  color: var(--sm-color-text-secondary);
}
</style>
