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
const { loading } = storeToRefs(store)
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
  <div class="prompt-engineering-settings">
    <!-- Tab 导航 -->
    <div class="pe-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        :class="['pe-tab-item', { 'pe-tab-active': activeTab === tab.key }]"
        @click="changeTab(tab.key)"
      >
        {{ tab.label }}
      </button>
    </div>

    <Transition name="pe-feedback">
      <div
        v-if="hasFeedback"
        :class="[
          'pe-feedback-box',
          feedbackType === 'error' ? 'pe-feedback-error' : 'pe-feedback-success'
        ]"
      >
        <span class="pe-feedback-message">{{ feedbackMessage }}</span>
        <button class="pe-feedback-close" @click="dismissFeedback">关闭</button>
      </div>
    </Transition>

    <div class="pe-content">
      <div v-if="activeTab === 'basic'" class="pe-tab-pane">
        <PromptBasicConfig />
      </div>

      <div v-else-if="activeTab === 'variables'" class="pe-tab-pane">
        <PromptVariablesManager />
      </div>

      <div v-else-if="activeTab === 'examples'" class="pe-tab-pane">
        <ExampleManager />
      </div>

      <div v-else-if="activeTab === 'sandbox'" class="pe-tab-pane">
        <PromptTestSandbox />
      </div>

      <Transition name="pe-overlay">
        <div v-if="loading" class="pe-loading-overlay">
          <span>加载中...</span>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.prompt-engineering-settings {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  --pe-panel-padding: 16px;
  --pe-panel-gap: 16px;
  --pe-feedback-radius: 10px;
}

.pe-tabs {
  display: flex;
  padding: 0 20px;
  border-bottom: 1px solid var(--theme-border);
  gap: 4px;
  flex-shrink: 0;
}

.pe-tab-item {
  padding: 12px 16px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--theme-text-secondary);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s ease;
  margin-bottom: -1px;
  font-family: var(--theme-font);
}

.pe-tab-item:hover {
  color: var(--theme-text);
}

.pe-tab-active {
  color: var(--theme-accent);
  border-bottom-color: var(--theme-accent);
}

.pe-feedback-box {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  border-top: 1px solid transparent;
  flex-shrink: 0;
  gap: 12px;
}

.pe-feedback-error {
  background: rgba(239, 68, 68, 0.08);
  border-top-color: rgba(239, 68, 68, 0.2);
}

.pe-feedback-success {
  background: rgba(34, 197, 94, 0.08);
  border-top-color: rgba(34, 197, 94, 0.2);
}

.pe-feedback-message {
  flex: 1;
  font-size: 13px;
  color: var(--theme-text);
  line-height: 1.5;
}

.pe-feedback-close {
  background: transparent;
  border: none;
  color: var(--theme-text-secondary);
  font-size: 12px;
  font-family: var(--theme-font);
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

.pe-feedback-close:hover {
  opacity: 1;
}

.pe-content {
  flex: 1;
  overflow-y: auto;
  position: relative;
  min-height: 0;
}

.pe-tab-pane {
  min-height: 100%;
}

.pe-loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.12);
  backdrop-filter: blur(2px);
  color: var(--theme-text-tertiary);
  font-size: 14px;
  z-index: 2;
}

.pe-feedback-enter-active,
.pe-feedback-leave-active,
.pe-overlay-enter-active,
.pe-overlay-leave-active {
  transition: opacity 0.18s ease;
}

.pe-feedback-enter-from,
.pe-feedback-leave-to,
.pe-overlay-enter-from,
.pe-overlay-leave-to {
  opacity: 0;
}

@media (max-width: 720px) {
  .pe-tabs {
    overflow-x: auto;
    padding: 0 12px;
  }

  .pe-feedback-box {
    align-items: flex-start;
  }
}
</style>
