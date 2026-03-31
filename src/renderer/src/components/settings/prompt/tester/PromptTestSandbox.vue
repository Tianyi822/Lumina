<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { usePromptEngineeringStore } from '@renderer/stores/promptEngineeringStore'
import { usePromptManager } from '@renderer/composables/settings/usePromptManager'
import type { TestPromptPayload } from '@shared/types/prompt'
import { getPromptVariablePlaceholder, resolveSystemPromptVariables } from '@shared/utils'

const store = usePromptEngineeringStore()
const {
  allVariables,
  variableOverrides,
  assembledPrompt,
  sandboxResult,
  hasExamples,
  sandboxLoading,
  sandboxTesting
} = storeToRefs(store)
const {
  previewSandbox,
  runSandboxTest,
  clearSandboxResult,
  clearVariableOverrides,
  updateVariableOverride
} = usePromptManager()

const testQuery = ref('')
const includeExamples = ref(true)
const exampleCount = ref(3)
const systemVariableValues = computed(() => resolveSystemPromptVariables())

const canRunAction = computed(() => {
  return !sandboxLoading.value
})

function buildPayload(): TestPromptPayload {
  return {
    userQuery: testQuery.value,
    variables: variableOverrides.value,
    includeExamples: includeExamples.value,
    exampleCount: includeExamples.value ? exampleCount.value : 0
  }
}

async function handlePreview(): Promise<void> {
  await previewSandbox(buildPayload())
}

async function handleTest(): Promise<void> {
  await runSandboxTest(buildPayload())
}

function handleVariableChange(name: string, value: string): void {
  updateVariableOverride(name, value)
}

function handleClearResult(): void {
  clearSandboxResult()
}
</script>

<template>
  <div class="sm-prompt-sandbox">
    <div class="sm-prompt-sandbox__column">
      <div class="sm-settings-card sm-prompt-sandbox__panel">
        <h3 class="sm-prompt-sandbox__title">测试问题</h3>
        <textarea
          v-model="testQuery"
          class="sm-textarea"
          rows="5"
          placeholder="输入要验证的提问内容..."
        ></textarea>
      </div>

      <div class="sm-settings-card sm-prompt-sandbox__panel">
        <div class="sm-prompt-sandbox__actions">
          <button class="sm-button sm-button--secondary" :disabled="!canRunAction" @click="handlePreview">
            {{ sandboxLoading ? '处理中...' : '预览提示词' }}
          </button>
          <button class="sm-button sm-button--primary" :disabled="!canRunAction" @click="handleTest">
            {{ sandboxLoading ? '执行中...' : '执行测试' }}
          </button>
          <button class="sm-button sm-button--secondary" @click="handleClearResult">清空结果</button>
        </div>
      </div>

      <div class="sm-settings-card sm-prompt-sandbox__panel">
        <div class="sm-prompt-sandbox__panel-header">
          <div>
            <h3 class="sm-prompt-sandbox__title">变量覆盖</h3>
            <p class="sm-prompt-sandbox__description">留空时使用系统值或自定义变量默认值。</p>
          </div>
          <button class="sm-button sm-button--secondary sm-button--small" @click="clearVariableOverrides()">
            清空覆盖
          </button>
        </div>

        <div class="sm-prompt-sandbox__variable-list">
          <label
            v-for="variable in allVariables"
            :key="variable.name"
            class="sm-prompt-sandbox__variable-item"
          >
            <span class="sm-prompt-sandbox__variable-name">{{
              getPromptVariablePlaceholder(variable.name)
            }}</span>
            <span class="sm-prompt-sandbox__description">
              {{
                variable.type === 'system'
                  ? `当前值：${systemVariableValues[variable.name] || '运行时生成'}`
                  : `默认值：${variable.defaultValue || '未设置'}`
              }}
            </span>
            <input
              :value="variableOverrides[variable.name] || ''"
              class="sm-input"
              type="text"
              placeholder="输入覆盖值"
              @input="
                handleVariableChange(variable.name, ($event.target as HTMLInputElement).value)
              "
            />
          </label>
        </div>
      </div>

      <div class="sm-settings-card sm-prompt-sandbox__panel">
        <h3 class="sm-prompt-sandbox__title">示例设置</h3>

        <div class="sm-prompt-sandbox__switch">
          <label class="sm-prompt-sandbox__switch-label" for="include-examples">
            包含 Few-shot 示例
          </label>
          <div class="sm-prompt-sandbox__toggle">
            <input
              id="include-examples"
              v-model="includeExamples"
              type="checkbox"
              class="sm-prompt-sandbox__toggle-input"
            />
            <label for="include-examples" class="sm-prompt-sandbox__toggle-track"></label>
          </div>
        </div>

        <label class="sm-prompt-sandbox__range">
          <span>示例数量：{{ exampleCount }}</span>
          <input
            v-model.number="exampleCount"
            class="sm-prompt-sandbox__range-input"
            type="range"
            min="0"
            max="5"
            step="1"
            :disabled="!includeExamples"
          />
        </label>

        <p class="sm-prompt-sandbox__description">
          {{
            hasExamples
              ? '将按质量分数选择示例参与测试。'
              : '当前还没有可用示例，预览时会自动跳过。'
          }}
        </p>
      </div>
    </div>

    <div class="sm-prompt-sandbox__column">
      <div v-if="sandboxTesting" class="sm-settings-card sm-prompt-sandbox__panel">
        <div class="sm-prompt-sandbox__panel-header">
          <div>
            <h3 class="sm-prompt-sandbox__title">响应中</h3>
            <p class="sm-prompt-sandbox__description">正在等待模型返回结果。</p>
          </div>
        </div>
        <div class="sm-prompt-sandbox__loading">
          <span class="sm-spinner"></span>
          <span>模型正在响应，请稍候...</span>
        </div>
      </div>

      <div v-else-if="sandboxResult" class="sm-settings-card sm-prompt-sandbox__panel">
        <div class="sm-prompt-sandbox__panel-header">
          <div>
            <h3 class="sm-prompt-sandbox__title">模型响应</h3>
            <p class="sm-prompt-sandbox__description">执行测试后展示响应内容和耗时信息。</p>
          </div>
        </div>

        <template v-if="sandboxResult?.success">
          <pre class="sm-settings-code sm-prompt-sandbox__code sm-prompt-sandbox__code--response">{{
            sandboxResult.response
          }}</pre>
          <div class="sm-prompt-sandbox__meta">
            <span>模型：{{ sandboxResult.modelUsed || '默认模型' }}</span>
            <span>耗时：{{ sandboxResult.duration ?? 0 }} ms</span>
            <span>
              Token：{{ sandboxResult.tokenUsage?.prompt ?? 0 }} +
              {{ sandboxResult.tokenUsage?.completion ?? 0 }} =
              {{ sandboxResult.tokenUsage?.total ?? 0 }}
            </span>
          </div>
        </template>

        <div v-else-if="sandboxResult?.error" class="sm-notice sm-notice--error">
          {{ sandboxResult.error }}
        </div>
      </div>

      <div class="sm-settings-card sm-prompt-sandbox__panel">
        <div class="sm-prompt-sandbox__panel-header">
          <div>
            <h3 class="sm-prompt-sandbox__title">组装后的提示词</h3>
            <p class="sm-prompt-sandbox__description">用于核对变量替换和示例拼装结果。</p>
          </div>
        </div>

        <pre
          v-if="assembledPrompt"
          class="sm-settings-code sm-prompt-sandbox__code sm-prompt-sandbox__code--prompt"
        >{{ assembledPrompt }}</pre>
        <div v-else class="sm-empty sm-prompt-sandbox__empty">
          点击"预览提示词"后，这里会显示最终发给模型的内容。
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sm-prompt-sandbox {
  display: grid;
  grid-template-columns: minmax(320px, 0.95fr) minmax(360px, 1.05fr);
  gap: var(--sm-space-4);
}

