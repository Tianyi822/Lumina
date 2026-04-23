<script setup lang="ts">
import { inject } from 'vue'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import type { PendingQuote } from '@renderer/stores/paperChatQuoteStore'

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
  <div v-if="props.quotes.length > 0" class="paper-chat-input__pending-quotes">
    <div
      v-for="(quote, index) in props.quotes"
      :key="quote.id"
      class="paper-chat-input__pending-quote"
      @click="handleTagClick(quote)"
    >
      <SvgIcon class="paper-chat-input__pending-quote-icon" name="quote" :size="12" />
      <span class="paper-chat-input__pending-quote-label">{{ getQuoteLabel(quote, index) }}</span>
      <span class="paper-chat-input__pending-quote-preview" :title="quote.selectedText">
        {{ getQuotePreview(quote) }}
      </span>
      <span v-if="hasQuoteContext(quote)" class="paper-chat-input__pending-quote-context">
        上下文
      </span>
      <button
        class="paper-chat-input__pending-quote-remove"
        title="移除"
        :disabled="props.disabled"
        @click.stop="emit('remove', quote.id)"
      >
        <SvgIcon name="close" :size="10" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.paper-chat-input__pending-quotes {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sm-space-2);
}

.paper-chat-input__pending-quote {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: min(100%, 420px);
  padding: 4px 10px;
  background: color-mix(in srgb, var(--sm-color-accent) 10%, var(--sm-color-surface-1));
  border: 1px solid color-mix(in srgb, var(--sm-color-accent) 25%, var(--sm-color-border-default));
  border-radius: var(--sm-radius-sm);
  font-size: 12px;
  color: var(--sm-color-text-primary);
  cursor: pointer;
  transition:
    background-color var(--sm-transition-fast),
    border-color var(--sm-transition-fast);
}

.paper-chat-input__pending-quote:hover {
  background: color-mix(in srgb, var(--sm-color-accent) 16%, var(--sm-color-surface-1));
  border-color: color-mix(in srgb, var(--sm-color-accent) 35%, var(--sm-color-border-default));
}

.paper-chat-input__pending-quote-icon {
  flex-shrink: 0;
  width: 12px;
  height: 12px;
  color: var(--sm-color-accent-hover);
}

.paper-chat-input__pending-quote-label {
  flex-shrink: 0;
  font-weight: 500;
  line-height: 1.4;
  white-space: nowrap;
}

.paper-chat-input__pending-quote-preview {
  min-width: 0;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--sm-color-text-secondary);
  line-height: 1.4;
}

.paper-chat-input__pending-quote-context {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--sm-color-text-tertiary);
  line-height: 1.4;
}

.paper-chat-input__pending-quote-remove {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--sm-color-text-tertiary);
  cursor: pointer;
  transition:
    background-color var(--sm-transition-fast),
    color var(--sm-transition-fast);
}

.paper-chat-input__pending-quote-remove:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.1);
  color: var(--sm-color-status-danger);
}

.paper-chat-input__pending-quote-remove:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
