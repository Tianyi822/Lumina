<script setup lang="ts">
import { computed, inject } from 'vue'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import { getFileTypeIcon } from '@renderer/utils/fileIcons'
import type { Message } from '@renderer/types'
import type { PaperQuote } from '@shared/types/chat'
import { formatFileSize } from '@shared/utils'
import styles from './PaperChatMessageAttachments.module.css'

const props = defineProps<{
  attachments: {
    documents?: Message['attachedDocuments']
    images?: Message['attachedImages']
    quotes?: PaperQuote[]
  }
}>()

const scrollToQuote = inject<(quote: PaperQuote) => void>('scrollToQuote')
const QUOTE_PREVIEW_MAX_LENGTH = 42

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

function getQuotePreview(quote: PaperQuote): string {
  const normalizedText = quote.selectedText.replace(/\s+/g, ' ').trim()
  if (normalizedText.length <= QUOTE_PREVIEW_MAX_LENGTH) {
    return normalizedText
  }

  return `${normalizedText.slice(0, QUOTE_PREVIEW_MAX_LENGTH)}...`
}

function hasQuoteContext(quote: PaperQuote): boolean {
  return Boolean(quote.surroundingContext?.contextualText.trim())
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
      :class="styles['document-indicators']"
    >
      <div v-for="(doc, index) in attachments.documents" :key="index" :class="styles['doc-badge']">
        <SvgIcon
          :class="styles['doc-icon']"
          :name="getFileTypeIcon(doc.fileName).name"
          :size="14"
          :color="getFileTypeIcon(doc.fileName).color"
        />
        <span :class="styles['doc-name']" :title="doc.fileName">{{ doc.fileName }}</span>
        <span :class="styles['doc-size']">{{ formatFileSize(doc.fileSize) }}</span>
      </div>
    </div>

    <!-- 引用指示器（仅用户消息） -->
    <div
      v-if="attachments.quotes && attachments.quotes.length > 0"
      :class="styles['quote-indicators']"
    >
      <div
        v-for="(quote, index) in attachments.quotes"
        :key="quote.id"
        :class="styles['quote-badge']"
        @click="handleQuoteClick(quote)"
      >
        <SvgIcon :class="styles['quote-badge__icon']" name="quote" :size="12" />
        <span :class="styles['quote-badge__label']">{{ getQuoteLabel(quote, index) }}</span>
        <span :class="styles['quote-badge__preview']" :title="quote.selectedText">
          {{ getQuotePreview(quote) }}
        </span>
        <span v-if="hasQuoteContext(quote)" :class="styles['quote-badge__context']">上下文</span>
      </div>
    </div>

    <!-- 图片指示器（仅用户消息） -->
    <div
      v-if="attachments.images && attachments.images.length > 0"
      :class="styles['image-indicators']"
    >
      <div v-for="(img, index) in attachments.images" :key="index" :class="styles['image-badge']">
        <img :src="img.base64Data" :alt="img.fileName" :class="styles['msg-image-thumb']" />
        <span :class="styles['image-badge-name']" :title="img.fileName">{{ img.fileName }}</span>
      </div>
    </div>
  </div>
</template>
