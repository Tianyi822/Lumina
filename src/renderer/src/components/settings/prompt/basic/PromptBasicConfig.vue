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
  fewShotCount: 0,
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
  <div class="pe-form-container">
    <!-- 说明区域 -->
    <div class="pe-info-box">
      <h3 class="pe-info-title">基础配置</h3>
      <p class="pe-info-description">
        配置提示词工程的核心参数，包括增强提示词、工具描述、Few-shot 示例和自定义系统提示词。
      </p>
    </div>

    <!-- 增强版 ReAct 提示词 -->
    <div class="form-group setting-switch-card">
      <label class="form-label" for="enable-enhanced-prompt">启用增强版 ReAct 提示词</label>
      <div class="toggle-wrapper">
        <input
          id="enable-enhanced-prompt"
          v-model="localConfig.enableEnhancedPrompt"
          type="checkbox"
          class="toggle-input"
        />
        <label for="enable-enhanced-prompt" class="toggle-label"></label>
      </div>
    </div>
    <p class="pe-help-text">
      启用后将使用面向工具场景的系统提示词，保留必要角色约束和沙箱流程说明。
    </p>

    <!-- 工具描述配置 -->
    <h3 class="pe-section-title">工具描述配置</h3>

    <div class="pe-form-group">
      <label>工具描述详细程度</label>
      <select v-model="localConfig.toolDescriptionLevel" class="pe-select">
        <option value="minimal">精简（仅基础描述）</option>
        <option value="basic">基础（参数列表）</option>
        <option value="detailed">详细（参数说明 + 使用建议）</option>
      </select>
      <p class="pe-help-text">
        控制传递给 AI 的工具描述详细程度。详细程度越高，AI 使用工具的效果越好，但也会消耗更多
        token。
      </p>
    </div>

    <!-- Few-shot 示例配置 -->
    <h3 class="pe-section-title">Few-shot 示例配置</h3>

    <div class="form-group setting-switch-card">
      <label class="form-label" for="enable-dynamic-examples">启用动态 Few-shot 示例</label>
      <div class="toggle-wrapper">
        <input
          id="enable-dynamic-examples"
          v-model="localConfig.enableDynamicExamples"
          type="checkbox"
          class="toggle-input"
        />
        <label for="enable-dynamic-examples" class="toggle-label"></label>
      </div>
    </div>
    <p class="pe-help-text">
      从历史对话中自动提取成功的工具调用作为示例，帮助 AI 学习如何正确使用工具。
    </p>

    <div class="pe-form-group">
      <label>Few-shot 示例数量: {{ localConfig.fewShotCount }}</label>
      <input
        v-model.number="localConfig.fewShotCount"
        type="range"
        min="0"
        max="2"
        step="1"
        class="pe-slider"
      />
      <div class="pe-slider-labels">
        <span>0</span>
        <span>2</span>
      </div>
      <p class="pe-help-text">
        在系统提示词中包含的示例数量。示例可以帮助 AI 理解如何正确使用工具，但会增加 token 消耗。
      </p>
    </div>

    <div v-if="localConfig.enableDynamicExamples" class="pe-form-group">
      <label>最大动态示例数量: {{ localConfig.maxDynamicExamples }}</label>
      <input
        v-model.number="localConfig.maxDynamicExamples"
        type="range"
        min="0"
        max="100"
        step="10"
        class="pe-slider"
      />
      <div class="pe-slider-labels">
        <span>0</span>
        <span>100</span>
      </div>
      <p class="pe-help-text">最多保留的动态示例数量。动态示例从历史对话中提取。</p>
    </div>

    <div v-if="localConfig.enableDynamicExamples" class="pe-form-group">
      <label>动态示例最低质量分数: {{ localConfig.dynamicExampleMinQuality }}</label>
      <input
        v-model.number="localConfig.dynamicExampleMinQuality"
        type="range"
        min="0"
        max="1"
        step="0.1"
        class="pe-slider"
      />
      <div class="pe-slider-labels">
        <span>0.0</span>
        <span>1.0</span>
      </div>
      <p class="pe-help-text">
        动态示例的最低质量分数要求。只有质量分数高于此阈值的示例才会被保留。
      </p>
    </div>

    <div v-if="localConfig.enableDynamicExamples" class="pe-form-group">
      <label>自动提取间隔天数: {{ localConfig.autoExtractIntervalDays }}</label>
      <input
        v-model.number="localConfig.autoExtractIntervalDays"
        type="range"
        min="1"
        max="30"
        step="1"
        class="pe-slider"
      />
      <div class="pe-slider-labels">
        <span>1</span>
        <span>30</span>
      </div>
      <p class="pe-help-text">自动从历史对话中提取动态示例的间隔天数。</p>
    </div>

    <!-- 提示词压缩优化 -->
    <h3 class="pe-section-title">提示词压缩优化</h3>

    <div class="form-group setting-switch-card">
      <label class="form-label" for="enable-prompt-optimization">启用提示词压缩优化</label>
      <div class="toggle-wrapper">
        <input
          id="enable-prompt-optimization"
          v-model="localConfig.enablePromptOptimization"
          type="checkbox"
          class="toggle-input"
        />
        <label for="enable-prompt-optimization" class="toggle-label"></label>
      </div>
    </div>
    <p class="pe-help-text">
      当提示词超过模型 token 限制的一定比例时，自动压缩提示词以减少 token 消耗。
    </p>

    <div class="pe-form-group">
      <label>压缩激进程度</label>
      <select v-model="localConfig.optimizationAggressiveness" class="pe-select">
        <option value="conservative">保守（较晚触发压缩）</option>
        <option value="balanced">平衡（推荐）</option>
        <option value="aggressive">激进（较早触发压缩）</option>
      </select>
      <p class="pe-help-text">
        控制压缩触发的阈值。保守模式在 token 超过 50% 时开始压缩，平衡模式在 40%，激进模式在 30%。
      </p>
    </div>

    <!-- 提示词缓存 -->
    <h3 class="pe-section-title">提示词缓存</h3>

    <div class="form-group setting-switch-card">
      <label class="form-label" for="enable-prompt-cache">启用提示词缓存</label>
      <div class="toggle-wrapper">
        <input
          id="enable-prompt-cache"
          v-model="localConfig.enablePromptCache"
          type="checkbox"
          class="toggle-input"
        />
        <label for="enable-prompt-cache" class="toggle-label"></label>
      </div>
    </div>
    <p class="pe-help-text">
      启用后将缓存构建好的提示词，减少重复构建的开销。适合配置和工具不频繁变化的场景。
    </p>

    <!-- 自定义系统提示词 -->
    <h3 class="pe-section-title">自定义系统提示词</h3>

    <div class="pe-form-group">
      <label>自定义提示词（可选）</label>
      <textarea
        v-model="localConfig.customSystemPrompt"
        class="pe-textarea"
        rows="8"
        placeholder="输入自定义的系统提示词...留空则使用默认提示词"
      ></textarea>
      <p class="pe-help-text">如果提供自定义提示词，它将完全覆盖默认的 ReAct 系统提示词。</p>
    </div>

    <!-- 操作按钮 -->
    <div class="pe-form-actions">
      <button
        class="pe-btn pe-btn-secondary"
        :disabled="configLoading || saving"
        @click="resetToDefault"
      >
        {{ configLoading ? '重置中...' : '重置为默认' }}
      </button>
      <button class="pe-btn pe-btn-primary" :disabled="configLoading || saving" @click="handleSave">
        {{ saving ? '保存中...' : '保存配置' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
/* 容器 */
.pe-form-container {
  padding: 16px;
}

/* 说明区域 */
.pe-info-box {
  padding: 16px;
  margin-bottom: 24px;
  background: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 6px;
}

.pe-info-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--theme-text);
  margin: 0 0 8px 0;
}

