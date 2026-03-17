<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { usePromptEngineeringStore } from '@renderer/stores/promptEngineeringStore'
import { usePromptManager } from '@renderer/composables/settings/usePromptManager'
import { getPromptVariablePlaceholder, resolveSystemPromptVariables } from '@shared/utils'

const store = usePromptEngineeringStore()
const { customVariables, systemVariables, loading, saving } = storeToRefs(store)
const { saveCustomVariable, deleteCustomVariable } = usePromptManager()

const editingName = ref<string | null>(null)

const formState = reactive({
  name: '',
  description: '',
  defaultValue: ''
})

const systemVariableValues = computed(() => resolveSystemPromptVariables())
const isEditing = computed(() => editingName.value !== null)

/**
 * 重置表单
 */
function resetForm(): void {
  formState.name = ''
  formState.description = ''
  formState.defaultValue = ''
  editingName.value = null
}

/**
 * 编辑变量
 */
function handleEdit(name: string): void {
  const target = customVariables.value.find((variable) => variable.name === name)
  if (!target) {
    return
  }

  formState.name = target.name
  formState.description = target.description
  formState.defaultValue = target.defaultValue || ''
  editingName.value = target.name
  store.clearError()
}

/**
 * 保存变量
 */
async function handleSubmit(): Promise<void> {
  const result = await saveCustomVariable(
    {
      name: formState.name,
      description: formState.description,
      defaultValue: formState.defaultValue
    },
    editingName.value || undefined
  )

  if (result.success) {
    resetForm()
  }
}

/**
 * 删除变量
 */
async function handleDelete(name: string): Promise<void> {
  const deleted = await deleteCustomVariable(name)
  if (deleted) {
    if (editingName.value === name) {
      resetForm()
    }
  }
}
</script>

<template>
  <div class="pe-variables-manager">
    <div class="pe-info-box">
      <h3 class="pe-info-title">动态变量管理</h3>
      <p class="pe-info-description">
        系统变量会在运行时自动求值，自定义变量会持久化到提示词配置中，可在系统提示词和测试沙盘里复用。
      </p>
    </div>

    <section class="pe-section">
      <div class="pe-section-header">
        <div>
          <h4 class="pe-section-title">系统变量</h4>
          <p class="pe-section-description">只读显示，可直接在提示词中使用。</p>
        </div>
      </div>

      <div class="pe-variable-grid">
        <article
          v-for="variable in systemVariables"
          :key="variable.name"
          class="pe-variable-card pe-variable-card-system"
        >
          <div class="pe-variable-name">{{ getPromptVariablePlaceholder(variable.name) }}</div>
          <p class="pe-variable-description">{{ variable.description }}</p>
          <p class="pe-variable-meta">
            当前值：{{ systemVariableValues[variable.name] || '运行时生成' }}
          </p>
          <p class="pe-variable-meta">求值规则：{{ variable.evalRule || '运行时求值' }}</p>
        </article>
      </div>
    </section>

    <section class="pe-section">
      <div class="pe-section-header">
        <div>
          <h4 class="pe-section-title">自定义变量</h4>
          <p class="pe-section-description">
            适合维护 `user_name`、`user_info`、`context` 等业务变量。
          </p>
        </div>
      </div>

      <form class="pe-form-card" @submit.prevent="handleSubmit">
        <div class="pe-form-grid">
          <label class="pe-form-field">
            <span class="pe-form-label">变量名</span>
            <input
              v-model="formState.name"
              class="pe-input"
              type="text"
              placeholder="例如 user_name"
            />
          </label>

          <label class="pe-form-field">
            <span class="pe-form-label">默认值</span>
            <input
              v-model="formState.defaultValue"
              class="pe-input"
              type="text"
              placeholder="留空则运行时保留占位符"
            />
          </label>
        </div>

        <label class="pe-form-field">
          <span class="pe-form-label">说明</span>
          <textarea
            v-model="formState.description"
            class="pe-textarea"
            rows="3"
            placeholder="说明变量的用途和内容来源"
          ></textarea>
        </label>

        <div class="pe-form-actions">
          <button class="pe-btn pe-btn-primary" :disabled="loading || saving" type="submit">
            {{ saving ? '保存中...' : isEditing ? '更新变量' : '添加变量' }}
          </button>
          <button v-if="isEditing" class="pe-btn pe-btn-secondary" type="button" @click="resetForm">
            取消编辑
          </button>
        </div>
      </form>

      <div v-if="customVariables.length > 0" class="pe-custom-list">
        <article
          v-for="variable in customVariables"
          :key="variable.name"
          class="pe-variable-card pe-variable-card-custom"
        >
          <div class="pe-variable-row">
            <div>
              <div class="pe-variable-header">
                <div class="pe-variable-name">
                  {{ getPromptVariablePlaceholder(variable.name) }}
                </div>
                <span class="pe-variable-default"
                  >默认值：{{ variable.defaultValue || '未设置' }}</span
                >
              </div>
              <p class="pe-variable-description">
                {{ variable.description || '未填写说明' }}
              </p>
            </div>
            <div class="pe-card-actions">
              <button class="pe-btn pe-btn-secondary pe-btn-sm" @click="handleEdit(variable.name)">
                编辑
              </button>
              <button class="pe-btn pe-btn-danger pe-btn-sm" @click="handleDelete(variable.name)">
                删除
              </button>
            </div>
          </div>
        </article>
      </div>

      <div v-else class="pe-empty-state">
        暂无自定义变量。保存后可在系统提示词中使用
        <code v-pre>{{ variable_name }}</code>
        形式引用。
      </div>
    </section>
  </div>
