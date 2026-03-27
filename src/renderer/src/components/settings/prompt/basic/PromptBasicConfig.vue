<script setup lang="ts">
import { reactive, watch } from 'vue'
import { storeToRefs } from 'pinia'
import type { PromptConfig } from '@shared/types/config'
import { usePromptEngineeringStore } from '@renderer/stores/promptEngineeringStore'
import { usePromptManager } from '@renderer/composables/settings/usePromptManager'

const promptEngineeringStore = usePromptEngineeringStore()
const { promptConfig, configLoading, saving } = storeToRefs(promptEngineeringStore)
const { savePromptConfig, resetPromptConfig } = usePromptManager()

// 本地表单状态
const localConfig = reactive<PromptConfig>({
  enableEnhancedPrompt: true,
  toolDescriptionLevel: 'detailed',
  fewShotCount: 3,
  customSystemPrompt: '',
  enablePromptCache: false,
  enableDynamicExamples: false,
  autoExtractIntervalDays: 7,
  dynamicExampleMinQuality: 0.6,
  maxDynamicExamples: 20,
  enablePromptOptimization: false,
  optimizationAggressiveness: 'balanced',
  customVariables: []
})

async function resetToDefault(): Promise<void> {
  const reset = await resetPromptConfig()
  if (reset) {
    Object.assign(localConfig, promptEngineeringStore.promptConfig)
  }
}

async function handleSave(): Promise<void> {
  await savePromptConfig({ ...localConfig })
}

watch(
  promptConfig,
  (newValue) => {
    Object.assign(localConfig, newValue)
  },
  { deep: true, immediate: true }
)
</script>

