<script setup lang="ts">
import type { PptExportSlidePreview } from '@shared/types/ppt-export'
import { PPT_CONTENT_TYPE_COLORS } from '@renderer/utils/pptExportDialog'

const props = defineProps<{
  slides: PptExportSlidePreview[]
  currentSlideIndex: number
}>()

const emit = defineEmits<{
  (e: 'select-slide', slideIndex: number): void
  (e: 'toggle-selection', slideIndex: number): void
}>()

function handleToggleSelection(event: Event, index: number): void {
  event.stopPropagation()
  emit('toggle-selection', index)
}
</script>

<template>
  <div class="ppt-export-thumbnails-panel">
    <div class="ppt-export-section-header">
      <h4 class="ppt-export-section-title">全部页面</h4>
      <span class="ppt-export-thumbnails-count">共 {{ slides.length }} 页</span>
    </div>

    <div ref="thumbnailScrollRef" class="ppt-export-thumbnails-scroll">
      <div
        v-for="slide in slides"
        :key="slide.index"
        :data-slide-index="slide.index"
        class="ppt-export-thumbnail-item"
        :class="{
          active: currentSlideIndex === slide.index,
          selected: slide.selected
        }"
        @click="emit('select-slide', slide.index)"
      >
        <div class="ppt-export-thumbnail-preview">
          <img
            v-if="slide.previewImageDataUrl"
            :src="slide.previewImageDataUrl"
            :alt="`第 ${slide.index + 1} 页缩略图`"
            class="ppt-export-thumbnail-image"
          />
          <span v-else class="ppt-export-thumbnail-number">
            {{ slide.index + 1 }}
          </span>
          <span
            class="ppt-export-thumbnail-type"
            :style="{
              backgroundColor: PPT_CONTENT_TYPE_COLORS[slide.contentType] || '#6b7280'
            }"
          ></span>
        </div>

        <div class="ppt-export-thumbnail-info">
          <span class="ppt-export-thumbnail-title">
            {{ slide.title || '无标题' }}
          </span>
        </div>

        <div class="ppt-export-thumbnail-check" @click="handleToggleSelection($event, slide.index)">
          <span v-if="slide.selected">✓</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ppt-export-thumbnails-panel {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--glass-white-15, rgba(255, 255, 255, 0.15));
  border-radius: var(--theme-radius-lg);
  background: var(--glass-white-05, rgba(255, 255, 255, 0.05));
  overflow: hidden;
  padding: 14px;
}

.ppt-export-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.ppt-export-section-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--theme-text);
}

.ppt-export-thumbnails-count {
  font-size: 12px;
  color: var(--theme-text-tertiary);
}

.ppt-export-thumbnails-scroll {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 4px 0 8px;
}

.ppt-export-thumbnails-scroll::-webkit-scrollbar {
  height: 6px;
}

.ppt-export-thumbnails-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.ppt-export-thumbnails-scroll::-webkit-scrollbar-thumb {
  background: var(--theme-border);
  border-radius: 3px;
}

.ppt-export-thumbnail-item {
  position: relative;
  flex-shrink: 0;
  width: 100px;
  cursor: pointer;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: var(--theme-radius);
  background: rgba(0, 0, 0, 0.02);
  overflow: hidden;
  transition: all 0.2s ease;
}

.ppt-export-thumbnail-item:hover {
  border-color: var(--theme-accent);
  background: rgba(0, 0, 0, 0.04);
}

.ppt-export-thumbnail-item:hover .ppt-export-thumbnail-check {
  opacity: 1;
}

.ppt-export-thumbnail-item.active {
  border-color: var(--theme-accent);
  background: rgba(99, 102, 241, 0.1);
}

.ppt-export-thumbnail-item.selected {
  background: color-mix(in srgb, var(--theme-accent) 5%, var(--theme-bg));
}

.ppt-export-thumbnail-item.selected .ppt-export-thumbnail-check {
  opacity: 1;
  background: var(--theme-accent);
}

.ppt-export-thumbnail-preview {
  position: relative;
  aspect-ratio: 16 / 9;
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.ppt-export-thumbnail-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.ppt-export-thumbnail-number {
  font-size: 18px;
  font-weight: 700;
  color: #94a3b8;
}

.ppt-export-thumbnail-type {
  position: absolute;
  top: 4px;
  left: 4px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.ppt-export-thumbnail-info {
  padding: 6px 8px;
}

.ppt-export-thumbnail-title {
  display: block;
  font-size: 11px;
  color: var(--theme-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ppt-export-thumbnail-check {
  position: absolute;
  bottom: 4px;
  right: 4px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.2);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  opacity: 0;
  transition: all 0.2s ease;
}

.ppt-export-thumbnail-check:hover {
  transform: scale(1.1);
  background: var(--theme-accent);
}
</style>
