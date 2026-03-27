<script setup lang="ts">
import { computed } from 'vue'
import type { PptExportSlidePreview } from '@shared/types/ppt-export'
import { PPT_CONTENT_TYPE_COLORS, PPT_CONTENT_TYPE_LABELS } from '@renderer/utils/pptExportDialog'

const props = withDefaults(
  defineProps<{
    slide?: PptExportSlidePreview
    isGenerating?: boolean
    selectedCount: number
    totalSlides: number
  }>(),
  {
    slide: undefined,
    isGenerating: false
  }
)

const emit = defineEmits<{
  (e: 'toggle-all'): void
  (e: 'toggle-slide-selection'): void
}>()

const toggleAllLabel = computed(() => {
  return props.selectedCount === props.totalSlides ? '取消全选' : '全选'
})

const currentSlideColor = computed(() => {
  if (!props.slide) {
    return '#6b7280'
  }

  return PPT_CONTENT_TYPE_COLORS[props.slide.contentType]
})
</script>

<template>
  <div class="ppt-export-preview-detail">
    <div class="ppt-export-section-header">
      <h4 class="ppt-export-section-title">页面预览</h4>
      <div class="ppt-export-preview-actions">
        <button class="ppt-export-select-all" :disabled="isGenerating" @click="emit('toggle-all')">
          {{ toggleAllLabel }}
        </button>
      </div>
    </div>

    <div v-if="slide" class="ppt-export-slide-detail-content">
      <div class="ppt-export-slide-detail-stage">
        <div v-if="slide.previewImageDataUrl" class="ppt-export-slide-detail-canvas">
          <img
            :src="slide.previewImageDataUrl"
            :alt="`第 ${slide.index + 1} 页预览`"
            class="ppt-export-slide-detail-image"
          />
        </div>
        <div v-else class="ppt-export-slide-detail-placeholder">
          <span>页面预览生成中</span>
        </div>
      </div>

      <div class="ppt-export-slide-detail-header">
        <div class="ppt-export-slide-detail-title-row">
          <label class="ppt-export-slide-checkbox">
            <input
              type="checkbox"
              :checked="slide.selected"
              :disabled="isGenerating"
              @change="emit('toggle-slide-selection')"
              @click.stop
            />
          </label>
          <span class="ppt-export-slide-detail-index">第 {{ slide.index + 1 }} 页</span>
          <span
            class="ppt-export-slide-detail-type"
            :style="{
              backgroundColor: currentSlideColor + '20',
              color: currentSlideColor
            }"
          >
            {{ PPT_CONTENT_TYPE_LABELS[slide.contentType] || slide.contentType }}
          </span>
        </div>

        <h5 class="ppt-export-slide-detail-title">{{ slide.title || '无标题' }}</h5>
      </div>

      <div class="ppt-export-slide-detail-summary">
        <p>{{ slide.summary }}</p>
      </div>

      <div class="ppt-export-slide-detail-status" :class="{ selected: slide.selected }">
        {{ slide.selected ? '已选中导出' : '未选中' }}
      </div>
    </div>

    <div v-else class="ppt-export-slide-detail-empty">
      <p>暂无页面</p>
    </div>
  </div>
</template>

<style scoped>
.ppt-export-preview-detail {
  flex: 1;
  min-height: 0;
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

.ppt-export-preview-actions {
  display: flex;
  gap: 8px;
}

.ppt-export-select-all {
  padding: 0 12px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--theme-border);
  border-radius: 999px;
  background: var(--theme-bg);
  color: var(--theme-text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition:
    border-color var(--sm-transition-fast),
    color var(--sm-transition-fast),
    background-color var(--sm-transition-fast),
    opacity var(--sm-transition-fast);
}

.ppt-export-select-all:hover:not(:disabled) {
  border-color: var(--theme-accent);
  color: var(--theme-accent);
  background: var(--theme-bg-hover);
}

.ppt-export-select-all:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.ppt-export-slide-detail-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
}

.ppt-export-slide-detail-stage {
  flex-shrink: 0;
}

.ppt-export-slide-detail-canvas {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border-radius: calc(var(--sm-radius-lg) - 2px);
  background: var(--sm-color-bg-embedded);
  border: 1px solid var(--sm-color-border-default);
}

.ppt-export-slide-detail-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.ppt-export-slide-detail-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 16 / 9;
  border: 1px dashed var(--sm-color-border-default);
  border-radius: calc(var(--sm-radius-lg) - 2px);
  background: var(--sm-color-surface-1);
  color: var(--sm-color-text-tertiary);
  font-size: 13px;
  font-weight: 500;
}

.ppt-export-slide-detail-header {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ppt-export-slide-detail-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ppt-export-slide-checkbox {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.ppt-export-slide-checkbox input[type='checkbox'] {
  width: 16px;
  height: 16px;
  accent-color: var(--theme-accent);
  cursor: pointer;
}

.ppt-export-slide-detail-index {
  font-size: 15px;
  font-weight: 600;
  color: var(--theme-text);
}

.ppt-export-slide-detail-type {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
}

.ppt-export-slide-detail-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--theme-text);
  line-height: 1.4;
}

.ppt-export-slide-detail-summary {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  border-radius: var(--sm-radius-md);
  background: var(--sm-color-surface-1);
  border: 1px solid var(--sm-color-border-default);
}

.ppt-export-slide-detail-summary p {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--sm-color-text-secondary);
}

.ppt-export-slide-detail-status {
  padding: 8px 12px;
  border-radius: var(--sm-radius-md);
  background: var(--sm-color-surface-1);
  border: 1px solid var(--sm-color-border-default);
  font-size: 12px;
  color: var(--sm-color-text-secondary);
  text-align: center;
  transition:
    border-color var(--sm-transition-fast),
    color var(--sm-transition-fast),
    background-color var(--sm-transition-fast);
}

.ppt-export-slide-detail-status.selected {
  background: rgba(142, 149, 217, 0.08);
  border-color: var(--sm-color-border-accent);
  color: var(--sm-color-accent-hover);
  font-weight: 500;
}

.ppt-export-slide-detail-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--sm-color-text-tertiary);
}
</style>
