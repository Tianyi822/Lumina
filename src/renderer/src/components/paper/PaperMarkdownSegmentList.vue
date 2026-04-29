<script setup lang="ts">
import { ref } from 'vue'
import type { RenderedSegment } from './composables/usePaperMarkdownEngine'

defineProps<{
  segments: RenderedSegment[]
}>()

const emit = defineEmits<{
  (e: 'retranslate', params: { segmentId: string; stableId: string }): void
}>()

const confirmDialog = ref<{
  segmentId: string
  stableId: string
} | null>(null)

function handleRetranslateClick(segment: RenderedSegment): void {
  if (segment.translationStatus === 'translating') {
    return
  }

  if (segment.annotations.length > 0) {
    confirmDialog.value = { segmentId: segment.renderId, stableId: segment.stableId }
    return
  }

  emit('retranslate', { segmentId: segment.renderId, stableId: segment.stableId })
}

function handleConfirmRetranslate(): void {
  if (!confirmDialog.value) {
    return
  }

  emit('retranslate', confirmDialog.value)
  confirmDialog.value = null
}

function handleCancelRetranslate(): void {
  confirmDialog.value = null
}
</script>

<template>
  <section
    v-for="segment in segments"
    :id="segment.segmentAnchorId"
    :key="segment.renderId"
    class="paper-markdown-view__segment"
    :class="{ 'paper-markdown-view__segment--meta': segment.isCenteredMeta }"
    :data-paper-segment-stable-id="segment.stableId"
  >
    <div
      class="paper-markdown-view__segment-original paper-markdown-view__markdown"
      data-paper-selection-surface="true"
      data-view-kind="original"
      :data-segment-stable-id="segment.stableId"
    >
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div v-html="segment.originalHtml" />
    </div>

    <div
      v-if="segment.showTranslation"
      class="paper-markdown-view__segment-translation"
      :class="`is-${segment.translationStatus}`"
    >
      <div
        v-if="segment.translationHtml"
        class="paper-markdown-view__segment-translation-body paper-markdown-view__markdown"
        data-paper-selection-surface="true"
        data-view-kind="translation"
        :data-segment-stable-id="segment.stableId"
      >
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div v-html="segment.translationHtml" />
        <button
          class="paper-markdown-view__retranslate-btn"
          type="button"
          :disabled="segment.translationStatus === 'translating'"
          title="重新翻译"
          @click.stop="handleRetranslateClick(segment)"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
          <span>重新翻译</span>
        </button>
      </div>

      <template v-else>
        <div
          v-if="segment.translationStatus === 'failed'"
          class="paper-markdown-view__translation-error"
        >
          该段翻译暂时失败，再次点击翻译按钮时会继续补全剩余内容。
        </div>

        <div v-else class="paper-markdown-view__translation-placeholder" aria-hidden="true">
          <span class="paper-markdown-view__translation-placeholder-text">正在翻译...</span>
          <span class="paper-markdown-view__translation-placeholder-bar" />
          <span class="paper-markdown-view__translation-placeholder-bar" />
          <span class="paper-markdown-view__translation-placeholder-bar" />
        </div>

        <button
          class="paper-markdown-view__retranslate-btn"
          type="button"
          :disabled="segment.translationStatus === 'translating'"
          title="重新翻译"
          @click.stop="handleRetranslateClick(segment)"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
          <span>重新翻译</span>
        </button>
      </template>
    </div>
  </section>

  <Teleport to="body">
    <div
      v-if="confirmDialog"
      class="paper-retranslate-overlay"
      @click.self="handleCancelRetranslate"
    >
      <div class="paper-retranslate-dialog">
        <div class="paper-retranslate-dialog__title">重新翻译</div>
        <div class="paper-retranslate-dialog__body">
          该段落存在批注或笔记，重新翻译可能导致标记失效或位置偏移。是否继续？
        </div>
        <div class="paper-retranslate-dialog__actions">
          <button
            class="paper-retranslate-dialog__btn paper-retranslate-dialog__btn--cancel"
            type="button"
            @click="handleCancelRetranslate"
          >
            取消
          </button>
          <button
            class="paper-retranslate-dialog__btn paper-retranslate-dialog__btn--confirm"
            type="button"
            @click="handleConfirmRetranslate"
          >
            继续翻译
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.paper-markdown-view__segment {
  position: relative;
}

