<script setup lang="ts">
import styles from './PaperChatMessageActions.module.css'
defineProps<{
  hasFeedbackSlot?: boolean
}>()
</script>

<template>
  <div :class="styles['message-actions']">
    <div v-if="hasFeedbackSlot" :class="styles['message-feedback']">
      <slot name="feedback"></slot>
    </div>
  </div>
</template>
