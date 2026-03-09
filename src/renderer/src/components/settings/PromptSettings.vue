<script setup lang="ts">
import { reactive, watch, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import type { PromptConfig } from '@renderer/types'
import { useConfigStore } from '@renderer/stores'

const configStore = useConfigStore()
const { promptConfig, saving } = storeToRefs(configStore)

const localConfig = reactive<PromptConfig>({
  enableEnhancedPrompt: true,
  toolDescriptionLevel: 'detailed',
  fewShotCount: 3,
  customSystemPrompt: '',
  enableDynamicExamples: false,
  enablePromptOptimization: false,
  optimizationAggressiveness: 'balanced'
})

// 重置为默认配置
async function resetToDefault(): Promise<void> {
  try {
    const result = await window.api.prompt.resetConfig()
    if (result.success && result.config) {
      Object.assign(localConfig, result.config)
      configStore.updatePromptConfig({ ...result.config })
      await configStore.saveConfig()
      configStore.successMessage = '提示词配置已重置为默认值'
      setTimeout(() => {
        configStore.successMessage = ''
      }, 2000)
    } else {
      configStore.errorMessage = `重置提示词配置失败: ${result.error || '未知错误'}`
    }
  } catch (error) {
    configStore.errorMessage = `重置提示词配置失败: ${error instanceof Error ? error.message : String(error)}`
  }
}

// 保存配置
async function handleSave(): Promise<void> {
  configStore.updatePromptConfig({ ...localConfig })
  await configStore.saveConfig()
}

// 初始化时从 store 获取配置
onMounted(() => {
  if (promptConfig.value) {
    Object.assign(localConfig, promptConfig.value)
  }
})

// 监听 store 中 promptConfig 变化（如外部更新）
watch(
  promptConfig,
  (newValue) => {
    if (newValue) {
      Object.assign(localConfig, newValue)
    }
  },
  { deep: true }
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
          @change="localConfig.enableEnhancedPrompt = ($event.target as HTMLInputElement).checked"
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
      <select v-model="localConfig.toolDescriptionLevel" class="input">
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
      <label>
        <input
          type="checkbox"
          :checked="localConfig.enableDynamicExamples"
          @change="localConfig.enableDynamicExamples = ($event.target as HTMLInputElement).checked"
        />
        <span>启用动态 Few-shot 示例</span>
      </label>
      <p class="help-text">
        从历史对话中自动提取成功的工具调用作为示例，帮助 AI 学习如何正确使用工具。
      </p>
    </div>

    <div class="form-group">
      <label>Few-shot 示例数量: {{ localConfig.fewShotCount }}</label>
      <input
        v-model.number="localConfig.fewShotCount"
        type="range"
        min="0"
        max="5"
        step="1"
        class="slider"
      />
      <div class="slider-labels">
        <span>0</span>
        <span>5</span>
      </div>
      <p class="help-text">
        在系统提示词中包含的示例数量。示例可以帮助 AI 理解如何正确使用工具，但会增加 token 消耗。
      </p>
    </div>

    <h3 class="form-section-title">提示词压缩优化</h3>

    <div class="form-group">
      <label>
        <input
          type="checkbox"
          :checked="localConfig.enablePromptOptimization"
          @change="
            localConfig.enablePromptOptimization = ($event.target as HTMLInputElement).checked
          "
        />
        <span>启用提示词压缩优化</span>
      </label>
      <p class="help-text">
        当提示词超过模型 token 限制的一定比例时，自动压缩提示词以减少 token 消耗。
      </p>
    </div>

    <div class="form-group">
      <label>压缩激进程度</label>
      <select v-model="localConfig.optimizationAggressiveness" class="input">
        <option value="conservative">保守（较晚触发压缩）</option>
        <option value="balanced">平衡（推荐）</option>
        <option value="aggressive">激进（较早触发压缩）</option>
      </select>
      <p class="help-text">
        控制压缩触发的阈值。保守模式在 token 超过 50% 时开始压缩，平衡模式在 40%，激进模式在 30%。
      </p>
    </div>

    <h3 class="form-section-title">自定义系统提示词</h3>

    <div class="form-group">
      <label>自定义提示词（可选）</label>
      <textarea
        v-model="localConfig.customSystemPrompt"
        class="textarea"
        rows="8"
        placeholder="输入自定义的系统提示词...留空则使用默认提示词"
      ></textarea>
      <p class="help-text">
        如果提供自定义提示词，它将完全覆盖默认的 ReAct 系统提示词。仅高级用户使用。
      </p>
    </div>

    <div class="form-actions">
      <button class="btn btn-secondary" @click="resetToDefault">重置为默认</button>
      <button class="btn-primary" :disabled="saving" @click="handleSave">
        {{ saving ? '保存中...' : '保存配置' }}
      </button>
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

/* 覆盖全局样式的特定变体 */
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

.textarea {
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
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 32px;
}
</style>