.paper-markdown-view__segment + .paper-markdown-view__segment {
  margin-top: var(--sm-space-3);
}

.paper-markdown-view__segment-original,
.paper-markdown-view__segment-translation {
  box-sizing: border-box;
}

.paper-markdown-view__segment-translation {
  margin-top: var(--sm-space-2);
  position: relative;
}

.paper-markdown-view__segment-translation.is-queued,
.paper-markdown-view__segment-translation.is-translating {
  opacity: 0.9;
}

.paper-markdown-view__translation-error {
  color: var(--sm-color-text-secondary);
  font-size: 13px;
  line-height: 1.7;
}

.paper-markdown-view__translation-placeholder {
  display: grid;
  gap: var(--sm-space-2);
  padding: var(--sm-space-1) 0;
}

.paper-markdown-view__translation-placeholder-text {
  display: block;
  font-size: 13px;
  color: var(--sm-color-text-tertiary);
  margin-bottom: var(--sm-space-1);
}

.paper-markdown-view__translation-placeholder-bar {
  display: block;
  width: 100%;
  height: 12px;
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--sm-color-border-subtle) 65%, transparent) 0%,
    color-mix(in srgb, var(--sm-color-text-tertiary) 16%, transparent) 50%,
    color-mix(in srgb, var(--sm-color-border-subtle) 65%, transparent) 100%
  );
  background-size: 180% 100%;
  animation: paper-translation-breathe 1.8s ease-in-out infinite;
}

.paper-markdown-view__translation-placeholder-bar:nth-child(2) {
  width: 92%;
  animation-delay: 0.12s;
}

.paper-markdown-view__translation-placeholder-bar:nth-child(3) {
  width: 78%;
  animation-delay: 0.24s;
}

.paper-markdown-view__retranslate-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border: none;
  border-radius: var(--sm-radius-sm);
  background: transparent;
  color: var(--sm-color-text-tertiary);
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  opacity: 0;
  transition:
    opacity 0.2s ease,
    color 0.15s ease,
    background-color 0.15s ease;
  vertical-align: baseline;
}

.paper-markdown-view__segment-translation:hover > .paper-markdown-view__retranslate-btn,
.paper-markdown-view__segment-translation-body:hover > .paper-markdown-view__retranslate-btn {
  opacity: 1;
}

.paper-markdown-view__retranslate-btn:hover:not(:disabled) {
  color: var(--sm-color-text-secondary);
  background: color-mix(in srgb, var(--sm-color-surface-hover) 90%, transparent);
}

.paper-markdown-view__retranslate-btn:disabled {
  cursor: not-allowed;
  opacity: 0;
}

