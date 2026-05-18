<script setup lang="ts">
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import type { PendingImage } from '@renderer/stores/paperChatImageUploadStore'
import { formatFileSize } from './attachmentUtils'
import styles from './PaperChatAttachedImages.module.css'

const props = defineProps<{
  images: PendingImage[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'remove', index: number): void
}>()
</script>

<template>
  <div v-if="props.images.length > 0" :class="styles['paper-chat-input__pending-images']">
    <div
      v-for="(img, index) in props.images"
      :key="index"
      :class="styles['paper-chat-input__pending-image']"
    >
      <img
        :src="img.thumbnailData"
        :alt="img.fileName"
        :class="styles['paper-chat-input__pending-image-thumbnail']"
      />
      <div :class="styles['paper-chat-input__pending-image-info']">
        <span :class="styles['paper-chat-input__pending-image-name']" :title="img.fileName">{{
          img.fileName
        }}</span>
        <span :class="styles['paper-chat-input__pending-image-size']">{{
          formatFileSize(img.compressedSize)
        }}</span>
      </div>
      <button
        :class="styles['paper-chat-input__pending-image-remove']"
        title="移除"
        :disabled="props.disabled"
        @click="emit('remove', index)"
      >
        <SvgIcon name="close" :size="10" />
      </button>
    </div>
  </div>
</template>
