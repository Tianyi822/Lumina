<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import type { ModelSpecificConfig } from '@renderer/types'

// ==================== Props & Emits ====================
const emit = defineEmits<{
  (e: 'error', message: string): void
  (e: 'success', message: string): void
}>()

// ==================== State ====================
const configs = ref<ModelSpecificConfig[]>([])
const loading = ref(false)
const showEditModal = ref(false)
const showDeleteConfirm = ref(false)
const editingConfig = ref<ModelSpecificConfig | null>(null)
const configToDelete = ref<string>('')

// 预设的模型模板
const modelTemplates = [
  { pattern: 'gpt-4', name: 'GPT-4', description: 'OpenAI GPT-4 系列' },
  { pattern: 'claude', name: 'Claude', description: 'Anthropic Claude 系列' },
  { pattern: 'deepseek', name: 'DeepSeek', description: 'DeepSeek 系列' },
  { pattern: 'qwen', name: 'Qwen', description: '阿里通义千问系列' },
  { pattern: 'gemini', name: 'Gemini', description: 'Google Gemini 系列' }
]

// 表单数据
const formData = ref<{
  modelPattern: string
  fewShotCount: number
  emphasisOnCOT: boolean
  toolDescriptionStyle: 'concise' | 'detailed'
  specialInstructions: string
}>({
  modelPattern: '',
  fewShotCount: 3,
  emphasisOnCOT: true,
  toolDescriptionStyle: 'detailed',
  specialInstructions: ''
})

// ==================== Computed ====================
const isEditing = computed(() => editingConfig.value !== null)

const modalTitle = computed(() => (isEditing.value ? '编辑模型配置' : '添加模型配置'))

// ==================== Lifecycle ====================
onMounted(() => {
  loadConfigs()
})

// ==================== Methods ====================
async function loadConfigs(): Promise<void> {
  loading.value = true
  try {
    configs.value = await window.api.modelConfig.getConfigs()
  } catch (error) {
    emit('error', '加载模型配置失败')
    console.error(error)
  } finally {
    loading.value = false
  }
}

function openAddModal(): void {
  editingConfig.value = null
  formData.value = {
    modelPattern: '',
    fewShotCount: 3,
    emphasisOnCOT: true,
    toolDescriptionStyle: 'detailed',
    specialInstructions: ''
  }
  showEditModal.value = true
}

function openEditModal(config: ModelSpecificConfig): void {
  editingConfig.value = config
  formData.value = {
    modelPattern: config.modelPattern,
    fewShotCount: config.optimizations.fewShotCount ?? 3,
    emphasisOnCOT: config.optimizations.emphasisOnCOT ?? true,
    toolDescriptionStyle: config.optimizations.toolDescriptionStyle ?? 'detailed',
    specialInstructions: config.optimizations.specialInstructions ?? ''
  }
  showEditModal.value = true
}

function closeEditModal(): void {
  showEditModal.value = false
  editingConfig.value = null
}

async function saveConfig(): Promise<void> {
  if (!formData.value.modelPattern.trim()) {
    emit('error', '请输入模型匹配模式')
    return
  }

  const config: ModelSpecificConfig = {
    modelPattern: formData.value.modelPattern.trim(),
    optimizations: {
      fewShotCount: formData.value.fewShotCount,
      emphasisOnCOT: formData.value.emphasisOnCOT,
      toolDescriptionStyle: formData.value.toolDescriptionStyle,
      specialInstructions: formData.value.specialInstructions.trim() || undefined
    }
  }

  try {
    if (isEditing.value && editingConfig.value) {
      await window.api.modelConfig.updateConfig(editingConfig.value.modelPattern, config)
      emit('success', '配置更新成功')
    } else {
      await window.api.modelConfig.addConfig(config)
      emit('success', '配置添加成功')
    }
    await loadConfigs()
    closeEditModal()
  } catch (error) {
    emit('error', isEditing.value ? '更新配置失败' : '添加配置失败')
    console.error(error)
  }
}

function confirmDelete(modelPattern: string): void {
  configToDelete.value = modelPattern
  showDeleteConfirm.value = true
}

async function executeDelete(): Promise<void> {
  try {
    await window.api.modelConfig.deleteConfig(configToDelete.value)
    emit('success', '配置删除成功')
    await loadConfigs()
  } catch (error) {
    emit('error', '删除配置失败')
    console.error(error)
  } finally {
    showDeleteConfirm.value = false
    configToDelete.value = ''
  }
}

function applyTemplate(template: typeof modelTemplates[0]): void {
  formData.value.modelPattern = template.pattern
}

function getToolDescriptionStyleLabel(style: string): string {
  const labels: Record<string, string> = {
    concise: '简洁',
    detailed: '详细'
  }
  return labels[style] || style
}

function getToolDescriptionStyleClass(style: string): string {
  return style === 'concise' ? 'style-concise' : 'style-detailed'
}
</script>

