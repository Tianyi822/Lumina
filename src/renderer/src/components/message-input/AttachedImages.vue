<script setup lang="ts">
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import type { PendingImage } from '@renderer/stores/imageUploadStore'
import { formatFileSize } from './attachmentUtils'

const props = defineProps<{
  images: PendingImage[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'remove', index: number): void
}>()
</script>

<template>
  <div v-if="props.images.length > 0" class="pending-images-list">
    <div v-for="(img, index) in props.images" :key="index" class="pending-image-item">
      <img :src="img.thumbnailData" :alt="img.fileName" class="image-thumbnail" />
      <div class="pending-image-info">
        <span class="pending-image-name" :title="img.fileName">{{ img.fileName }}</span>
        <span class="pending-image-size">{{ formatFileSize(img.compressedSize) }}</span>
      </div>
      <button
        class="pending-image-remove"
        title="移除"
        :disabled="props.disabled"
        @click="emit('remove', index)"
      >
        <SvgIcon name="close" :size="10" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.pending-images-list {
  display: flex;
  gap: var(--sm-space-2);
  overflow-x: auto;
  padding-bottom: 4px;
}

.pending-images-list::-webkit-scrollbar {
  height: 4px;
}

.pending-images-list::-webkit-scrollbar-thumb {
  background: var(--sm-color-border-default);
  border-radius: 999px;
}

.pending-image-item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 6px;
  background: var(--sm-color-surface-1);
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-sm);
  min-width: 80px;
  max-width: 100px;
  flex-shrink: 0;
  transition:
    background-color var(--sm-transition-fast),
    border-color var(--sm-transition-fast);
}

.pending-image-item:hover {
  background: var(--sm-color-surface-hover);
  border-color: var(--sm-color-border-strong);
}

.image-thumbnail {
  width: 64px;
  height: 64px;
  object-fit: cover;
  border-radius: 4px;
  background: var(--sm-color-bg-embedded);
}

.pending-image-info {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  min-width: 0;
}

.pending-image-name {
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10px;
  font-weight: 500;
  color: var(--sm-color-text-primary);
  text-align: center;
  line-height: 1.3;
}

.pending-image-size {
  font-size: 9px;
  color: var(--sm-color-text-tertiary);
  opacity: 0.7;
  line-height: 1.3;
}

.pending-image-remove {
  position: absolute;
  top: 2px;
  right: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  background: var(--sm-color-surface-3);
  border: 1px solid var(--sm-color-border-default);
  border-radius: 50%;
  color: var(--sm-color-text-secondary);
  cursor: pointer;
  opacity: 0;
  transition: opacity var(--sm-transition-fast);
}

.pending-image-item:hover .pending-image-remove {
  opacity: 1;
}

.pending-image-remove:hover {
  background: rgba(199, 120, 120, 0.16);
  color: var(--sm-color-status-danger);
}

.pending-image-remove:disabled {
  opacity: 0;
  cursor: not-allowed;
}
</style>
