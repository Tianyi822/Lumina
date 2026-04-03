<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { usePromptEngineeringStore } from '@renderer/stores/promptEngineeringStore'
import { usePromptManager } from '@renderer/composables/settings/usePromptManager'
import { getPromptVariablePlaceholder, resolveSystemPromptVariables } from '@shared/utils'

const store = usePromptEngineeringStore()
const { customVariables, systemVariables, configLoading, saving } = storeToRefs(store)
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
  <div class="sm-prompt-variables">
    <div class="sm-settings-banner">
      <div>
        <h3 class="sm-settings-page__section-title">动态变量管理</h3>
        <p class="sm-settings-page__section-description">
          系统变量会在运行时自动求值，自定义变量会持久化到提示词配置中，可在系统提示词和测试沙盘里复用。
        </p>
      </div>
    </div>

    <section class="sm-prompt-variables__section">
      <div class="sm-prompt-variables__section-header">
        <div>
          <h4 class="sm-prompt-variables__section-title">系统变量</h4>
          <p class="sm-prompt-variables__section-description">只读显示，可直接在提示词中使用。</p>
        </div>
      </div>

      <div class="sm-prompt-variables__grid">
        <article
          v-for="variable in systemVariables"
          :key="variable.name"
          class="sm-settings-card sm-prompt-variables__card sm-prompt-variables__card--system"
        >
          <div class="sm-prompt-variables__name">
            {{ getPromptVariablePlaceholder(variable.name) }}
          </div>
          <p class="sm-prompt-variables__description">{{ variable.description }}</p>
          <p class="sm-prompt-variables__meta">
            当前值：{{ systemVariableValues[variable.name] || '运行时生成' }}
          </p>
          <p class="sm-prompt-variables__meta">求值规则：{{ variable.evalRule || '运行时求值' }}</p>
        </article>
      </div>
    </section>

    <section class="sm-prompt-variables__section">
      <div class="sm-prompt-variables__section-header">
        <div>
          <h4 class="sm-prompt-variables__section-title">自定义变量</h4>
          <p class="sm-prompt-variables__section-description">
            适合维护 `user_name`、`user_info`、`context` 等业务变量。
          </p>
        </div>
      </div>

      <form class="sm-settings-card sm-prompt-variables__form" @submit.prevent="handleSubmit">
        <div class="sm-prompt-variables__form-grid">
          <label class="sm-prompt-variables__field">
            <span class="sm-prompt-variables__label">变量名</span>
            <input
              v-model="formState.name"
              class="sm-input"
              type="text"
              placeholder="例如 user_name"
            />
          </label>

          <label class="sm-prompt-variables__field">
            <span class="sm-prompt-variables__label">默认值</span>
            <input
              v-model="formState.defaultValue"
              class="sm-input"
              type="text"
              placeholder="留空则运行时保留占位符"
            />
          </label>
        </div>

        <label class="sm-prompt-variables__field">
          <span class="sm-prompt-variables__label">说明</span>
          <textarea
            v-model="formState.description"
            class="sm-textarea"
            rows="3"
            placeholder="说明变量的用途和内容来源"
          ></textarea>
        </label>

        <div class="sm-settings-actions sm-prompt-variables__form-actions">
          <button
            class="sm-button sm-button--primary"
            :disabled="configLoading || saving"
            type="submit"
          >
            {{ saving ? '保存中...' : isEditing ? '更新变量' : '添加变量' }}
          </button>
          <button
            v-if="isEditing"
            class="sm-button sm-button--secondary"
            type="button"
            @click="resetForm"
          >
            取消编辑
          </button>
        </div>
      </form>

      <div v-if="customVariables.length > 0" class="sm-prompt-variables__custom-list">
        <article
          v-for="variable in customVariables"
          :key="variable.name"
          class="sm-settings-card sm-prompt-variables__card sm-prompt-variables__card--custom"
        >
          <div class="sm-prompt-variables__card-main">
            <div class="sm-prompt-variables__card-info">
              <div class="sm-prompt-variables__name-row">
                <span class="sm-prompt-variables__name">{{
                  getPromptVariablePlaceholder(variable.name)
                }}</span>
              </div>
              <p class="sm-prompt-variables__description">
                {{ variable.description || '未填写说明' }}
              </p>
              <div class="sm-prompt-variables__meta-row">
                <span class="sm-prompt-variables__meta-label">默认值:</span>
                <span class="sm-prompt-variables__meta-value">{{
                  variable.defaultValue || '未设置'
                }}</span>
              </div>
            </div>
            <div class="sm-prompt-variables__card-actions">
              <button
                class="sm-button sm-button--secondary sm-button--small"
                @click="handleEdit(variable.name)"
              >
                编辑
              </button>
              <button
                class="sm-button sm-button--danger sm-button--small"
                @click="handleDelete(variable.name)"
              >
                删除
              </button>
            </div>
          </div>
        </article>
      </div>

      <div v-else class="sm-empty sm-prompt-variables__empty">
        暂无自定义变量。保存后可在系统提示词中使用
        <code v-pre>{{ variable_name }}</code>
        形式引用。
      </div>
    </section>
  </div>
</template>

<style scoped>
.sm-prompt-variables {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-5);
}

.sm-prompt-variables__section {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-3);
}

.sm-prompt-variables__section-title {
  margin: 0;
  font-size: 15px;
  color: var(--sm-color-text-primary);
}

.sm-prompt-variables__section-description,
.sm-prompt-variables__description,
.sm-prompt-variables__meta {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--sm-color-text-secondary);
}

.sm-prompt-variables__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--sm-space-3);
}

.sm-prompt-variables__custom-list {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-3);
}

.sm-prompt-variables__card--system {
  border-color: var(--sm-color-accent-28);
}

.sm-prompt-variables__card--custom {
  width: 50%;
}

.sm-prompt-variables__name {
  font-size: 14px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
  font-family: var(--sm-font-mono);
}

.sm-prompt-variables__card-main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sm-space-4);
}

.sm-prompt-variables__card-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-2);
}

.sm-prompt-variables__meta-row,
.sm-prompt-variables__card-actions {
  display: flex;
  align-items: center;
  gap: var(--sm-space-2);
}

.sm-prompt-variables__meta-label {
  font-size: 12px;
  color: var(--sm-color-text-tertiary);
}

.sm-prompt-variables__meta-value {
  padding: 2px 8px;
  border-radius: var(--sm-radius-sm);
  background: var(--sm-color-bg-embedded);
  color: var(--sm-color-text-secondary);
  font-size: 12px;
  font-family: var(--sm-font-mono);
}

.sm-prompt-variables__form {
  gap: var(--sm-space-4);
}

.sm-prompt-variables__form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--sm-space-3);
}

.sm-prompt-variables__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sm-prompt-variables__label {
  font-size: 13px;
  font-weight: 500;
  color: var(--sm-color-text-primary);
}

.sm-prompt-variables__form-actions {
  margin-top: var(--sm-space-2);
}

.sm-prompt-variables__empty code {
  font-family: var(--sm-font-mono);
}

@media (max-width: 768px) {
  .sm-prompt-variables__form-grid {
    grid-template-columns: 1fr;
  }

  .sm-prompt-variables__card--custom {
    width: 100%;
  }

  .sm-prompt-variables__card-main {
    flex-direction: column;
  }

  .sm-prompt-variables__card-actions,
  .sm-prompt-variables__form-actions {
    flex-wrap: wrap;
  }
}
</style>
