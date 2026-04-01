<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { usePromptEngineeringStore } from '@renderer/stores'
import { usePromptManager } from '@renderer/composables/settings/usePromptManager'
import PromptBasicConfig from './prompt/basic/PromptBasicConfig.vue'
import ExampleManager from './prompt/examples/ExampleManager.vue'
import PromptVariablesManager from './prompt/variables/PromptVariablesManager.vue'
import PromptTestSandbox from './prompt/tester/PromptTestSandbox.vue'

const store = usePromptEngineeringStore()
const { initializing } = storeToRefs(store)
const {
  tabs,
  activeTab,
  feedbackMessage,
  feedbackType,
  hasFeedback,
  changeTab,
  dismissFeedback,
  initialize,
  cleanup
} = usePromptManager()

/** 组件挂载时初始化 */
onMounted(() => {
  void initialize()
})

onBeforeUnmount(() => {
  cleanup()
})
</script>

<template>
  <div class="sm-settings-page sm-prompt-settings">
    <header class="sm-settings-page__header">
      <h2 class="sm-settings-page__title">提示词工程</h2>
      <p class="sm-settings-page__description">
        统一管理系统提示词、变量、Few-shot 示例与测试沙箱，让所有提示词配置保持同一套表单语言。
      </p>
    </header>

    <section class="sm-settings-page__section sm-prompt-settings__shell">
      <div class="sm-prompt-settings__tabs">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          :class="['sm-tab', 'sm-prompt-settings__tab', { 'is-active': activeTab === tab.key }]"
          @click="changeTab(tab.key)"
        >
          {{ tab.label }}
        </button>
      </div>

      <Transition name="sm-prompt-feedback">
        <div
          v-if="hasFeedback"
          :class="[
            'sm-settings-feedback',
            feedbackType === 'error'
              ? 'sm-settings-feedback--error'
              : 'sm-settings-feedback--success'
          ]"
        >
          <span>{{ feedbackMessage }}</span>
          <button class="sm-prompt-settings__feedback-close" @click="dismissFeedback">关闭</button>
        </div>
      </Transition>

      <div class="sm-prompt-settings__content">
        <div v-if="activeTab === 'basic'" class="sm-prompt-settings__pane">
          <PromptBasicConfig />
        </div>

        <div v-else-if="activeTab === 'variables'" class="sm-prompt-settings__pane">
          <PromptVariablesManager />
        </div>

        <div v-else-if="activeTab === 'examples'" class="sm-prompt-settings__pane">
          <ExampleManager />
        </div>

        <div v-else-if="activeTab === 'sandbox'" class="sm-prompt-settings__pane">
          <PromptTestSandbox />
        </div>

        <Transition name="sm-prompt-overlay">
          <div v-if="initializing" class="sm-prompt-settings__loading">
            <span class="sm-spinner sm-spinner--large"></span>
            <span>加载中...</span>
          </div>
        </Transition>
      </div>
    </section>
  </div>
</template>

<style scoped>
.sm-prompt-settings__shell {
  min-height: 0;
  overflow: hidden;
}

.sm-prompt-settings__tabs {
  display: flex;
  gap: 4px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--sm-color-border-subtle);
  flex-shrink: 0;
}

.sm-prompt-settings__feedback-close {
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--sm-radius-sm);
  color: var(--sm-color-text-secondary);
  font-size: 12px;
  padding: 4px 8px;
  min-width: 44px;
  height: 24px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: 10px;
  opacity: 0.7;
}

.sm-prompt-settings__feedback-close:hover {
  color: var(--sm-color-text-primary);
  border-color: var(--sm-color-border-default);
  background: var(--sm-color-surface-2);
}

.sm-prompt-settings__content {
  flex: 1;
  overflow-y: auto;
  position: relative;
  min-height: 0;
}

.sm-prompt-settings__pane {
  min-height: 100%;
}

.sm-prompt-settings__loading {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--sm-space-3);
  background: rgba(11, 11, 12, 0.72);
  color: var(--sm-color-text-secondary);
  font-size: 14px;
  z-index: 2;
}

.sm-prompt-feedback-enter-active,
.sm-prompt-feedback-leave-active,
.sm-prompt-overlay-enter-active,
.sm-prompt-overlay-leave-active {
  transition: opacity 0.18s ease;
}

.sm-prompt-feedback-enter-from,
.sm-prompt-feedback-leave-to,
.sm-prompt-overlay-enter-from,
.sm-prompt-overlay-leave-to {
  opacity: 0;
}

@media (max-width: 720px) {
  .sm-prompt-settings__tabs {
    overflow-x: auto;
    padding: 0 12px;
  }

  .sm-settings-feedback {
    align-items: flex-start;
  }
}
</style>