.paper-markdown-view__markdown {
  width: 100%;
  font-size: 15px;
  line-height: 1.75;
  color: var(--sm-color-text-primary);
  user-select: text;
  box-sizing: border-box;
  overflow-x: hidden;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.paper-markdown-view__segment-translation-body {
  width: 100%;
}

.paper-markdown-view__segment--meta .paper-markdown-view__markdown {
  text-align: center;
}

.paper-markdown-view__markdown > :first-child {
  margin-top: 0;
}

.paper-markdown-view__markdown > :last-child {
  margin-bottom: 0;
}

.paper-markdown-view__markdown :deep(mark.paper-annotation-highlight) {
  border-radius: 4px;
  color: var(--sm-color-paper-annotation-text);
  padding: 0 1px;
  cursor: pointer;
  box-shadow: inset 0 0 0 1px var(--sm-color-paper-annotation-border);
  mix-blend-mode: normal;
  transition:
    background-color 0.16s ease,
    box-shadow 0.16s ease,
    color 0.16s ease;
}

.paper-markdown-view__markdown :deep(mark.paper-annotation-highlight:hover) {
  box-shadow:
    inset 0 0 0 1px var(--sm-color-paper-annotation-border-hover),
    0 0 0 2px var(--sm-color-paper-annotation-active-ring);
}

.paper-markdown-view__markdown :deep(mark.paper-annotation-highlight:active) {
  box-shadow:
    inset 0 0 0 1px var(--sm-color-paper-annotation-border-hover),
    0 0 0 3px var(--sm-color-paper-annotation-active-ring);
}

.paper-markdown-view__markdown :deep(mark.paper-annotation-highlight--locating) {
  animation: paper-annotation-locate 8s ease-out;
}

.paper-markdown-view__markdown :deep(mark.paper-annotation-highlight *) {
  color: inherit;
}

@keyframes paper-annotation-locate {
  0% {
    box-shadow:
      inset 0 0 0 1px var(--sm-color-paper-annotation-border-hover),
      0 0 0 4px var(--sm-color-paper-annotation-active-ring);
  }

  45% {
    box-shadow:
      inset 0 0 0 1px var(--sm-color-paper-annotation-border-hover),
      0 0 0 7px var(--sm-color-paper-annotation-active-ring);
  }

  100% {
    box-shadow:
      inset 0 0 0 1px var(--sm-color-paper-annotation-border),
      0 0 0 0 transparent;
  }
}

.paper-markdown-view__markdown :deep(mark.paper-annotation-highlight--blue) {
  background: var(--sm-color-paper-annotation-blue);
}

.paper-markdown-view__markdown :deep(mark.paper-annotation-highlight--yellow) {
  background: var(--sm-color-paper-annotation-yellow);
}

.paper-markdown-view__markdown :deep(mark.paper-annotation-highlight--orange) {
  background: var(--sm-color-paper-annotation-orange);
}

.paper-markdown-view__markdown :deep(mark.paper-annotation-highlight--green) {
  background: var(--sm-color-paper-annotation-green);
}

.paper-markdown-view__markdown :deep(h1) {
  font-size: 24px;
  font-weight: 700;
  line-height: 1.3;
  margin: 1.2em 0 0.6em;
  color: var(--sm-color-text-primary);
}

.paper-markdown-view__markdown :deep(h2) {
  font-size: 20px;
  font-weight: 600;
  line-height: 1.35;
  margin: 1.1em 0 0.55em;
  color: var(--sm-color-text-primary);
}

.paper-markdown-view__markdown :deep(h3) {
  font-size: 17px;
  font-weight: 600;
  line-height: 1.4;
  margin: 1em 0 0.5em;
  color: var(--sm-color-text-primary);
}

.paper-markdown-view__markdown :deep(p) {
  margin: 0.8em 0;
}

.paper-markdown-view__markdown :deep(a) {
  color: var(--sm-color-accent-hover);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.paper-markdown-view__markdown :deep(a:hover) {
  opacity: 0.85;
}

.paper-markdown-view__markdown :deep(eq) {
  display: inline-block;
  vertical-align: baseline;
}

.paper-markdown-view__markdown :deep(eqn) {
  display: block;
}

.paper-markdown-view__markdown :deep(.katex) {
  font-size: 1em;
}

.paper-markdown-view__markdown :deep(.katex-display) {
  margin: 1.25em 0;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 0.2em 0;
}

.paper-markdown-view__markdown :deep(.katex-display > .katex) {
  display: inline-block;
  min-width: min-content;
}

.paper-markdown-view__markdown :deep(pre) {
  margin: 1em 0;
  padding: var(--sm-space-4);
  border-radius: var(--sm-radius-sm);
  background: var(--sm-color-surface-1);
  font-family: var(--sm-font-mono);
  font-size: 13px;
  line-height: 1.6;
  overflow-x: auto;
}

.paper-markdown-view__markdown :deep(code) {
  font-family: var(--sm-font-mono);
  font-size: 0.9em;
}

.paper-markdown-view__markdown :deep(:not(pre) > code) {
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--sm-color-surface-hover);
  font-size: 0.88em;
}

.paper-markdown-view__markdown :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
  margin: 16px auto;
  display: block;
}

