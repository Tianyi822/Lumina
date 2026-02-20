<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import type { PromptSectionPriority } from '@renderer/types'

// ==================== Props & Emits ====================
const emit = defineEmits<{
  (e: 'error', message: string): void
  (e: 'success', message: string): void
}>()

// ==================== State ====================
const priorities = ref<PromptSectionPriority[]>([])
const loading = ref(false)
const saving = ref(false)
const hasChanges = ref(false)

// 章节定义
const sectionDefinitions: Record<string, { name: string; description: string; defaultPriority: PromptSectionPriority['priority'] }> = {
  coreInstructions: {
    name: '核心指令',
    description: '系统核心行为和角色定义',
    defaultPriority: 'essential'
  },
  reactProcess: {
    name: 'ReAct 流程',
    description: '推理-行动循环的工作流程说明',
    defaultPriority: 'essential'
  },
  toolBestPractices: {
    name: '工具最佳实践',
    description: '工具调用的最佳实践和注意事项',
    defaultPriority: 'high'
  },
  errorHandling: {
    name: '错误处理',
    description: '错误处理和恢复策略',
    defaultPriority: 'medium'
  },
  outputFormat: {
    name: '输出格式',
    description: '响应输出格式要求',
    defaultPriority: 'medium'
  },
  sandboxManagement: {
    name: '沙箱管理',
    description: 'Docker 沙箱操作指南',
    defaultPriority: 'low'
  }
}

// 优先级选项
const priorityOptions: { value: PromptSectionPriority['priority']; label: string; color: string }[] = [
  { value: 'essential', label: '核心', color: '#f85149' },
  { value: 'high', label: '高', color: '#ffa657' },
  { value: 'medium', label: '中', color: '#d29922' },
  { value: 'low', label: '低', color: '#8b949e' }
]

// ==================== Computed ====================
const sortedPriorities = computed(() => {
  const order = { essential: 0, high: 1, medium: 2, low: 3 }
  return [...priorities.value].sort((a, b) => order[a.priority] - order[b.priority])
})

const priorityStats = computed(() => {
  const stats = { essential: 0, high: 0, medium: 0, low: 0 }
  priorities.value.forEach((p) => {
    stats[p.priority]++
  })
  return stats
})

// ==================== Lifecycle ====================
onMounted(() => {
  loadPriorities()
})

// ==================== Methods ====================
async function loadPriorities(): Promise<void> {
  loading.value = true
  try {
    const data = await window.api.sectionPriority.getPriorities()
    priorities.value = data
    hasChanges.value = false
  } catch (error) {
    emit('error', '加载章节优先级配置失败')
    console.error(error)
  } finally {
    loading.value = false
  }
}

function updatePriority(section: string, priority: PromptSectionPriority['priority']): void {
  const index = priorities.value.findIndex((p) => p.section === section)
  if (index !== -1) {
    priorities.value[index] = { ...priorities.value[index], priority }
    hasChanges.value = true
  }
}

function updateMinTokens(section: string, minTokens: number): void {
  const index = priorities.value.findIndex((p) => p.section === section)
  if (index !== -1) {
    priorities.value[index] = { ...priorities.value[index], minTokens }
    hasChanges.value = true
  }
}

function updateCompressible(section: string, compressible: boolean): void {
  const index = priorities.value.findIndex((p) => p.section === section)
  if (index !== -1) {
    priorities.value[index] = { ...priorities.value[index], compressible }
    hasChanges.value = true
  }
}

async function savePriorities(): Promise<void> {
  saving.value = true
  try {
    await window.api.sectionPriority.savePriorities(priorities.value)
    emit('success', '优先级配置保存成功')
    hasChanges.value = false
  } catch (error) {
    emit('error', '保存优先级配置失败')
    console.error(error)
  } finally {
    saving.value = false
  }
}

async function resetToDefaults(): Promise<void> {
  try {
    await window.api.sectionPriority.resetToDefaults()
    await loadPriorities()
    emit('success', '已重置为默认配置')
  } catch (error) {
    emit('error', '重置配置失败')
    console.error(error)
  }
}

function getSectionInfo(section: string) {
  return sectionDefinitions[section] || { name: section, description: '', defaultPriority: 'medium' }
}

function getPriorityLabel(priority: string): string {
  const option = priorityOptions.find((o) => o.value === priority)
  return option?.label || priority
}

function getPriorityColor(priority: string): string {
  const option = priorityOptions.find((o) => o.value === priority)
  return option?.color || '#8b949e'
}

function getPriorityClass(priority: string): string {
  return `priority-${priority}`
}

function getTokenBudgetAdvice(): string {
  const essentialCount = priorityStats.value.essential
  const highCount = priorityStats.value.high

  if (essentialCount === 0) {
    return '警告：至少需要设置一个核心章节'
  }

  const totalMinTokens = priorities.value.reduce((sum, p) => sum + p.minTokens, 0)
  return `建议最小 Token 预算: ${totalMinTokens} (核心章节必须保留)`
}
</script>

