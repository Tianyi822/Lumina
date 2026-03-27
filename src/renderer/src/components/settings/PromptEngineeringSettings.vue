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
  <div class="sm-settings-page prompt-engineering-settings">
    <header class="sm-settings-page__header">
      <p class="sm-settings-page__eyebrow">Prompts</p>
      <h2 class="sm-settings-page__title">提示词工程</h2>
      <p class="sm-settings-page__description">
        统一管理系统提示词、变量、Few-shot 示例与测试沙箱，让所有提示词配置保持同一套表单语言。
      </p>
    </header>

    <section class="sm-settings-page__section prompt-shell">
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
          <div v-if="initializing" class="pe-loading-overlay">
            <span>加载中...</span>
          </div>
        </Transition>
      </div>
    </section>
  </div>
</template>

<style scoped>
.prompt-engineering-settings {
  --pe-panel-padding: 16px;
  --pe-panel-gap: 16px;
  --pe-feedback-radius: var(--sm-radius-md);
}

.prompt-shell {
  min-height: 0;
  overflow: hidden;
}

.pe-tabs {
  display: flex;
  gap: 6px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--sm-color-border-subtle);
  gap: 4px;
  flex-shrink: 0;
}

.pe-tab-item {
  padding: 12px 16px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--sm-radius-sm);
  color: var(--sm-color-text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color var(--sm-transition-fast),
    border-color var(--sm-transition-fast),
    color var(--sm-transition-fast);
}

.pe-tab-item:hover {
  color: var(--sm-color-text-primary);
  background: var(--sm-color-surface-2);
  border-color: var(--sm-color-border-subtle);
}

.pe-tab-active {
  color: var(--sm-color-text-primary);
  border-color: var(--sm-color-border-accent);
  background: rgba(142, 149, 217, 0.08);
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
  background: rgba(199, 120, 120, 0.08);
  border-top-color: rgba(199, 120, 120, 0.24);
}

.pe-feedback-success {
  background: rgba(127, 176, 138, 0.08);
  border-top-color: rgba(127, 176, 138, 0.24);
}

.pe-feedback-message {
  flex: 1;
  font-size: 13px;
  color: var(--sm-color-text-primary);
  line-height: 1.5;
}

.pe-feedback-close {
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

.pe-feedback-close:hover {
  color: var(--sm-color-text-primary);
  border-color: var(--sm-color-border-default);
  background: var(--sm-color-surface-2);
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
  background: rgba(11, 11, 12, 0.72);
  color: var(--sm-color-text-secondary);
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

:deep(.pe-info-box),
:deep(.pe-form-card),
:deep(.pe-panel),
:deep(.pe-header-container),
:deep(.pe-table),
:deep(.pe-table-container),
:deep(.pe-variable-card),
:deep(.pe-dialog),
:deep(.pe-form-container) {
  background: var(--sm-color-surface-2);
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-md);
  box-shadow: none;
}

:deep(.pe-form-container) {
  padding: 0;
  border: none;
  background: transparent;
}

:deep(.pe-info-title),
:deep(.pe-panel-title),
:deep(.pe-section-title),
:deep(.pe-dialog-title),
:deep(.pe-stat-value),
:deep(.pe-variable-name),
:deep(.pe-table-header) {
  color: var(--sm-color-text-primary);
}

:deep(.pe-info-description),
:deep(.pe-section-description),
:deep(.pe-panel-description),
:deep(.pe-empty-state),
:deep(.pe-loading-text),
:deep(.pe-result-meta),
:deep(.pe-variable-hint),
:deep(.pe-filter-label),
:deep(.pe-stat-label),
:deep(.pe-table-info),
:deep(.pe-empty-text) {
  color: var(--sm-color-text-secondary);
}

:deep(.setting-switch-card) {
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-md);
  background: var(--sm-color-surface-2);
  box-shadow: none;
  transform: none;
}

:deep(.setting-switch-card:hover),
:deep(.setting-switch-card:focus-within) {
  border-color: var(--sm-color-border-accent);
  background: var(--sm-color-surface-hover);
  box-shadow: none;
  transform: none;
}

:deep(.toggle-label) {
  background: var(--sm-color-border-default);
  border: 1px solid transparent;
  box-shadow: none;
}

:deep(.toggle-label::after) {
  box-shadow: none;
}

:deep(.toggle-input:checked + .toggle-label) {
  background: var(--sm-color-accent);
  border-color: var(--sm-color-border-accent);
  box-shadow: none;
}

:deep(.pe-select),
:deep(.pe-textarea),
:deep(.pe-input),
:deep(.pe-filter-input),
:deep(.pe-filter-select) {
  background: var(--sm-color-surface-1);
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-sm);
  color: var(--sm-color-text-primary);
  box-shadow: none;
}

:deep(.pe-select:focus),
:deep(.pe-textarea:focus),
:deep(.pe-input:focus),
:deep(.pe-filter-input:focus),
:deep(.pe-filter-select:focus) {
  border-color: var(--sm-color-border-accent);
  box-shadow: none;
}

:deep(.pe-btn) {
  border-radius: var(--sm-radius-sm);
  box-shadow: none;
}

:deep(.pe-btn-secondary),
:deep(.pe-text-btn) {
  background: var(--sm-color-surface-2);
  border: 1px solid var(--sm-color-border-default);
  color: var(--sm-color-text-primary);
}

:deep(.pe-btn-primary) {
  background: rgba(142, 149, 217, 0.14);
  border: 1px solid var(--sm-color-border-accent);
  color: var(--sm-color-text-primary);
}

:deep(.pe-code-block),
:deep(.pe-prompt-block),
:deep(.pe-response-block) {
  background: var(--sm-color-bg-embedded);
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-md);
  color: var(--sm-color-text-secondary);
  box-shadow: none;
}

:deep(.pe-loading-state) {
  background: var(--sm-color-surface-2);
  border: 1px solid var(--sm-color-border-default);
  color: var(--sm-color-text-secondary);
}

:deep(.pe-loading-spinner) {
  border-color: rgba(255, 255, 255, 0.12);
  border-top-color: var(--sm-color-accent);
}

:deep(.pe-warning-box) {
  background: rgba(197, 161, 101, 0.08);
  border: 1px solid rgba(197, 161, 101, 0.22);
  color: var(--theme-warning);
}

:deep(.pe-error-box),
:deep(.pe-error-message) {
  background: rgba(199, 120, 120, 0.08);
  border: 1px solid rgba(199, 120, 120, 0.22);
  color: var(--theme-danger);
}

:deep(.pe-success-message) {
  background: rgba(127, 176, 138, 0.08);
  border: 1px solid rgba(127, 176, 138, 0.22);
  color: var(--theme-success);
}

:deep(.pe-dialog-overlay),
:deep(.pe-table-loading-mask) {
  backdrop-filter: none;
}

:deep(.pe-table-wrapper.pe-loading .pe-table-scroll) {
  filter: none;
  opacity: 0.48;
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