.paper-markdown-view__markdown :deep(.paper-markdown-view__table-wrap) {
  display: block;
  width: 100%;
  max-width: 100%;
  margin: 1em 0;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  scrollbar-gutter: stable both-edges;
}

.paper-markdown-view__markdown :deep(.paper-markdown-view__table-wrap > table) {
  width: max-content;
  min-width: 100%;
  margin: 0;
  border-collapse: collapse;
  border-spacing: 0;
  table-layout: auto;
  font-size: 14px;
}

.paper-markdown-view__markdown :deep(th),
.paper-markdown-view__markdown :deep(td) {
  padding: var(--sm-space-2) var(--sm-space-3);
  border: 1px solid var(--sm-color-border-subtle);
  text-align: left;
  vertical-align: top;
}

.paper-markdown-view__markdown :deep(th) {
  font-weight: 600;
  background: var(--sm-color-surface-1);
}

.paper-markdown-view__markdown :deep(blockquote) {
  margin: 1em 0;
  padding: var(--sm-space-3) var(--sm-space-4);
  border-left: 3px solid var(--sm-color-border-strong);
  border-radius: 0 var(--sm-radius-sm) var(--sm-radius-sm) 0;
  background: var(--sm-color-surface-1);
  color: var(--sm-color-text-secondary);
}

.paper-markdown-view__markdown :deep(blockquote p) {
  margin: 0.4em 0;
}

.paper-markdown-view__markdown :deep(ul),
.paper-markdown-view__markdown :deep(ol) {
  margin: 0.6em 0;
  padding-inline-start: 2.8em;
}

.paper-markdown-view__markdown :deep(li) {
  margin: 0.25em 0;
}

.paper-markdown-view__markdown :deep(li > p) {
  margin: 0.2em 0;
}

.paper-markdown-view__markdown :deep(li > ul),
.paper-markdown-view__markdown :deep(li > ol) {
  margin: 0.25em 0;
}

/* 确认对话框 */
.paper-retranslate-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--sm-color-surface-0) 50%, transparent);
  backdrop-filter: blur(4px);
}

.paper-retranslate-dialog {
  min-width: 320px;
  max-width: 420px;
  padding: var(--sm-space-5);
  border-radius: var(--sm-radius-md);
  border: 1px solid var(--sm-color-border-default);
  background: var(--sm-color-surface-1);
  box-shadow:
    0 16px 40px rgba(15, 23, 42, 0.18),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.paper-retranslate-dialog__title {
  font-size: 15px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
  margin-bottom: var(--sm-space-3);
}

.paper-retranslate-dialog__body {
  font-size: 13px;
  line-height: 1.6;
  color: var(--sm-color-text-secondary);
  margin-bottom: var(--sm-space-4);
}

.paper-retranslate-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--sm-space-2);
}

.paper-retranslate-dialog__btn {
  padding: 6px 14px;
  border-radius: var(--sm-radius-sm);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.paper-retranslate-dialog__btn--cancel {
  border: 1px solid var(--sm-color-border-default);
  background: transparent;
  color: var(--sm-color-text-secondary);
}

.paper-retranslate-dialog__btn--cancel:hover {
  background: var(--sm-color-surface-hover);
  color: var(--sm-color-text-primary);
}

.paper-retranslate-dialog__btn--confirm {
  border: none;
  background: var(--sm-color-accent);
  color: var(--sm-color-text-on-accent);
}

.paper-retranslate-dialog__btn--confirm:hover {
  background: var(--sm-color-accent-hover);
}

@keyframes paper-translation-breathe {
  0%,
  100% {
    background-position: 0% 50%;
  }

  50% {
    background-position: 100% 50%;
  }
}
</style>
