<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import PaperChatMessage from '@renderer/components/paper/chat/message/PaperChatMessage.vue'
import PaperChatPlanProgress from '@renderer/components/paper/chat/message/PaperChatPlanProgress.vue'
import PaperChatReActSteps from '@renderer/components/paper/chat/message/PaperChatReActSteps.vue'
import type { Message } from '@renderer/types'

const props = defineProps<{
  messages: Message[]
  isSending?: boolean
  currentModelName?: string
  currentChatId?: string
}>()

const expandedReasoningIds = ref<Set<string>>(new Set())
const scrollRef = ref<HTMLElement | null>(null)
const userScrolling = ref(false)
const lastScrollTop = ref(0)
const SCROLL_THRESHOLD = 96

let scrollFrameId: number | null = null
let pendingScrollSmooth = true

const visibleMessages = computed(() =>
  props.messages.filter((message) => !message.hidden && message.role !== 'tool')
)

function isNearBottom(): boolean {
  const el = scrollRef.value
  if (!el) return true
  const { scrollTop, scrollHeight, clientHeight } = el
  return scrollHeight - scrollTop - clientHeight <= SCROLL_THRESHOLD
}

function scrollToBottom(smooth = true): void {
  const el = scrollRef.value
  if (!el) return
  el.scrollTo({
    top: el.scrollHeight,
    behavior: smooth ? 'smooth' : 'auto'
  })
}

function scheduleScrollToBottom(smooth = true): void {
  pendingScrollSmooth = pendingScrollSmooth && smooth

  if (scrollFrameId !== null) {
    return
  }

  scrollFrameId = window.requestAnimationFrame(() => {
    const shouldSmooth = pendingScrollSmooth
    pendingScrollSmooth = true
    scrollFrameId = null
    scrollToBottom(shouldSmooth)
  })
}

function cancelScheduledScroll(): void {
  if (scrollFrameId !== null) {
    window.cancelAnimationFrame(scrollFrameId)
    scrollFrameId = null
  }
  pendingScrollSmooth = true
}

function handleScroll(): void {
  const el = scrollRef.value
  if (!el) return

  const currentScrollTop = el.scrollTop
  if (isNearBottom()) {
    userScrolling.value = false
  } else if (currentScrollTop < lastScrollTop.value) {
    userScrolling.value = true
  }
  lastScrollTop.value = currentScrollTop
}

function handleWheel(event: WheelEvent): void {
  if (event.deltaY < 0) {
    userScrolling.value = true
  }
}

function smartScrollToBottom(): void {
  if (!userScrolling.value) {
    scheduleScrollToBottom(!props.isSending)
  }
}

function toggleReasoning(messageId: string): void {
  if (expandedReasoningIds.value.has(messageId)) {
    expandedReasoningIds.value.delete(messageId)
  } else {
    expandedReasoningIds.value.add(messageId)
  }
}

function isReasoningExpanded(messageId: string): boolean {
  return expandedReasoningIds.value.has(messageId)
}

function hasRenderableReact(message: Message): boolean {
  const hasIterationContent =
    message.reactIterations?.some(
      (iteration) => iteration.reasoning.trim().length > 0 || iteration.steps.length > 0
    ) || false
  const hasLegacySteps = (message.reactSteps?.length || 0) > 0
  return message.role === 'assistant' && (hasIterationContent || hasLegacySteps)
}

watch(
  () => props.messages,
  () => {
    smartScrollToBottom()
  },
  { deep: true, flush: 'post' }
)

watch(
  () => props.isSending,
  (sending) => {
    if (sending) {
      userScrolling.value = false
      scheduleScrollToBottom(false)
    }
  },
  { flush: 'post' }
)

watch(
  () => props.currentChatId,
  () => {
    userScrolling.value = false
    expandedReasoningIds.value = new Set()
    scheduleScrollToBottom(false)
  },
  { flush: 'post' }
)

onMounted(() => {
  scrollToBottom(false)
  if (scrollRef.value) {
    lastScrollTop.value = scrollRef.value.scrollTop
  }
})

onBeforeUnmount(() => {
  cancelScheduledScroll()
})
</script>

<template>
  <div
    ref="scrollRef"
    class="paper-chat-message-list"
    @scroll="handleScroll"
    @wheel.passive="handleWheel"
  >
    <div v-if="visibleMessages.length === 0" class="paper-chat-message-list__empty">
      <span>可直接提问这篇论文的内容。</span>
    </div>

    <div v-else class="paper-chat-message-list__items">
      <PaperChatMessage
        v-for="message in visibleMessages"
        :key="message.id"
        :message="message"
        :current-model-name="props.currentModelName"
        :is-reasoning-expanded="isReasoningExpanded(message.id)"
        :current-chat-id="props.currentChatId"
        @toggle-reasoning="toggleReasoning"
      >
        <template #react-steps>
          <PaperChatPlanProgress
            v-if="message.planExecution"
            :plan-execution="message.planExecution"
          />
          <PaperChatReActSteps
            v-if="hasRenderableReact(message)"
            :steps="message.reactSteps"
            :iterations="message.reactIterations"
            :is-streaming="message.isStreaming"
          />
        </template>
      </PaperChatMessage>
    </div>
  </div>
</template>

<style scoped>
.paper-chat-message-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: var(--sm-space-4);
  background: var(--sm-color-bg-canvas);
}

.paper-chat-message-list__empty {
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--sm-space-6);
  color: var(--sm-color-text-tertiary);
  font-size: 13px;
  text-align: center;
}

.paper-chat-message-list__items {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-4);
  min-width: 0;
}

.paper-chat-message-list__items :deep(.paper-chat-message) {
  min-width: 0;
}
</style>