<template>
  <div class="sm-prompt-basic">
    <div class="sm-settings-banner">
      <div>
        <h3 class="sm-settings-page__section-title">基础配置</h3>
        <p class="sm-settings-page__section-description">
          配置提示词工程的核心参数，包括增强提示词、工具描述、Few-shot 示例和自定义系统提示词。
        </p>
      </div>
    </div>

    <div class="sm-prompt-basic__switch">
      <label class="sm-prompt-basic__switch-label" for="enable-enhanced-prompt">
        启用增强版 ReAct 提示词
      </label>
      <div class="sm-prompt-basic__toggle">
        <input
          id="enable-enhanced-prompt"
          v-model="localConfig.enableEnhancedPrompt"
          type="checkbox"
          class="sm-prompt-basic__toggle-input"
        />
        <label for="enable-enhanced-prompt" class="sm-prompt-basic__toggle-track"></label>
      </div>
    </div>
    <p class="sm-prompt-basic__help">
      启用后将使用增强版的系统提示词，包含详细的推理指导、错误处理策略和最佳实践。
    </p>

    <h3 class="sm-prompt-basic__section-title">工具描述配置</h3>

    <div class="sm-prompt-basic__field">
      <label class="sm-prompt-basic__field-label">工具描述详细程度</label>
      <select v-model="localConfig.toolDescriptionLevel" class="sm-select">
        <option value="minimal">精简（仅基础描述）</option>
        <option value="basic">基础（参数列表）</option>
        <option value="detailed">详细（参数说明 + 使用建议）</option>
      </select>
      <p class="sm-prompt-basic__help">
        控制传递给 AI 的工具描述详细程度。详细程度越高，AI 使用工具的效果越好，但也会消耗更多
        token。
      </p>
    </div>

    <h3 class="sm-prompt-basic__section-title">Few-shot 示例配置</h3>

    <div class="sm-prompt-basic__switch">
      <label class="sm-prompt-basic__switch-label" for="enable-dynamic-examples">
        启用动态 Few-shot 示例
      </label>
      <div class="sm-prompt-basic__toggle">
        <input
          id="enable-dynamic-examples"
          v-model="localConfig.enableDynamicExamples"
          type="checkbox"
          class="sm-prompt-basic__toggle-input"
        />
        <label for="enable-dynamic-examples" class="sm-prompt-basic__toggle-track"></label>
      </div>
    </div>
    <p class="sm-prompt-basic__help">
      从历史对话中自动提取成功的工具调用作为示例，帮助 AI 学习如何正确使用工具。
    </p>

    <div class="sm-prompt-basic__field">
      <label class="sm-prompt-basic__field-label">Few-shot 示例数量: {{ localConfig.fewShotCount }}</label>
      <input
        v-model.number="localConfig.fewShotCount"
        type="range"
        min="0"
        max="5"
        step="1"
        class="sm-prompt-basic__range"
      />
      <div class="sm-prompt-basic__range-labels">
        <span>0</span>
        <span>5</span>
      </div>
      <p class="sm-prompt-basic__help">
        在系统提示词中包含的示例数量。示例可以帮助 AI 理解如何正确使用工具，但会增加 token 消耗。
      </p>
    </div>

    <div v-if="localConfig.enableDynamicExamples" class="sm-prompt-basic__field">
      <label class="sm-prompt-basic__field-label">
        最大动态示例数量: {{ localConfig.maxDynamicExamples }}
      </label>
      <input
        v-model.number="localConfig.maxDynamicExamples"
        type="range"
        min="0"
        max="100"
        step="10"
        class="sm-prompt-basic__range"
      />
      <div class="sm-prompt-basic__range-labels">
        <span>0</span>
        <span>100</span>
      </div>
      <p class="sm-prompt-basic__help">最多保留的动态示例数量。动态示例从历史对话中提取。</p>
    </div>

    <div v-if="localConfig.enableDynamicExamples" class="sm-prompt-basic__field">
      <label class="sm-prompt-basic__field-label">
        动态示例最低质量分数: {{ localConfig.dynamicExampleMinQuality }}
      </label>
      <input
        v-model.number="localConfig.dynamicExampleMinQuality"
        type="range"
        min="0"
        max="1"
        step="0.1"
        class="sm-prompt-basic__range"
      />
      <div class="sm-prompt-basic__range-labels">
        <span>0.0</span>
        <span>1.0</span>
      </div>
      <p class="sm-prompt-basic__help">
        动态示例的最低质量分数要求。只有质量分数高于此阈值的示例才会被保留。
      </p>
    </div>

    <div v-if="localConfig.enableDynamicExamples" class="sm-prompt-basic__field">
      <label class="sm-prompt-basic__field-label">
        自动提取间隔天数: {{ localConfig.autoExtractIntervalDays }}
      </label>
      <input
        v-model.number="localConfig.autoExtractIntervalDays"
        type="range"
        min="1"
        max="30"
        step="1"
        class="sm-prompt-basic__range"
      />
      <div class="sm-prompt-basic__range-labels">
        <span>1</span>
        <span>30</span>
      </div>
      <p class="sm-prompt-basic__help">自动从历史对话中提取动态示例的间隔天数。</p>
    </div>

    <h3 class="sm-prompt-basic__section-title">提示词压缩优化</h3>

    <div class="sm-prompt-basic__switch">
      <label class="sm-prompt-basic__switch-label" for="enable-prompt-optimization">
        启用提示词压缩优化
      </label>
      <div class="sm-prompt-basic__toggle">
        <input
          id="enable-prompt-optimization"
          v-model="localConfig.enablePromptOptimization"
          type="checkbox"
          class="sm-prompt-basic__toggle-input"
        />
        <label for="enable-prompt-optimization" class="sm-prompt-basic__toggle-track"></label>
      </div>
    </div>
    <p class="sm-prompt-basic__help">
      当提示词超过模型 token 限制的一定比例时，自动压缩提示词以减少 token 消耗。
    </p>

    <div class="sm-prompt-basic__field">
      <label class="sm-prompt-basic__field-label">压缩激进程度</label>
      <select v-model="localConfig.optimizationAggressiveness" class="sm-select">
        <option value="conservative">保守（较晚触发压缩）</option>
        <option value="balanced">平衡（推荐）</option>
        <option value="aggressive">激进（较早触发压缩）</option>
      </select>
      <p class="sm-prompt-basic__help">
        控制压缩触发的阈值。保守模式在 token 超过 50% 时开始压缩，平衡模式在 40%，激进模式在 30%。
      </p>
    </div>

    <h3 class="sm-prompt-basic__section-title">提示词缓存</h3>

    <div class="sm-prompt-basic__switch">
      <label class="sm-prompt-basic__switch-label" for="enable-prompt-cache">启用提示词缓存</label>
      <div class="sm-prompt-basic__toggle">
        <input
          id="enable-prompt-cache"
          v-model="localConfig.enablePromptCache"
          type="checkbox"
          class="sm-prompt-basic__toggle-input"
        />
        <label for="enable-prompt-cache" class="sm-prompt-basic__toggle-track"></label>
      </div>
    </div>
    <p class="sm-prompt-basic__help">
      启用后将缓存构建好的提示词，减少重复构建的开销。适合配置和工具不频繁变化的场景。
    </p>

    <h3 class="sm-prompt-basic__section-title">自定义系统提示词</h3>

    <div class="sm-prompt-basic__field">
      <label class="sm-prompt-basic__field-label">自定义提示词（可选）</label>
      <textarea
        v-model="localConfig.customSystemPrompt"
        class="sm-textarea sm-prompt-basic__textarea"
        rows="8"
        placeholder="输入自定义的系统提示词...留空则使用默认提示词"
      ></textarea>
      <p class="sm-prompt-basic__help">如果提供自定义提示词，它将完全覆盖默认的 ReAct 系统提示词。</p>
    </div>

    <div class="sm-settings-actions sm-prompt-basic__actions">
      <button
        class="sm-button sm-button--secondary"
        :disabled="configLoading || saving"
        @click="resetToDefault"
      >
        {{ configLoading ? '重置中...' : '重置为默认' }}
      </button>
      <button
        class="sm-button sm-button--primary"
        :disabled="configLoading || saving"
        @click="handleSave"
      >
        {{ saving ? '保存中...' : '保存配置' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.sm-prompt-basic {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-4);
}

.sm-prompt-basic__section-title {
  margin: 8px 0 0;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--sm-color-border-subtle);
  font-size: 14px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
}

