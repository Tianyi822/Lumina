<script setup lang="ts">
import { inject } from 'vue'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import type { PendingQuote } from '@renderer/stores/paperChatQuoteStore'
import styles from './PaperChatAttachedQuotes.module.css'

const props = defineProps<{
  quotes: PendingQuote[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'remove', quoteId: string): void
}>()

const scrollToQuote = inject<(quote: PendingQuote) => void>('scrollToQuote')
const QUOTE_PREVIEW_MAX_LENGTH = 42

function handleTagClick(quote: PendingQuote): void {
  scrollToQuote?.(quote)
}

function getQuoteLabel(quote: PendingQuote, index: number): string {
  const quoteIndex = props.quotes
    .slice(0, index + 1)
    .filter((item) => item.viewKind === quote.viewKind).length
  const viewLabel = quote.viewKind === 'original' ? '原文引用' : '译文引用'
  return `${viewLabel} ${quoteIndex}`
}

function getQuotePreview(quote: PendingQuote): string {
  const normalizedText = quote.selectedText.replace(/\s+/g, ' ').trim()
  if (normalizedText.length <= QUOTE_PREVIEW_MAX_LENGTH) {
    return normalizedText
  }

  return `${normalizedText.slice(0, QUOTE_PREVIEW_MAX_LENGTH)}...`
}

function hasQuoteContext(quote: PendingQuote): boolean {
  return Boolean(quote.surroundingContext?.contextualText.trim())
}
</script>

<template>
  <div v-if="props.quotes.length > 0" :class="styles['paper-chat-input__pending-quotes']">
    <div
      v-for="(quote, index) in props.quotes"
      :key="quote.id"
      :class="styles['paper-chat-input__pending-quote']"
      @click="handleTagClick(quote)"
    >
      <SvgIcon :class="styles['paper-chat-input__pending-quote-icon']" name="quote" :size="12" />
      <span :class="styles['paper-chat-input__pending-quote-label']">{{
        getQuoteLabel(quote, index)
      }}</span>
      <span :class="styles['paper-chat-input__pending-quote-preview']" :title="quote.selectedText">
        {{ getQuotePreview(quote) }}
      </span>
      <span
        v-if="hasQuoteContext(quote)"
        :class="styles['paper-chat-input__pending-quote-context']"
      >
        上下文
      </span>
      <button
        :class="styles['paper-chat-input__pending-quote-remove']"
        title="移除"
        :disabled="props.disabled"
        @click.stop="emit('remove', quote.id)"
      >
        <SvgIcon name="close" :size="10" />
      </button>
    </div>
  </div>
</template>
