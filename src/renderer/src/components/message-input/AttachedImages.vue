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
  gap: 8px;
  margin-bottom: 12px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.pending-images-list::-webkit-scrollbar {
  height: 4px;
}

.pending-images-list::-webkit-scrollbar-thumb {
  background: var(--glass-white-15, rgba(255, 255, 255, 0.15));
  border-radius: 2px;
}

.pending-image-item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 6px;
  background: linear-gradient(135deg, rgba(70, 170, 143, 0.08) 0%, rgba(70, 170, 143, 0.03) 100%);
  border: 1px solid rgba(70, 170, 143, 0.2);
  border-radius: var(--theme-radius-sm, 6px);
  min-width: 80px;
  max-width: 100px;
  flex-shrink: 0;
  transition: all 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.pending-image-item:hover {
  background: linear-gradient(135deg, rgba(70, 170, 143, 0.12) 0%, rgba(70, 170, 143, 0.05) 100%);
  border-color: rgba(70, 170, 143, 0.3);
}

.image-thumbnail {
  width: 64px;
  height: 64px;
  object-fit: cover;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.1);
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
  color: var(--theme-text);
  text-align: center;
  line-height: 1.3;
}

.pending-image-size {
  font-size: 9px;
  color: var(--theme-text-tertiary);
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
  background: rgba(0, 0, 0, 0.5);
  border: none;
  border-radius: 50%;
  color: white;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.pending-image-item:hover .pending-image-remove {
  opacity: 1;
}

.pending-image-remove:hover {
  background: rgba(239, 68, 68, 0.8);
}

.pending-image-remove:disabled {
  opacity: 0;
  cursor: not-allowed;
}
</style>