<template>
  <div class="model-config-manager">
    <!-- 头部 -->
    <div class="manager-header">
      <div class="header-title">
        <h3 class="manager-title">模型特定优化配置</h3>
        <p class="manager-desc">为不同模型配置特定的提示词优化策略</p>
      </div>
      <button class="btn btn-primary" :disabled="loading" @click="openAddModal">
        <span class="btn-icon">+</span>
        添加配置
      </button>
    </div>

    <!-- 配置列表 -->
    <div class="configs-list">
      <div v-if="loading" class="loading-state">
        <div class="loading-spinner"></div>
        <span>加载中...</span>
      </div>
      <div v-else-if="configs.length === 0" class="empty-state">
        <div class="empty-icon">🤖</div>
        <p>暂无模型配置</p>
        <span class="empty-hint">点击右上角按钮添加第一个配置</span>
      </div>
      <div v-else class="config-cards">
        <div v-for="config in configs" :key="config.modelPattern" class="config-card">
          <div class="card-header">
            <div class="model-info">
              <span class="model-pattern">{{ config.modelPattern }}</span>
              <span class="model-badge" :class="getToolDescriptionStyleClass(config.optimizations.toolDescriptionStyle || 'detailed')">
                {{ getToolDescriptionStyleLabel(config.optimizations.toolDescriptionStyle || 'detailed') }}
              </span>
            </div>
            <div class="card-actions">
              <button class="icon-btn" title="编辑" @click="openEditModal(config)">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
              <button class="icon-btn delete" title="删除" @click="confirmDelete(config.modelPattern)">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
              </button>
            </div>
          </div>

          <div class="card-body">
            <div class="config-row">
              <span class="config-label">Few-shot 示例:</span>
              <span class="config-value">{{ config.optimizations.fewShotCount ?? 3 }} 个</span>
            </div>
            <div class="config-row">
              <span class="config-label">思维链强调:</span>
              <span class="config-value">
                <span class="status-badge" :class="config.optimizations.emphasisOnCOT ? 'enabled' : 'disabled'">
                  {{ config.optimizations.emphasisOnCOT ? '启用' : '禁用' }}
                </span>
              </span>
            </div>
            <div v-if="config.optimizations.specialInstructions" class="config-row">
              <span class="config-label">特殊指令:</span>
              <span class="config-value special-instructions">{{ config.optimizations.specialInstructions }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 编辑/添加弹窗 -->
    <div v-if="showEditModal" class="modal-overlay" @click="closeEditModal">
      <div class="modal-container" @click.stop>
        <div class="modal-header">
          <h4>{{ modalTitle }}</h4>
          <button class="close-btn" @click="closeEditModal">×</button>
        </div>
        <div class="modal-body">
          <!-- 模型模板快速选择 -->
          <div v-if="!isEditing" class="form-section">
            <label class="form-label">快速选择模型模板</label>
            <div class="template-list">
              <button
                v-for="template in modelTemplates"
                :key="template.pattern"
                class="template-btn"
                :class="{ active: formData.modelPattern === template.pattern }"
                @click="applyTemplate(template)"
              >
                <span class="template-name">{{ template.name }}</span>
                <span class="template-desc">{{ template.description }}</span>
              </button>
            </div>
          </div>

          <div class="form-section">
            <label class="form-label">模型匹配模式 <span class="required">*</span></label>
            <input
              v-model="formData.modelPattern"
              type="text"
              class="input"
              placeholder="如: gpt-4, claude, deepseek 等（支持正则表达式）"
              :disabled="isEditing"
            />
            <span class="form-hint">使用正则表达式匹配模型名称，不区分大小写</span>
          </div>

          <div class="form-row">
            <div class="form-col">
              <label class="form-label">Few-shot 示例数量</label>
              <input
                v-model.number="formData.fewShotCount"
                type="number"
                class="input"
                min="0"
                max="10"
              />
              <span class="form-hint">范围: 0-10</span>
            </div>
            <div class="form-col">
              <label class="form-label">工具描述风格</label>
              <select v-model="formData.toolDescriptionStyle" class="select">
                <option value="concise">简洁</option>
                <option value="detailed">详细</option>
              </select>
            </div>
          </div>

          <div class="form-section">
            <label class="form-label checkbox-label">
              <input v-model="formData.emphasisOnCOT" type="checkbox" class="checkbox" />
              <span>强调思维链 (Chain of Thought)</span>
            </label>
            <span class="form-hint">启用后会在提示词中强调逐步推理的重要性</span>
          </div>

          <div class="form-section">
            <label class="form-label">特殊指令</label>
            <textarea
              v-model="formData.specialInstructions"
              class="textarea"
              rows="4"
              placeholder="输入针对该模型的特殊指令（可选）..."
            />
            <span class="form-hint">这些指令将被追加到系统提示词中</span>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn" @click="closeEditModal">取消</button>
          <button class="btn btn-primary" @click="saveConfig">保存</button>
        </div>
      </div>
    </div>

    <!-- 删除确认弹窗 -->
    <div v-if="showDeleteConfirm" class="modal-overlay" @click="showDeleteConfirm = false">
      <div class="modal-container modal-sm" @click.stop>
        <div class="modal-header">
          <h4>确认删除</h4>
        </div>
        <div class="modal-body">
          <p>确定要删除模型配置 <strong>{{ configToDelete }}</strong> 吗？</p>
          <p class="warning-text">此操作不可恢复。</p>
        </div>
        <div class="modal-footer">
          <button class="btn" @click="showDeleteConfirm = false">取消</button>
          <button class="btn btn-danger" @click="executeDelete">确认删除</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.model-config-manager {
  padding: 16px;
  height: 100%;
  overflow-y: auto;
}

.manager-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
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

.btn-danger {
  background-color: var(--theme-danger);
  border-color: var(--theme-danger);
  color: white;
}

.btn-danger:hover:not(:disabled) {
  background-color: var(--theme-danger-hover);
}

.btn-icon {
  font-size: 16px;
  font-weight: 600;
}

/* 配置列表 */
.configs-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
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

.empty-hint {
  font-size: 12px;
  color: var(--theme-text-secondary);
  margin-top: 8px;
}

.config-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.config-card {
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius);
  overflow: hidden;
  transition: all 0.2s ease;
}

