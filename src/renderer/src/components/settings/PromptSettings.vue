<script setup lang="ts">
import { reactive, onMounted, watch } from 'vue'
import type { PromptConfig, ToolDescriptionLevel } from '@renderer/types'

interface Props {
  modelValue: PromptConfig
}

interface Emits {
  (e: 'update:modelValue', value: PromptConfig): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const localConfig = reactive<PromptConfig>({
  enableEnhancedPrompt: true,
  toolDescriptionLevel: 'detailed',
  fewShotCount: 3,
  customSystemPrompt: ''
})

// 从主进程加载配置
async function loadConfig() {
  try {
    const config = await window.api.prompt.getConfig()
    if (config) {
      Object.assign(localConfig, config)
    }
  } catch (error) {
    console.error('加载提示词配置失败:', error)
  }
}

// 保存配置
async function saveConfig() {
  try {
    const result = await window.api.prompt.updateConfig({ ...localConfig })
    if (result.success) {
      emit('update:modelValue', { ...localConfig })
    } else {
      console.error('保存提示词配置失败:', result.error)
    }
  } catch (error) {
    console.error('保存提示词配置失败:', error)
  }
}

// 更新配置并保存
function updateConfig<K extends keyof PromptConfig>(key: K, value: PromptConfig[K]): void {
  localConfig[key] = value
  saveConfig()
}

// 组件挂载时加载配置
onMounted(() => {
  loadConfig()
})

// 监听 props 变化
watch(
  () => props.modelValue,
  (newValue) => {
    if (newValue) {
      Object.assign(localConfig, newValue)
    }
  },
  { immediate: true, deep: true }
)
</script>

<template>
  <div class="tab-content">
    <div class="info-box">
      <h3 class="info-title">提示词工程优化</h3>
      <p class="info-description">
        增强版 ReAct 提示词可以帮助 AI 更好地使用工具，提高推理能力和错误处理能力。
      </p>
    </div>

    <div class="form-group">
      <label>
        <input
          type="checkbox"
          :checked="localConfig.enableEnhancedPrompt"
          @change="
            updateConfig('enableEnhancedPrompt', ($event.target as HTMLInputElement).checked)
          "
        />
        <span>启用增强版 ReAct 提示词</span>
      </label>
      <p class="help-text">
        启用后将使用增强版的系统提示词，包含详细的推理指导、错误处理策略和最佳实践。
      </p>
    </div>

    <h3 class="form-section-title">工具描述配置</h3>

    <div class="form-group">
      <label>工具描述详细程度</label>
      <select
        :value="localConfig.toolDescriptionLevel"
        class="input"
        @change="
          updateConfig(
            'toolDescriptionLevel',
            ($event.target as HTMLSelectElement).value as ToolDescriptionLevel
          )
        "
      >
        <option value="minimal">精简（仅基础描述）</option>
        <option value="basic">基础（参数列表）</option>
        <option value="detailed">详细（参数说明 + 使用建议）</option>
      </select>
      <p class="help-text">
        控制传递给 AI 的工具描述详细程度。详细程度越高，AI 使用工具的效果越好，但也会消耗更多
        token。
      </p>
    </div>

    <h3 class="form-section-title">Few-shot 示例配置</h3>

    <div class="form-group">
      <label>Few-shot 示例数量: {{ localConfig.fewShotCount }}</label>
      <input
        type="range"
        :value="localConfig.fewShotCount || 0"
        min="0"
        max="5"
        step="1"
        class="slider"
        @input="updateConfig('fewShotCount', Number(($event.target as HTMLInputElement).value))"
      />
      <div class="slider-labels">
        <span>0</span>
        <span>5</span>
      </div>
      <p class="help-text">
        在系统提示词中包含的示例数量。示例可以帮助 AI 理解如何正确使用工具，但会增加 token 消耗。
      </p>
    </div>

    <h3 class="form-section-title">自定义系统提示词</h3>

    <div class="form-group">
      <label>自定义提示词（可选）</label>
      <textarea
        :value="localConfig.customSystemPrompt || ''"
        class="textarea"
        rows="8"
        placeholder="输入自定义的系统提示词...留空则使用默认提示词"
        @input="
          updateConfig(
            'customSystemPrompt',
            ($event.target as HTMLTextAreaElement).value || undefined
          )
        "
      ></textarea>
      <p class="help-text">
        如果提供自定义提示词，它将完全覆盖默认的 ReAct 系统提示词。仅高级用户使用。
      </p>
    </div>

    <div class="form-actions">
      <button class="btn btn-primary" @click="saveConfig">保存配置</button>
      <button class="btn btn-secondary" @click="loadConfig">重置为默认</button>
    </div>
  </div>
</template>

<style scoped>
.tab-content {
  padding: 20px;
}

.info-box {
  padding: 16px;
  margin-bottom: 24px;
  background: var(--theme-background-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 6px;
}

.info-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--theme-text);
  margin: 0 0 8px 0;
}

.info-description {
  font-size: 13px;
  color: var(--theme-text-secondary);
  margin: 0;
  line-height: 1.6;
}

.form-group {
  margin-bottom: 24px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--theme-text);
  font-weight: 500;
}

.form-group label span {
  margin-left: 8px;
}

.form-group input[type='checkbox'] {
  width: 16px;
  height: 16px;
  margin: 0;
  cursor: pointer;
}

.help-text {
  margin-top: 8px;
  font-size: 12px;
  color: var(--theme-text-secondary);
  line-height: 1.5;
}

.form-section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--theme-text);
  margin: 28px 0 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--theme-border);
}

.input,
.textarea {
  width: 100%;
  padding: 10px 12px;
  background: var(--theme-background);
  border: 1px solid var(--theme-border);
  border-radius: 4px;
  color: var(--theme-text);
  font-size: 13px;
  font-family: inherit;
  transition: border-color 0.2s;
}

.input:focus,
.textarea:focus {
  outline: none;
  border-color: var(--theme-accent);
}

.input {
  cursor: pointer;
}

.textarea {
  resize: vertical;
  font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace;
  line-height: 1.6;
}

.slider {
  width: 100%;
  margin: 8px 0;
  cursor: pointer;
}

.slider-labels {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--theme-text-secondary);
  margin-top: 4px;
}

.form-actions {
  margin-top: 32px;
  padding-top: 20px;
  border-top: 1px solid var(--theme-border);
  display: flex;
  gap: 12px;
}

.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: var(--theme-accent);
  color: white;
}

.btn-primary:hover {
  opacity: 0.9;
}

.btn-secondary {
  background: var(--theme-background-secondary);
  color: var(--theme-text);
  border: 1px solid var(--theme-border);
}

.btn-secondary:hover {
  background: var(--theme-background);
}
</style>
