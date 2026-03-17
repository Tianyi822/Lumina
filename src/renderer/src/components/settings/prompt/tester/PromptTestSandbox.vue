<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { usePromptEngineeringStore } from '@renderer/stores/promptEngineeringStore'
import { usePromptManager } from '@renderer/composables/settings/usePromptManager'
import type { TestPromptPayload } from '@shared/types/prompt'
import { getPromptVariablePlaceholder, resolveSystemPromptVariables } from '@shared/utils'

const store = usePromptEngineeringStore()
const { allVariables, variableOverrides, assembledPrompt, sandboxResult, hasExamples, loading } =
  storeToRefs(store)
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
  return !loading.value
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
  <div class="pe-sandbox">
    <div class="pe-sandbox-column pe-sandbox-controls">
      <div class="pe-panel">
        <h3 class="pe-panel-title">测试问题</h3>
        <textarea
          v-model="testQuery"
          class="pe-textarea"
          rows="5"
          placeholder="输入要验证的提问内容..."
        ></textarea>
      </div>

      <div class="pe-panel">
        <div class="pe-panel-header">
          <div>
            <h3 class="pe-panel-title">变量覆盖</h3>
            <p class="pe-panel-description">留空时使用系统值或自定义变量默认值。</p>
          </div>
          <button class="pe-btn pe-btn-secondary pe-btn-sm" @click="clearVariableOverrides()">
            清空覆盖
          </button>
        </div>

        <div class="pe-variable-list">
          <label v-for="variable in allVariables" :key="variable.name" class="pe-variable-item">
            <span class="pe-variable-name">{{ getPromptVariablePlaceholder(variable.name) }}</span>
            <span class="pe-variable-hint">
              {{
                variable.type === 'system'
                  ? `当前值：${systemVariableValues[variable.name] || '运行时生成'}`
                  : `默认值：${variable.defaultValue || '未设置'}`
              }}
            </span>
            <input
              :value="variableOverrides[variable.name] || ''"
              class="pe-input"
              type="text"
              placeholder="输入覆盖值"
              @input="
                handleVariableChange(variable.name, ($event.target as HTMLInputElement).value)
              "
            />
          </label>
        </div>
      </div>

      <div class="pe-panel">
        <h3 class="pe-panel-title">示例设置</h3>

        <label class="pe-switch-row">
          <input v-model="includeExamples" type="checkbox" />
          <span>包含 Few-shot 示例</span>
        </label>

        <label class="pe-range-field">
          <span>示例数量：{{ exampleCount }}</span>
          <input
            v-model.number="exampleCount"
            class="pe-range"
            type="range"
            min="0"
            max="5"
            step="1"
            :disabled="!includeExamples"
          />
        </label>

        <p class="pe-panel-description">
          {{
            hasExamples
              ? '将按质量分数选择示例参与测试。'
              : '当前还没有可用示例，预览时会自动跳过。'
          }}
        </p>
      </div>

      <div class="pe-panel pe-actions-panel">
        <div class="pe-action-row">
          <button class="pe-btn pe-btn-secondary" :disabled="!canRunAction" @click="handlePreview">
            {{ loading ? '处理中...' : '预览提示词' }}
          </button>
          <button class="pe-btn pe-btn-primary" :disabled="!canRunAction" @click="handleTest">
            {{ loading ? '执行中...' : '执行测试' }}
          </button>
          <button class="pe-btn pe-btn-secondary" @click="handleClearResult">清空结果</button>
        </div>
      </div>
    </div>

    <div class="pe-sandbox-column pe-sandbox-results">
      <div class="pe-panel pe-result-panel">
        <div class="pe-panel-header">
          <div>
            <h3 class="pe-panel-title">组装后的提示词</h3>
            <p class="pe-panel-description">用于核对变量替换和示例拼装结果。</p>
          </div>
        </div>

        <pre v-if="assembledPrompt" class="pe-code-block">{{ assembledPrompt }}</pre>
        <div v-else class="pe-empty-state">点击“预览提示词”后，这里会显示最终发给模型的内容。</div>
      </div>

      <div class="pe-panel pe-result-panel">
        <div class="pe-panel-header">
          <div>
            <h3 class="pe-panel-title">模型响应</h3>
            <p class="pe-panel-description">执行测试后展示响应内容和耗时信息。</p>
          </div>
        </div>

        <template v-if="sandboxResult?.success">
          <pre class="pe-code-block pe-response-block">{{ sandboxResult.response }}</pre>
          <div class="pe-result-meta">
            <span>模型：{{ sandboxResult.modelUsed || '默认模型' }}</span>
            <span>耗时：{{ sandboxResult.duration ?? 0 }} ms</span>
            <span>
              Token：{{ sandboxResult.tokenUsage?.prompt ?? 0 }} +
              {{ sandboxResult.tokenUsage?.completion ?? 0 }} =
              {{ sandboxResult.tokenUsage?.total ?? 0 }}
            </span>
          </div>
        </template>

        <div v-else-if="sandboxResult?.error" class="pe-error-box">
          {{ sandboxResult.error }}
        </div>

        <div v-else class="pe-empty-state">点击“执行测试”后，这里会显示模型的单次响应结果。</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pe-sandbox {
  display: grid;
  grid-template-columns: minmax(320px, 0.95fr) minmax(360px, 1.05fr);
  gap: 16px;
  padding: 16px;
}

.pe-sandbox-column {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.pe-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: var(--theme-background-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 8px;
}

.pe-panel-title {
  margin: 0;
  font-size: 15px;
  color: var(--theme-text);
}

.pe-panel-description,
.pe-variable-hint,
.pe-empty-state,
.pe-result-meta {
  font-size: 13px;
  color: var(--theme-text-secondary);
  line-height: 1.6;
}

.pe-panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.pe-action-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.pe-textarea,
.pe-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--theme-border);
  border-radius: 6px;
  background: var(--theme-background-tertiary);
  color: var(--theme-text);
  font-family: var(--theme-font);
  font-size: 13px;
}

.pe-textarea:focus,
.pe-input:focus {
  outline: none;
  border-color: var(--theme-accent);
}

.pe-textarea {
  resize: vertical;
}

.pe-variable-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pe-variable-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.pe-variable-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--theme-text);
  display: inline-flex;
  align-items: center;
  line-height: 1.2;
}

.pe-switch-row,
.pe-range-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: var(--theme-text);
  font-size: 13px;
}

.pe-range {
  width: 100%;
}

.pe-btn {
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 8px 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 13px;
  font-family: var(--theme-font);
  line-height: 1.2;
  box-sizing: border-box;
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

.pe-actions-panel {
  gap: 10px;
}

@media (max-width: 980px) {
  .pe-sandbox {
    grid-template-columns: minmax(0, 1fr);
  }
}

.pe-code-block {
  margin: 0;
  padding: 14px;
  background: rgba(15, 23, 42, 0.08);
  border-radius: 6px;
  color: var(--theme-text);
  font-family: var(--theme-font-mono);
  font-size: 12px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

.pe-response-block {
  min-height: 140px;
}

.pe-result-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.pe-warning-box,
.pe-error-box {
  padding: 12px 14px;
  border-radius: 6px;
  font-size: 13px;
}

.pe-warning-box {
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.2);
  color: var(--theme-warning, #f59e0b);
}

.pe-error-box {
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.2);
  color: var(--theme-danger, #ef4444);
}

@media (max-width: 960px) {
  .pe-sandbox {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .pe-panel-header,
  .pe-action-row {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
