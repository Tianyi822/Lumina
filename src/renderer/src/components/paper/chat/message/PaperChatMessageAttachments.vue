<script setup lang="ts">
import { computed, inject } from 'vue'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import { getFileTypeIcon } from '@renderer/utils/fileIcons'
import type { Message } from '@renderer/types'
import type { PaperQuote } from '@shared/types/chat'
import { formatFileSize } from '@shared/utils'

const props = defineProps<{
  attachments: {
    documents?: Message['attachedDocuments']
    images?: Message['attachedImages']
    quotes?: PaperQuote[]
  }
}>()

const scrollToQuote = inject<(quote: PaperQuote) => void>('scrollToQuote')

const hasAttachments = computed(() => {
  return (
    (props.attachments.documents?.length || 0) > 0 ||
    (props.attachments.images?.length || 0) > 0 ||
    (props.attachments.quotes?.length || 0) > 0
  )
})

function getQuoteLabel(quote: PaperQuote, index: number): string {
  const quotes = props.attachments.quotes || []
  const quoteIndex = quotes
    .slice(0, index + 1)
    .filter((item) => item.viewKind === quote.viewKind).length
  const viewLabel = quote.viewKind === 'original' ? '原文引用' : '译文引用'
  return `${viewLabel} ${quoteIndex}`
}

function handleQuoteClick(quote: PaperQuote): void {
  scrollToQuote?.(quote)
}
</script>

<template>
  <div v-if="hasAttachments">
    <!-- 文档指示器（仅用户消息） -->
    <div
      v-if="attachments.documents && attachments.documents.length > 0"
      class="document-indicators"
    >
      <div v-for="(doc, index) in attachments.documents" :key="index" class="doc-badge">
        <SvgIcon
          class="doc-icon"
          :name="getFileTypeIcon(doc.fileName).name"
          :size="14"
          :color="getFileTypeIcon(doc.fileName).color"
        />
        <span class="doc-name" :title="doc.fileName">{{ doc.fileName }}</span>
        <span class="doc-size">{{ formatFileSize(doc.fileSize) }}</span>
      </div>
    </div>

    <!-- 引用指示器（仅用户消息） -->
    <div v-if="attachments.quotes && attachments.quotes.length > 0" class="quote-indicators">
      <div
        v-for="(quote, index) in attachments.quotes"
        :key="quote.id"
        class="quote-badge"
        @click="handleQuoteClick(quote)"
      >
        <SvgIcon class="quote-badge__icon" name="quote" :size="12" />
        <span class="quote-badge__label">{{ getQuoteLabel(quote, index) }}</span>
      </div>
    </div>

    <!-- 图片指示器（仅用户消息） -->
    <div v-if="attachments.images && attachments.images.length > 0" class="image-indicators">
      <div v-for="(img, index) in attachments.images" :key="index" class="image-badge">
        <img :src="img.base64Data" :alt="img.fileName" class="msg-image-thumb" />
        <span class="image-badge-name" :title="img.fileName">{{ img.fileName }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ==================== 文档指示器样式 ==================== */
.document-indicators {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
  padding: 0 4px;
}

.doc-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: linear-gradient(135deg, rgba(70, 170, 143, 0.12) 0%, rgba(70, 170, 143, 0.05) 100%);
  border: 1px solid rgba(70, 170, 143, 0.25);
  border-radius: var(--sm-radius-sm);
  font-size: 12px;
  color: var(--sm-color-text-primary);
  transition: all 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.doc-badge:hover {
  background: linear-gradient(135deg, rgba(70, 170, 143, 0.18) 0%, rgba(70, 170, 143, 0.08) 100%);
  border-color: rgba(70, 170, 143, 0.35);
}

.doc-icon {
  flex-shrink: 0;
  color: var(--sm-color-accent);
}

.doc-name {
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

.doc-size {
  font-size: 10px;
  color: var(--sm-color-text-tertiary);
  opacity: 0.8;
}

/* ==================== 引用指示器样式 ==================== */
.quote-indicators {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
  padding: 0 4px;
}

.quote-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: linear-gradient(135deg, rgba(70, 170, 143, 0.12) 0%, rgba(70, 170, 143, 0.05) 100%);
  border: 1px solid rgba(70, 170, 143, 0.25);
  border-radius: var(--sm-radius-sm);
  font-size: 12px;
  color: var(--sm-color-text-primary);
  cursor: pointer;
  transition: all 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.quote-badge:hover {
  background: linear-gradient(135deg, rgba(70, 170, 143, 0.22) 0%, rgba(70, 170, 143, 0.1) 100%);
  border-color: rgba(70, 170, 143, 0.4);
}

.quote-badge__icon {
  flex-shrink: 0;
  color: var(--sm-color-accent-hover);
}

.quote-badge__label {
  font-weight: 500;
  white-space: nowrap;
}

/* ==================== 图片指示器样式 ==================== */
.image-indicators {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
  padding: 0 4px;
}

.image-badge {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 4px;
  background: linear-gradient(135deg, rgba(70, 170, 143, 0.12) 0%, rgba(70, 170, 143, 0.05) 100%);
  border: 1px solid rgba(70, 170, 143, 0.25);
  border-radius: var(--sm-radius-sm);
  transition: all 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.image-badge:hover {
  background: linear-gradient(135deg, rgba(70, 170, 143, 0.18) 0%, rgba(70, 170, 143, 0.08) 100%);
  border-color: rgba(70, 170, 143, 0.35);
}

.msg-image-thumb {
  width: 64px;
  height: 64px;
  object-fit: cover;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.1);
}

.image-badge-name {
  max-width: 72px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10px;
  font-weight: 500;
  color: var(--sm-color-text-primary);
  text-align: center;
}
</style>