</template>

<style scoped>
.pe-variables-manager {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 16px;
}

.pe-info-box,
.pe-form-card,
.pe-variable-card,
.pe-empty-state {
  background: var(--theme-background-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 8px;
}

.pe-info-box,
.pe-form-card,
.pe-empty-state {
  padding: 16px;
}

.pe-info-title,
.pe-section-title {
  margin: 0;
  color: var(--theme-text);
}

.pe-info-title {
  font-size: 16px;
  margin-bottom: 8px;
}

.pe-info-description,
.pe-section-description,
.pe-empty-state {
  color: var(--theme-text-secondary);
  font-size: 13px;
  line-height: 1.6;
}

.pe-variable-meta {
  color: var(--theme-text-secondary);
  font-size: 13px;
  line-height: 1.6;
  margin-top: 6px;
}

.pe-variable-description {
  color: var(--theme-text-secondary);
  font-size: 13px;
  line-height: 1.6;
  margin-top: 6px;
}

.pe-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.pe-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.pe-section-title {
  font-size: 15px;
  margin-bottom: 4px;
}

.pe-variable-grid,
.pe-custom-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
}

.pe-variable-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
}

.pe-variable-card-system {
  border-color: rgba(59, 130, 246, 0.2);
}

.pe-variable-card-custom {
  border-color: rgba(16, 185, 129, 0.2);
}

.pe-variable-header {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  height: 21px;
}

.pe-variable-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--theme-text);
  height: 21px;
  line-height: 21px;
  display: flex;
  align-items: center;
}

.pe-variable-default {
  font-size: 12px;
  color: var(--theme-text-secondary);
  background: var(--theme-background-tertiary, rgba(0, 0, 0, 0.05));
  padding: 2px 8px;
  border-radius: 4px;
}

.pe-variable-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.pe-card-actions,
.pe-form-actions {
  display: flex;
  gap: 8px;
}

.pe-form-actions {
  margin-top: 16px;
}

.pe-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.pe-form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pe-form-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--theme-text);
}

.pe-input,
.pe-textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--theme-border);
  border-radius: 6px;
  background: var(--theme-background-tertiary);
  color: var(--theme-text);
  font-family: var(--theme-font);
  font-size: 13px;
}

.pe-input:focus,
.pe-textarea:focus {
  outline: none;
  border-color: var(--theme-accent);
}

.pe-textarea {
  resize: vertical;
}

.pe-btn {
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 13px;
  font-family: var(--theme-font);
}

.pe-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.pe-btn-sm {
  padding: 6px 10px;
}

.pe-btn-primary {
  background: var(--theme-accent);
  color: #fff;
}

.pe-btn-secondary {
  background: transparent;
  border-color: var(--theme-border);
  color: var(--theme-text);
}

.pe-btn-danger {
  background: rgba(239, 68, 68, 0.08);
  border-color: rgba(239, 68, 68, 0.2);
  color: var(--theme-danger, #ef4444);
}

.pe-error-message,
.pe-success-message {
  padding: 12px 14px;
  border-radius: 6px;
  font-size: 13px;
}

.pe-error-message {
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.2);
  color: var(--theme-danger, #ef4444);
}

.pe-success-message {
  background: rgba(34, 197, 94, 0.08);
  border: 1px solid rgba(34, 197, 94, 0.2);
  color: var(--theme-success, #22c55e);
}

@media (max-width: 768px) {
  .pe-form-grid {
    grid-template-columns: 1fr;
  }

  .pe-variable-row,
  .pe-section-header {
    flex-direction: column;
    align-items: stretch;
  }

  .pe-card-actions,
  .pe-form-actions {
    flex-wrap: wrap;
  }
}
</style>