.config-card:hover {
  border-color: var(--theme-accent);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--theme-border);
  background-color: rgba(0, 0, 0, 0.2);
}

.model-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.model-pattern {
  font-family: var(--theme-font);
  font-size: 14px;
  font-weight: 600;
  color: var(--theme-accent);
}

.model-badge {
  padding: 2px 8px;
  font-size: 11px;
  border-radius: 4px;
  font-weight: 500;
}

.style-concise {
  background-color: rgba(74, 158, 255, 0.15);
  color: #4a9eff;
}

.style-detailed {
  background-color: rgba(124, 58, 237, 0.15);
  color: #7c3aed;
}

.card-actions {
  display: flex;
  gap: 4px;
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--theme-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.icon-btn:hover {
  background-color: var(--theme-bg-hover);
  color: var(--theme-text);
}

.icon-btn.delete:hover {
  background-color: rgba(248, 81, 73, 0.1);
  color: var(--theme-danger);
}

.card-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.config-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.config-label {
  font-size: 12px;
  color: var(--theme-text-secondary);
  min-width: 80px;
  flex-shrink: 0;
}

.config-value {
  font-size: 13px;
  color: var(--theme-text);
  flex: 1;
}

.special-instructions {
  font-size: 12px;
  color: var(--theme-text-secondary);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  font-size: 11px;
  border-radius: 4px;
  font-weight: 500;
}

.status-badge.enabled {
  background-color: rgba(63, 185, 80, 0.15);
  color: #3fb950;
}

.status-badge.disabled {
  background-color: rgba(139, 148, 158, 0.15);
  color: #8b949e;
}

/* 弹窗样式 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.modal-container {
  background-color: var(--theme-bg);
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius);
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  width: 100%;
  max-width: 560px;
}

.modal-sm {
  max-width: 400px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--theme-border);
}

.modal-header h4 {
  margin: 0;
  font-size: 15px;
  color: var(--theme-text);
}

.close-btn {
  background: none;
  border: none;
  color: var(--theme-text-secondary);
  font-size: 24px;
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  color: var(--theme-text);
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--theme-border);
}

/* 表单样式 */
.form-section {
  margin-bottom: 20px;
}

.form-section:last-child {
  margin-bottom: 0;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 20px;
}

.form-col {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--theme-text);
  margin-bottom: 8px;
}

.form-label .required {
  color: var(--theme-danger);
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  margin-bottom: 4px;
}

.checkbox-label span {
  font-weight: normal;
}

.form-hint {
  display: block;
  font-size: 12px;
  color: var(--theme-text-secondary);
  margin-top: 4px;
}

.input,
.select,
.textarea {
  width: 100%;
  padding: 8px 12px;
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 6px;
  color: var(--theme-text);
  font-family: var(--theme-font);
  font-size: 13px;
  transition: all 0.15s ease;
  box-sizing: border-box;
}

.input:focus,
.select:focus,
.textarea:focus {
  outline: none;
  border-color: var(--theme-accent);
}

.input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.textarea {
  resize: vertical;
  min-height: 80px;
  line-height: 1.5;
}

.checkbox {
  width: 16px;
  height: 16px;
  accent-color: var(--theme-accent);
  cursor: pointer;
}

/* 模板列表 */
.template-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.template-btn {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 10px 12px;
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 6px;
  color: var(--theme-text);
  font-family: var(--theme-font);
  cursor: pointer;
  transition: all 0.15s ease;
  min-width: 120px;
}

.template-btn:hover {
  border-color: var(--theme-accent);
  background-color: rgba(74, 158, 255, 0.05);
}

.template-btn.active {
  border-color: var(--theme-accent);
  background-color: rgba(74, 158, 255, 0.1);
}

.template-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--theme-accent);
}

.template-desc {
  font-size: 11px;
  color: var(--theme-text-secondary);
  margin-top: 2px;
}

.warning-text {
  color: var(--theme-warning);
  font-size: 13px;
  margin-top: 8px;
}
</style>