<template>
  <div class="section-priority-manager">
    <!-- 头部 -->
    <div class="manager-header">
      <div class="header-title">
        <h3 class="manager-title">章节优先级配置</h3>
        <p class="manager-desc">配置提示词各章节的重要性，用于 Token 预算不足时的智能裁剪</p>
      </div>
      <div class="header-actions">
        <button class="btn" :disabled="loading || !hasChanges" @click="loadPriorities">
          重置
        </button>
        <button class="btn btn-secondary" :disabled="loading" @click="resetToDefaults">
          恢复默认
        </button>
        <button class="btn btn-primary" :disabled="loading || saving || !hasChanges" @click="savePriorities">
          <span v-if="saving">保存中...</span>
          <span v-else>保存配置</span>
        </button>
      </div>
    </div>

    <!-- 统计信息 -->
    <div class="stats-bar">
      <div class="stat-item">
        <span class="stat-dot" style="background-color: #f85149"></span>
        <span class="stat-label">核心</span>
        <span class="stat-value">{{ priorityStats.essential }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-dot" style="background-color: #ffa657"></span>
        <span class="stat-label">高</span>
        <span class="stat-value">{{ priorityStats.high }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-dot" style="background-color: #d29922"></span>
        <span class="stat-label">中</span>
        <span class="stat-value">{{ priorityStats.medium }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-dot" style="background-color: #8b949e"></span>
        <span class="stat-label">低</span>
        <span class="stat-value">{{ priorityStats.low }}</span>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-item token-advice">
        <span class="advice-text">{{ getTokenBudgetAdvice() }}</span>
      </div>
    </div>

    <!-- 配置列表 -->
    <div class="priorities-list">
      <div v-if="loading" class="loading-state">
        <div class="loading-spinner"></div>
        <span>加载中...</span>
      </div>
      <div v-else-if="priorities.length === 0" class="empty-state">
        <div class="empty-icon">📋</div>
        <p>暂无优先级配置</p>
      </div>
      <div v-else class="priority-cards">
        <div
          v-for="item in sortedPriorities"
          :key="item.section"
          class="priority-card"
          :class="getPriorityClass(item.priority)"
        >
          <div class="card-main">
            <div class="section-info">
              <div class="section-header">
                <span class="section-name">{{ getSectionInfo(item.section).name }}</span>
                <span class="priority-badge" :style="{ backgroundColor: getPriorityColor(item.priority) }">
                  {{ getPriorityLabel(item.priority) }}
                </span>
              </div>
              <p class="section-desc">{{ getSectionInfo(item.section).description }}</p>
            </div>

            <div class="section-controls">
              <div class="control-group">
                <label class="control-label">优先级</label>
                <div class="priority-selector">
                  <button
                    v-for="option in priorityOptions"
                    :key="option.value"
                    class="priority-btn"
                    :class="{ active: item.priority === option.value }"
                    :style="item.priority === option.value ? { backgroundColor: option.color } : {}"
                    @click="updatePriority(item.section, option.value)"
                  >
                    {{ option.label }}
                  </button>
                </div>
              </div>

              <div class="control-group">
                <label class="control-label">最小 Tokens</label>
                <input
                  v-model.number="item.minTokens"
                  type="number"
                  class="input input-sm"
                  min="0"
                  step="50"
                  @change="updateMinTokens(item.section, item.minTokens)"
                />
              </div>

              <div class="control-group">
                <label class="control-label checkbox-label">
                  <input
                    v-model="item.compressible"
                    type="checkbox"
                    class="checkbox"
                    @change="updateCompressible(item.section, item.compressible)"
                  />
                  <span>可压缩</span>
                </label>
              </div>
            </div>
          </div>

          <div class="card-footer">
            <div class="footer-hint">
              <template v-if="item.priority === 'essential'">
                <span class="hint-icon">🔒</span>
                <span>核心章节在任何情况下都会被保留</span>
              </template>
              <template v-else-if="item.priority === 'low' && item.compressible">
                <span class="hint-icon">🗜️</span>
                <span>低优先级且可压缩的章节会首先被裁剪</span>
              </template>
              <template v-else>
                <span class="hint-icon">ℹ️</span>
                <span>根据 Token 预算动态调整</span>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 说明文档 -->
    <div class="help-section">
      <h4 class="help-title">📖 优先级说明</h4>
      <div class="help-content">
        <div class="help-item">
          <span class="help-badge" style="background-color: #f85149">核心</span>
          <span class="help-text">必须保留的章节，Token 不足时优先保证这部分内容</span>
        </div>
        <div class="help-item">
          <span class="help-badge" style="background-color: #ffa657">高</span>
          <span class="help-text">重要章节，只有在 Token 严重不足时才会考虑裁剪</span>
        </div>
        <div class="help-item">
          <span class="help-badge" style="background-color: #d29922">中</span>
          <span class="help-text">一般章节，根据 Token 预算动态调整</span>
        </div>
        <div class="help-item">
          <span class="help-badge" style="background-color: #8b949e">低</span>
          <span class="help-text">可选章节，Token 紧张时首先被裁剪</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.section-priority-manager {
  padding: 16px;
  height: 100%;
  overflow-y: auto;
}

.manager-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
}

.header-title {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.manager-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--theme-text);
  margin: 0;
}

.manager-desc {
  font-size: 13px;
  color: var(--theme-text-secondary);
  margin: 0;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 6px;
  color: var(--theme-text);
  font-family: var(--theme-font);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn:hover:not(:disabled) {
  background-color: var(--theme-bg-hover);
  border-color: var(--theme-accent);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background-color: var(--theme-accent);
  border-color: var(--theme-accent);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background-color: var(--theme-accent-hover);
}

.btn-secondary {
  background-color: transparent;
  border-color: var(--theme-border);
}

.btn-secondary:hover:not(:disabled) {
  border-color: var(--theme-accent);
}

/* 统计栏 */
.stats-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius);
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.stat-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.stat-label {
  font-size: 12px;
  color: var(--theme-text-secondary);
}

.stat-value {
  font-size: 13px;
  font-weight: 600;
  color: var(--theme-text);
  min-width: 20px;
  text-align: center;
}

.stat-divider {
  width: 1px;
  height: 20px;
  background-color: var(--theme-border);
}

.token-advice {
  flex: 1;
  min-width: 200px;
}

.advice-text {
  font-size: 12px;
  color: var(--theme-text-secondary);
}

/* 优先级列表 */
.priorities-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 24px;
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: var(--theme-text-secondary);
  text-align: center;
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 2px solid var(--theme-border);
  border-top-color: var(--theme-accent);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 12px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.priority-cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.priority-card {
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius);
  overflow: hidden;
  transition: all 0.2s ease;
}