.sm-prompt-sandbox__column {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-4);
}

.sm-prompt-sandbox__panel {
  gap: var(--sm-space-3);
}

.sm-prompt-sandbox__title {
  margin: 0;
  font-size: 15px;
  color: var(--sm-color-text-primary);
}

.sm-prompt-sandbox__description,
.sm-prompt-sandbox__meta {
  font-size: 13px;
  line-height: 1.6;
  color: var(--sm-color-text-secondary);
}

.sm-prompt-sandbox__panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sm-space-3);
}

.sm-prompt-sandbox__actions,
.sm-prompt-sandbox__meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sm-space-3);
  align-items: center;
}

.sm-prompt-sandbox__variable-list {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-3);
}

.sm-prompt-sandbox__variable-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sm-prompt-sandbox__variable-name,
.sm-prompt-sandbox__switch-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
}

.sm-prompt-sandbox__switch {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sm-space-3);
  padding: 12px 16px;
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-md);
  background: var(--sm-color-surface-2);
}

.sm-prompt-sandbox__toggle-input {
  display: none;
}

.sm-prompt-sandbox__toggle-track {
  position: relative;
  display: inline-block;
  width: 48px;
  height: 26px;
  border-radius: 999px;
  background: var(--sm-color-border-default);
  cursor: pointer;
  transition: background-color var(--sm-transition-fast);
}

.sm-prompt-sandbox__toggle-track::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--sm-color-text-primary);
  transform: translateY(-50%);
  transition: left var(--sm-transition-fast);
}

.sm-prompt-sandbox__toggle-input:checked + .sm-prompt-sandbox__toggle-track {
  background: var(--sm-color-accent);
}

.sm-prompt-sandbox__toggle-input:checked + .sm-prompt-sandbox__toggle-track::after {
  left: 25px;
}

.sm-prompt-sandbox__range {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 13px;
  color: var(--sm-color-text-primary);
}

.sm-prompt-sandbox__range-input {
  width: 100%;
  accent-color: var(--sm-color-accent);
}

.sm-prompt-sandbox__loading {
  min-height: 140px;
  display: flex;
  align-items: center;
  gap: var(--sm-space-3);
  padding: 14px;
  border-radius: var(--sm-radius-md);
  border: 1px solid var(--sm-color-border-default);
  background: var(--sm-color-surface-2);
  color: var(--sm-color-text-secondary);
  font-size: 13px;
}

.sm-prompt-sandbox__code {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.sm-prompt-sandbox__code--response {
  min-height: 140px;
}

.sm-prompt-sandbox__code--prompt {
  max-height: 420px;
  overflow: auto;
}

@media (max-width: 980px) {
  .sm-prompt-sandbox {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .sm-prompt-sandbox__panel-header {
    flex-direction: column;
    align-items: stretch;
  }

  .sm-prompt-sandbox__actions .sm-button {
    width: 100%;
  }
}
</style>