.pe-info-description {
  font-size: 13px;
  color: var(--theme-text-secondary);
  margin: 0;
  line-height: 1.6;
}

/* 表单组 */
.pe-form-group {
  margin-bottom: 20px;
}

.pe-form-group > label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--theme-text);
  margin-bottom: 8px;
}

/* 开关卡片样式 */
.setting-switch-card {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
  padding: 10px 16px;
  border-radius: calc(var(--theme-radius-sm) + 2px);
  border: 1px solid rgba(120, 134, 156, 0.18);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.03) 100%),
    rgba(16, 24, 40, 0.04);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.12),
    0 10px 24px rgba(15, 23, 42, 0.05);
  transition:
    border-color 0.2s ease,
    background 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.2s ease;
}

.setting-switch-card:hover {
  border-color: rgba(120, 134, 156, 0.28);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.045) 100%),
    rgba(16, 24, 40, 0.05);
}

.setting-switch-card:focus-within {
  border-color: color-mix(in srgb, var(--theme-accent) 58%, white 42%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.14),
    0 0 0 3px rgba(99, 102, 241, 0.12),
    0 16px 30px rgba(15, 23, 42, 0.08);
  transform: translateY(-1px);
}

.form-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--theme-text);
  letter-spacing: 0.01em;
  line-height: 1;
  margin: 0;
}