.priority-card:hover {
  border-color: var(--theme-accent);
}

.priority-essential {
  border-left: 3px solid #f85149;
}

.priority-high {
  border-left: 3px solid #ffa657;
}

.priority-medium {
  border-left: 3px solid #d29922;
}

.priority-low {
  border-left: 3px solid #8b949e;
}

.card-main {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 16px;
  gap: 24px;
}

.section-info {
  flex: 1;
  min-width: 0;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

.section-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--theme-text);
}

.priority-badge {
  padding: 2px 8px;
  font-size: 11px;
  border-radius: 4px;
  color: white;
  font-weight: 500;
}

.section-desc {
  font-size: 12px;
  color: var(--theme-text-secondary);
  margin: 0;
  line-height: 1.5;
}

.section-controls {
  display: flex;
  align-items: flex-end;
  gap: 16px;
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.control-label {
  font-size: 11px;
  color: var(--theme-text-secondary);
  font-weight: 500;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-weight: normal;
}

.checkbox-label span {
  font-size: 12px;
  color: var(--theme-text);
}

.priority-selector {
  display: flex;
  gap: 4px;
}

.priority-btn {
  padding: 4px 12px;
  background-color: var(--theme-bg);
  border: 1px solid var(--theme-border);
  border-radius: 4px;
  color: var(--theme-text-secondary);
  font-family: var(--theme-font);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.priority-btn:hover {
  border-color: var(--theme-accent);
  color: var(--theme-text);
}

.priority-btn.active {
  border-color: transparent;
  color: white;
}

.input-sm {
  width: 80px;
  padding: 4px 8px;
  font-size: 12px;
}

.checkbox {
  width: 14px;
  height: 14px;
  accent-color: var(--theme-accent);
  cursor: pointer;
}

.card-footer {
  padding: 10px 16px;
  background-color: rgba(0, 0, 0, 0.2);
  border-top: 1px solid var(--theme-border);
}

.footer-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--theme-text-secondary);
}

.hint-icon {
  font-size: 14px;
}

/* 帮助区域 */
.help-section {
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius);
  padding: 16px;
}

.help-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--theme-text);
  margin: 0 0 12px 0;
}

.help-content {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}

.help-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.help-badge {
  padding: 2px 10px;
  font-size: 11px;
  border-radius: 4px;
  color: white;
  font-weight: 500;
  white-space: nowrap;
}

.help-text {
  font-size: 12px;
  color: var(--theme-text-secondary);
  line-height: 1.4;
}

/* 输入框样式 */
.input {
  background-color: var(--theme-bg);
  border: 1px solid var(--theme-border);
  border-radius: 4px;
  color: var(--theme-text);
  font-family: var(--theme-font);
  transition: all 0.15s ease;
}

.input:focus {
  outline: none;
  border-color: var(--theme-accent);
}
</style>