.sm-prompt-basic__field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sm-prompt-basic__field-label,
.sm-prompt-basic__switch-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--sm-color-text-primary);
}

.sm-prompt-basic__help {
  margin: -4px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--sm-color-text-secondary);
}

.sm-prompt-basic__switch {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sm-space-3);
  padding: 12px 16px;
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-md);
  background: var(--sm-color-surface-2);
}

.sm-prompt-basic__toggle {
  height: 26px;
}

.sm-prompt-basic__toggle-input {
  display: none;
}

.sm-prompt-basic__toggle-track {
  position: relative;
  display: inline-block;
  width: 48px;
  height: 26px;
  background: var(--sm-color-border-default);
  border: 1px solid transparent;
  border-radius: 999px;
  cursor: pointer;
  transition:
    background-color var(--sm-transition-fast),
    border-color var(--sm-transition-fast);
}

.sm-prompt-basic__toggle-track::after {
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

.sm-prompt-basic__toggle-input:checked + .sm-prompt-basic__toggle-track {
  background: var(--sm-color-accent);
  border-color: var(--sm-color-border-accent);
}

.sm-prompt-basic__toggle-input:checked + .sm-prompt-basic__toggle-track::after {
  left: 25px;
}

.sm-prompt-basic__range {
  width: 100%;
  margin: 0;
  accent-color: var(--sm-color-accent);
}

.sm-prompt-basic__range-labels {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--sm-color-text-secondary);
}

.sm-prompt-basic__textarea {
  font-family: var(--sm-font-mono);
}

.sm-prompt-basic__actions {
  margin-top: var(--sm-space-2);
  padding-top: var(--sm-space-4);
  border-top: 1px solid var(--sm-color-border-subtle);
}
</style>
