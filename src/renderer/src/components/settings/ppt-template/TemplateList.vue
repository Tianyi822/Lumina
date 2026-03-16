<script setup lang="ts">
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { usePptTemplateStore } from '@renderer/stores'
import type { PptTemplateStatus } from '@shared/types/ppt-template'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'

const pptTemplateStore = usePptTemplateStore()
const { sortedTemplates, loading } = storeToRefs(pptTemplateStore)

// 删除状态
const deletingId = ref<string | null>(null)

/** 格式化文件大小 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** 格式化时间 */
function formatTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  // 小于 1 小时
  if (diff < 60 * 60 * 1000) {
    const minutes = Math.floor(diff / (60 * 1000))
    return minutes < 1 ? '刚刚' : `${minutes} 分钟前`
  }

  // 小于 24 小时
  if (diff < 24 * 60 * 60 * 1000) {
    const hours = Math.floor(diff / (60 * 60 * 1000))
    return `${hours} 小时前`
  }

  // 小于 7 天
  if (diff < 7 * 24 * 60 * 60 * 1000) {
    const days = Math.floor(diff / (24 * 60 * 60 * 1000))
    return `${days} 天前`
  }

  // 显示完整日期
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
}

/** 获取状态文本 */
function getStatusText(status: PptTemplateStatus): string {
  switch (status) {
    case 'analyzing':
      return '分析中'
    case 'completed':
      return '分析完成'
    case 'failed':
      return '分析失败'
    default:
      return '未知'
  }
}

/** 获取状态样式类 */
function getStatusClass(status: PptTemplateStatus): string {
  switch (status) {
    case 'analyzing':
      return 'status-analyzing'
    case 'completed':
      return 'status-completed'
    case 'failed':
      return 'status-failed'
    default:
      return ''
  }
}

/** 删除模板 */
async function handleDelete(templateId: string, templateName: string): Promise<void> {
  const confirmed = window.confirm(`确定要删除模板 "${templateName}" 吗？\n\n删除后将无法恢复。`)
  if (!confirmed) return

  deletingId.value = templateId
  try {
    await pptTemplateStore.deleteTemplate(templateId)
  } finally {
    deletingId.value = null
  }
}

/** 刷新列表 */
async function handleRefresh(): Promise<void> {
  await pptTemplateStore.refreshTemplates()
}
</script>

<template>
  <div class="template-list-section">
    <div class="section-header">
      <h3 class="section-title">模板列表</h3>
      <button class="btn-icon" title="刷新列表" @click="handleRefresh">
        <SvgIcon name="refresh" :size="16" />
      </button>
    </div>

    <div v-if="loading" class="loading-state">
      <span>加载中...</span>
    </div>

    <div v-else-if="sortedTemplates.length === 0" class="empty-state">
      <p>暂无模板，请上传您的第一个 PPT 模板</p>
    </div>

    <div v-else class="template-list">
      <div v-for="template in sortedTemplates" :key="template.id" class="template-item">
        <div class="template-header">
          <span class="template-name">{{ template.name }}</span>
          <div class="template-actions">
            <span class="template-status" :class="getStatusClass(template.status)">
              {{ getStatusText(template.status) }}
            </span>
            <button
              class="btn-delete"
              title="删除模板"
              :disabled="deletingId === template.id"
              @click="handleDelete(template.id, template.name)"
            >
              <SvgIcon v-if="deletingId === template.id" name="spinner" :size="14" :spin="true" />
              <SvgIcon v-else name="delete" :size="14" />
            </button>
          </div>
        </div>
        <div class="template-info">
          <span class="info-item">
            <span class="info-label">原文件:</span>
            <span class="info-value">{{ template.originalFileName }}</span>
          </span>
          <span class="info-item">
            <span class="info-label">页数:</span>
            <span class="info-value">{{ template.slideCount }}</span>
          </span>
          <span class="info-item">
            <span class="info-label">大小:</span>
            <span class="info-value">{{ formatFileSize(template.fileSize) }}</span>
          </span>
          <span class="info-item">
            <span class="info-label">上传时间:</span>
            <span class="info-value">{{ formatTime(template.createdAt) }}</span>
          </span>
        </div>
        <div v-if="template.status === 'completed'" class="template-analysis-path">
          <span class="path-label">分析结果:</span>
          <code class="path-value">{{ pptTemplateStore.getAnalysisPath(template.id) }}</code>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.template-list-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--theme-text);
  margin: 0;
}

/* 图标按钮 */
.btn-icon {
  width: 32px;
  height: 32px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: var(--theme-radius-sm);
  cursor: pointer;
  color: var(--theme-text-secondary);
  transition: all 0.15s ease;
}

.btn-icon:hover {
  background-color: var(--theme-bg-secondary);
  color: var(--theme-text);
}

.loading-state,
.empty-state {
  text-align: center;
  padding: 32px;
  color: var(--theme-text-secondary);
  font-size: 13px;
}

.template-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.template-item {
  padding: 12px 16px;
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius-sm);
  background-color: var(--theme-bg-secondary);
  transition: border-color 0.15s ease;
}

.template-item:hover {
  border-color: var(--theme-border-hover);
}

.template-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.template-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--theme-text);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.template-status {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 500;
  flex-shrink: 0;
}

.template-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.btn-delete {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: var(--theme-radius-sm);
  cursor: pointer;
  color: var(--theme-text-tertiary);
  transition: all 0.15s ease;
}

.btn-delete:hover:not(:disabled) {
  background-color: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.btn-delete:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.status-analyzing {
  background-color: rgba(245, 158, 11, 0.1);
  color: #f59e0b;
}

.status-completed {
  background-color: rgba(34, 197, 94, 0.1);
  color: #22c55e;
}

.status-failed {
  background-color: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.template-info {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  font-size: 12px;
}

.info-item {
  display: flex;
  gap: 4px;
}

.info-label {
  color: var(--theme-text-tertiary);
}

.info-value {
  color: var(--theme-text-secondary);
}

.template-analysis-path {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--theme-border);
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.path-label {
  color: var(--theme-text-tertiary);
  white-space: nowrap;
}

.path-value {
  font-family: var(--theme-font-mono, monospace);
  font-size: 11px;
  color: var(--theme-text-secondary);
  background-color: var(--theme-bg);
  padding: 2px 6px;
  border-radius: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
