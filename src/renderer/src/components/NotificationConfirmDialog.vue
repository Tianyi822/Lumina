<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue'

defineProps<{
  message: string
  title: string
  danger: boolean
}>()

const emit = defineEmits<{
  (e: 'confirm'): void
  (e: 'cancel'): void
}>()

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    emit('cancel')
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <Transition name="sm-confirm" appear>
    <div class="sm-confirm-overlay" @click.self="emit('cancel')">
      <div class="sm-confirm-surface" role="dialog" :aria-label="title">
        <div class="sm-confirm-surface__title">{{ title }}</div>
        <div class="sm-confirm-surface__message">{{ message }}</div>
        <div class="sm-confirm-surface__actions">
          <button class="sm-confirm-surface__btn" @click="emit('cancel')">取消</button>
          <button
            class="sm-confirm-surface__btn"
            :class="{ 'sm-confirm-surface__btn--danger': danger }"
            @click="emit('confirm')"
          >
            确认
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>
