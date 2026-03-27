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
// 重试状态
const retryingId = ref<string | null>(null)

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
    case 'summarizing':
      return '总结中'
    case 'completed':
      return '已完成'
    case 'failed':
      return '总结失败'
    default:
      return '未知'
  }
}

/** 获取状态样式类 */
function getStatusClass(status: PptTemplateStatus): string {
  switch (status) {
    case 'analyzing':
      return 'status-analyzing'
    case 'summarizing':
      return 'status-summarizing'
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

/** 重试 AI 总结 */
async function handleRetrySummary(templateId: string): Promise<void> {
  retryingId.value = templateId
  try {
    const success = await pptTemplateStore.retrySummary(templateId)
    if (success) {
      await pptTemplateStore.refreshTemplates()
    }
  } finally {
    retryingId.value = null
  }
}
</script>

<template>
  <div class="sm-ppt-template-list">
    <div class="sm-ppt-template-list__header">
      <h3 class="sm-settings-page__section-title">模板列表</h3>
      <button
        class="sm-icon-button sm-ppt-template-list__refresh"
        title="刷新列表"
        @click="handleRefresh"
      >
        <SvgIcon name="refresh" :size="16" />
      </button>
    </div>

    <div v-if="loading" class="sm-empty sm-ppt-template-list__state">
      <span class="sm-spinner sm-spinner--large"></span>
      <span>加载中...</span>
    </div>

    <div v-else-if="sortedTemplates.length === 0" class="sm-empty sm-ppt-template-list__state">
      <p>暂无模板，请上传您的第一个 PPT 模板</p>
    </div>

    <div v-else class="sm-ppt-template-list__items">
      <div
        v-for="template in sortedTemplates"
        :key="template.id"
        class="sm-ppt-template-list__item"
      >
        <div class="sm-ppt-template-list__item-header">
          <span class="sm-ppt-template-list__item-name">{{ template.name }}</span>
          <div class="sm-ppt-template-list__item-actions">
            <span class="sm-badge sm-ppt-template-list__status" :class="getStatusClass(template.status)">
              {{ getStatusText(template.status) }}
            </span>
            <button
              v-if="template.status === 'failed'"
              class="sm-icon-button sm-ppt-template-list__icon-action sm-ppt-template-list__icon-action--retry"
              title="重试 AI 总结"
              :disabled="retryingId === template.id || deletingId === template.id"
              @click="handleRetrySummary(template.id)"
            >
              <SvgIcon v-if="retryingId === template.id" name="spinner" :size="14" :spin="true" />
              <SvgIcon v-else name="refresh" :size="14" />
            </button>
            <button
              class="sm-icon-button sm-ppt-template-list__icon-action sm-ppt-template-list__icon-action--delete"
              title="删除模板"
              :disabled="deletingId === template.id || retryingId === template.id"
              @click="handleDelete(template.id, template.name)"
            >
              <SvgIcon v-if="deletingId === template.id" name="spinner" :size="14" :spin="true" />
              <SvgIcon v-else name="delete" :size="14" />
            </button>
          </div>
        </div>
        <div class="sm-ppt-template-list__meta">
          <span class="sm-ppt-template-list__meta-item">
            <span class="sm-ppt-template-list__meta-label">原文件:</span>
            <span class="sm-ppt-template-list__meta-value">{{ template.originalFileName }}</span>
          </span>
          <span class="sm-ppt-template-list__meta-item">
            <span class="sm-ppt-template-list__meta-label">页数:</span>
            <span class="sm-ppt-template-list__meta-value">{{ template.slideCount }}</span>
          </span>
          <span class="sm-ppt-template-list__meta-item">
            <span class="sm-ppt-template-list__meta-label">大小:</span>
            <span class="sm-ppt-template-list__meta-value">{{ formatFileSize(template.fileSize) }}</span>
          </span>
          <span class="sm-ppt-template-list__meta-item">
            <span class="sm-ppt-template-list__meta-label">上传时间:</span>
            <span class="sm-ppt-template-list__meta-value">{{ formatTime(template.createdAt) }}</span>
          </span>
        </div>
        <div v-if="template.status === 'completed'" class="sm-ppt-template-list__path">
          <span class="sm-ppt-template-list__path-label">分析结果:</span>
          <code class="sm-ppt-template-list__path-value">{{
            pptTemplateStore.getAnalysisPath(template.id)
          }}</code>
        </div>
        <div v-if="template.summaryCompletedAt" class="sm-ppt-template-list__path">
          <span class="sm-ppt-template-list__path-label">AI 总结:</span>
          <code class="sm-ppt-template-list__path-value">{{
            pptTemplateStore.getAiSummaryPath(template.id)
          }}</code>
        </div>
        <div v-if="template.summaryError" class="sm-ppt-template-list__error">
          <span class="sm-ppt-template-list__path-label">总结失败:</span>
          <span class="sm-ppt-template-list__error-value">{{ template.summaryError.message }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sm-ppt-template-list {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-3);
}

.sm-ppt-template-list__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sm-ppt-template-list__refresh {
  width: 32px;
  height: 32px;
}

.sm-ppt-template-list__state {
  min-height: 168px;
}

.sm-ppt-template-list__items {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-3);
}

.sm-ppt-template-list__item {
  padding: 12px 16px;
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-md);
  background: var(--sm-color-surface-2);
  transition:
    border-color var(--sm-transition-fast),
    background-color var(--sm-transition-fast);
}

