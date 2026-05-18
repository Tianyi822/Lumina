<script setup lang="ts">
import { ref } from 'vue'
import type { RenderedSegment } from './composables/usePaperMarkdownEngine'
import styles from './PaperMarkdownSegmentList.module.css'

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

const LIST_ITEM_INDENT = 2.8

function getButtonLeftIndent(translationHtml: string | null): string {
  if (!translationHtml) return '0'
  const trimmed = translationHtml.trimEnd()
  const match = trimmed.match(/((?:<\/(?:ul|ol)>\s*)+)$/)
  if (!match) return '0'
  const nestLevel = (match[1].match(/<\/(?:ul|ol)>/g) || []).length
  return `${nestLevel * LIST_ITEM_INDENT}em`
}

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
    :class="styles['paper-markdown-view__segment']"
    :class="{ [styles['paper-markdown-view__segment--meta']]: segment.isCenteredMeta }"
    :data-paper-segment-stable-id="segment.stableId"
  >
    <div
      :class="[
        styles['paper-markdown-view__segment-original'],
        styles['paper-markdown-view__markdown']
      ]"
      data-paper-selection-surface="true"
      data-view-kind="original"
      :data-segment-stable-id="segment.stableId"
    >
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div v-html="segment.originalHtml" />
    </div>

    <div
      v-if="segment.showTranslation"
      :class="styles['paper-markdown-view__segment-translation']"
      :class="`is-${segment.translationStatus}`"
    >
      <div
        v-if="segment.translationHtml"
        :class="[
          styles['paper-markdown-view__segment-translation-body'],
          styles['paper-markdown-view__markdown']
        ]"
        data-paper-selection-surface="true"
        data-view-kind="translation"
        :data-segment-stable-id="segment.stableId"
      >
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div v-html="segment.translationHtml" />
        <button
          :class="styles['paper-markdown-view__retranslate-btn']"
          type="button"
          :disabled="segment.translationStatus === 'translating'"
          :style="{ marginLeft: getButtonLeftIndent(segment.translationHtml) }"
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
          :class="styles['paper-markdown-view__translation-error']"
        >
          该段翻译暂时失败，再次点击翻译按钮时会继续补全剩余内容。
        </div>

        <div
          v-else
          :class="styles['paper-markdown-view__translation-placeholder']"
          aria-hidden="true"
        >
          <span :class="styles['paper-markdown-view__translation-placeholder-text']"
            >正在翻译...</span
          >
          <span :class="styles['paper-markdown-view__translation-placeholder-bar']" />
          <span :class="styles['paper-markdown-view__translation-placeholder-bar']" />
          <span :class="styles['paper-markdown-view__translation-placeholder-bar']" />
        </div>

        <button
          :class="styles['paper-markdown-view__retranslate-btn']"
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
      :class="styles['paper-retranslate-overlay']"
      @click.self="handleCancelRetranslate"
    >
      <div :class="styles['paper-retranslate-dialog']">
        <div :class="styles['paper-retranslate-dialog__title']">重新翻译</div>
        <div :class="styles['paper-retranslate-dialog__body']">
          该段落存在批注或笔记。继续重新翻译后，这些标注会一起删除。
        </div>
        <div :class="styles['paper-retranslate-dialog__actions']">
          <button
            :class="[
              styles['paper-retranslate-dialog__btn'],
              styles['paper-retranslate-dialog__btn--cancel']
            ]"
            type="button"
            @click="handleCancelRetranslate"
          >
            取消
          </button>
          <button
            :class="[
              styles['paper-retranslate-dialog__btn'],
              styles['paper-retranslate-dialog__btn--confirm']
            ]"
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