/* Toggle Switch */
.toggle-wrapper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  height: 26px;
}

.toggle-input {
  display: none;
}

.toggle-label {
  position: relative;
  display: inline-block;
  width: 48px;
  height: 26px;
  margin: 0;
  background: rgba(100, 116, 139, 0.22);
  border: 1px solid rgba(100, 116, 139, 0.26);
  box-shadow: inset 0 1px 3px rgba(15, 23, 42, 0.14);
  border-radius: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.toggle-label::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 3px;
  width: 20px;
  height: 20px;
  background: #fff;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.25);
  border-radius: 50%;
  transform: translateY(-50%);
  transition: left 0.2s ease;
}

.toggle-input:checked + .toggle-label {
  background: var(--theme-accent);
  border-color: var(--theme-accent);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.12);
}

.toggle-input:checked + .toggle-label::after {
  left: 25px;
}

/* 输入控件 */
.pe-select,
.pe-textarea {
  width: 100%;
  padding: 8px 12px;
  font-size: 13px;
  color: var(--theme-text);
  background: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 4px;
  transition: border-color 0.15s ease;
}

.pe-select:focus,
.pe-textarea:focus {
  outline: none;
  border-color: var(--theme-accent);
}

/* 下拉框 */
.pe-select {
  appearance: none;
  -webkit-appearance: none;
  background:
    var(--icon-arrow-down-svg) no-repeat right 16px center,
    linear-gradient(
      135deg,
      var(--glass-white-013, rgba(255, 255, 255, 0.013)) 0%,
      var(--glass-white-007, rgba(255, 255, 255, 0.007)) 100%
    ),
    rgba(0, 0, 0, 0.017);
  background-size: 12px, auto, auto;
  padding-right: 44px;
  cursor: pointer;
}

.pe-select:hover {
  background:
    var(--icon-arrow-down-svg) no-repeat right 16px center,
    linear-gradient(
      135deg,
      var(--glass-white-013, rgba(255, 255, 255, 0.013)) 0%,
      var(--glass-white-007, rgba(255, 255, 255, 0.007)) 100%
    ),
    rgba(0, 0, 0, 0.017);
  background-size: 12px, auto, auto;
}

.pe-select:focus {
  background:
    var(--icon-arrow-down-svg) no-repeat right 16px center,
    linear-gradient(
      135deg,
      var(--glass-white-02, rgba(255, 255, 255, 0.02)) 0%,
      var(--glass-white-013, rgba(255, 255, 255, 0.013)) 100%
    ),
    rgba(0, 0, 0, 0.02);
  background-size: 12px, auto, auto;
}

/* 文本域 */
.pe-textarea {
  font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace;
  line-height: 1.6;
  resize: vertical;
}

/* 滑块 */
.pe-slider {
  width: 100%;
  margin: 8px 0;
  cursor: pointer;
  accent-color: var(--theme-accent);
}

.pe-slider-labels {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--theme-text-secondary);
  margin-top: 4px;
}

/* 帮助文本 */
.pe-help-text {
  margin-top: 8px;
  font-size: 12px;
  color: var(--theme-text-secondary);
  line-height: 1.5;
}

/* 章节标题 */
.pe-section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--theme-text);
  margin: 28px 0 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--theme-border);
}

/* 操作按钮区 */
.pe-form-actions {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: flex-end;
  margin-top: 32px;
  padding-top: 20px;
  border-top: 1px solid var(--theme-border);
}

.pe-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 16px;
  font-size: 13px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
  line-height: 1.2;
  box-sizing: border-box;
}

.pe-btn-secondary {
  background: var(--theme-bg-secondary);
  color: var(--theme-text);
  border: 1px solid var(--theme-border);
}

.pe-btn-secondary:hover {
  background: var(--theme-bg-tertiary);
}

.pe-btn-primary {
  background: var(--theme-accent);
  color: white;
  border: none;
}

.pe-btn-primary:hover:not(:disabled) {
  opacity: 0.9;
}

.pe-btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* 消息提示 */
.pe-error-message {
  margin-top: 16px;
  padding: 12px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 4px;
  color: var(--theme-error, #ef4444);
  font-size: 13px;
}

.pe-success-message {
  margin-top: 16px;
  padding: 12px;
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.2);
  border-radius: 4px;
  color: var(--theme-success, #22c55e);
  font-size: 13px;
}
</style>