.sm-ppt-template-list__item:hover {
  border-color: var(--sm-color-border-strong);
  background: var(--sm-color-surface-hover);
}

.sm-ppt-template-list__item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.sm-ppt-template-list__item-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
}

.sm-ppt-template-list__item-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.sm-ppt-template-list__icon-action {
  width: 28px;
  height: 28px;
}

.sm-ppt-template-list__icon-action--retry:hover:not(:disabled) {
  background-color: rgba(142, 149, 217, 0.14);
  border-color: var(--sm-color-border-accent);
  color: var(--sm-color-accent-hover);
}

.sm-ppt-template-list__icon-action--delete:hover:not(:disabled) {
  background-color: rgba(199, 120, 120, 0.12);
  border-color: rgba(199, 120, 120, 0.28);
  color: #c77878;
}

.status-analyzing {
  background: rgba(197, 161, 101, 0.12);
  border-color: rgba(197, 161, 101, 0.22);
  color: #c5a165;
}

.status-completed {
  background: rgba(127, 176, 138, 0.12);
  border-color: rgba(127, 176, 138, 0.22);
  color: #7fb08a;
}

.status-summarizing {
  background: rgba(142, 149, 217, 0.12);
  border-color: rgba(142, 149, 217, 0.22);
  color: var(--sm-color-accent-hover);
}

.status-failed {
  background: rgba(199, 120, 120, 0.12);
  border-color: rgba(199, 120, 120, 0.22);
  color: #c77878;
}

.sm-ppt-template-list__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  font-size: 12px;
}

.sm-ppt-template-list__meta-item {
  display: flex;
  gap: 4px;
}

.sm-ppt-template-list__meta-label {
  color: var(--sm-color-text-tertiary);
}

.sm-ppt-template-list__meta-value {
  color: var(--sm-color-text-secondary);
}

.sm-ppt-template-list__path,
.sm-ppt-template-list__error {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--sm-color-border-subtle);
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12px;
}

.sm-ppt-template-list__path-label {
  color: var(--sm-color-text-tertiary);
  white-space: nowrap;
}

.sm-ppt-template-list__path-value {
  font-family: var(--sm-font-mono);
  font-size: 11px;
  color: var(--sm-color-text-secondary);
  background: var(--sm-color-bg-embedded);
  padding: 2px 6px;
  border-radius: var(--sm-radius-sm);
  overflow: hidden;
  text-overflow: ellipsis;
}

.sm-ppt-template-list__error-value {
  color: #c77878;
  line-height: 1.5;
  word-break: break-word;
}

@media (max-width: 720px) {
  .sm-ppt-template-list__item-header,
  .sm-ppt-template-list__path,
  .sm-ppt-template-list__error {
    flex-direction: column;
    align-items: flex-start;
  }

  .sm-ppt-template-list__item-actions {
    width: 100%;
    justify-content: flex-start;
  }
}
</style>
