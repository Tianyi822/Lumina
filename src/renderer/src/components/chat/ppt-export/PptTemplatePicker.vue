<script setup lang="ts">
import type { PptTemplateListItem } from '@shared/types/ppt-template'
import type { TemplatePreviewModel } from '@renderer/utils/pptTemplatePreview'
import { formatFileSize, getTemplatePreviewStatusLabel } from '@renderer/utils/pptExportDialog'

defineProps<{
  templates: PptTemplateListItem[]
  selectedTemplateId: string
  templatePreviewMap: Record<string, TemplatePreviewModel>
}>()

const emit = defineEmits<{
  (e: 'select-template', templateId: string): void
}>()

function handleSelectTemplate(templateId: string): void {
  emit('select-template', templateId)
}
</script>

<template>
  <div class="ppt-export-template-picker">
    <div class="ppt-export-section-header">
      <h4 class="ppt-export-section-title">选择模板</h4>
    </div>

    <div v-if="templates.length" class="ppt-export-templates-grid">
      <div
        v-for="template in templates"
        :key="template.id"
        class="ppt-export-template-card"
        :class="{ active: selectedTemplateId === template.id }"
        @click="handleSelectTemplate(template.id)"
      >
        <div class="ppt-export-template-preview">
          <div
            v-if="templatePreviewMap[template.id]?.imageUrl"
            class="ppt-export-template-preview-slide"
          >
            <img
              :src="templatePreviewMap[template.id]?.imageUrl"
              :alt="`${template.name} 首页预览`"
              class="ppt-export-template-preview-image"
            />
          </div>
          <div v-else class="ppt-export-template-preview-placeholder">
            <span class="ppt-export-template-preview-icon">📄</span>
            <span class="ppt-export-template-preview-count">
              {{ getTemplatePreviewStatusLabel(templatePreviewMap[template.id]?.status) }}
            </span>
          </div>
          <div class="ppt-export-template-preview-page-count">{{ template.slideCount }} 页</div>
          <div class="ppt-export-template-check-badge">
            <span>✓</span>
          </div>
        </div>

        <div class="ppt-export-template-card-info">
          <span class="ppt-export-template-card-name" :title="template.name">
            {{ template.name }}
          </span>
          <span class="ppt-export-template-card-meta">
            {{ formatFileSize(template.fileSize) }}
          </span>
        </div>
      </div>
    </div>

    <div v-else class="ppt-export-empty-state">
      <p>暂无可用模板</p>
      <p class="ppt-export-empty-hint">请先上传 PPT 模板文件</p>
    </div>
  </div>
</template>

<style scoped>
.ppt-export-template-picker {
  width: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
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

.ppt-export-templates-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  overflow-y: auto;
  padding-right: 4px;
}

.ppt-export-templates-grid::-webkit-scrollbar {
  width: 4px;
}

.ppt-export-templates-grid::-webkit-scrollbar-track {
  background: transparent;
}

.ppt-export-templates-grid::-webkit-scrollbar-thumb {
  background: var(--theme-border);
  border-radius: 2px;
}

.ppt-export-template-card {
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: var(--theme-radius-lg);
  background: rgba(0, 0, 0, 0.02);
  cursor: pointer;
  overflow: hidden;
  transition: all 0.2s ease;
}

.ppt-export-template-card:hover {
  border-color: var(--theme-accent);
  background: rgba(0, 0, 0, 0.04);
}

.ppt-export-template-card.active {
  border-color: var(--theme-accent);
  background: rgba(99, 102, 241, 0.1);
}

.ppt-export-template-preview {
  position: relative;
  aspect-ratio: 16 / 9;
  background: linear-gradient(135deg, #f0f4f8 0%, #e2e8f0 100%);
  overflow: hidden;
}

.ppt-export-template-preview-slide {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: #ffffff;
}

.ppt-export-template-preview-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.ppt-export-template-preview-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: #64748b;
}

.ppt-export-template-preview-icon {
  font-size: 24px;
  opacity: 0.6;
}

.ppt-export-template-preview-count {
  font-size: 11px;
  font-weight: 500;
  opacity: 0.8;
}

.ppt-export-template-preview-page-count {
  position: absolute;
  left: 8px;
  bottom: 8px;
  padding: 2px 6px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.72);
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  line-height: 1.4;
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.ppt-export-template-check-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--theme-accent);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  opacity: 0;
  transform: scale(0.8);
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.ppt-export-template-card.active .ppt-export-template-check-badge {
  opacity: 1;
  transform: scale(1);
}

.ppt-export-template-card-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px;
}

.ppt-export-template-card-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--theme-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ppt-export-template-card-meta {
  font-size: 11px;
  color: var(--theme-text-tertiary);
}

.ppt-export-empty-state {
  padding: 32px;
  text-align: center;
  color: var(--theme-text-secondary);
}

.ppt-export-empty-state p {
  margin: 0 0 8px;
}

.ppt-export-empty-hint {
  font-size: 12px;
  color: var(--theme-text-tertiary);
}
</style>
