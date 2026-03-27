<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { usePptExport } from '@renderer/composables/usePptExport'
import { usePptTemplatePreview } from '@renderer/composables/usePptTemplatePreview'
import { getPptExportErrorIcon, getPptExportProgressSteps } from '@renderer/utils/pptExportDialog'
import PptTemplatePicker from './ppt-export/PptTemplatePicker.vue'
import PptSlideDetailPanel from './ppt-export/PptSlideDetailPanel.vue'
import PptSlideThumbnailStrip from './ppt-export/PptSlideThumbnailStrip.vue'

interface Props {
  /** 是否显示对话框 */
  visible: boolean
  /** 消息内容（Markdown 格式） */
  content: string
  /** 文件标题（可选） */
  title?: string
  /** 初始模板 ID（来自当前会话已选模板） */
  initialTemplateId?: string
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  initialTemplateId: ''
})

interface Emits {
  (e: 'close'): void
  (e: 'exported'): void
  (e: 'showToast', message: string, type?: 'success' | 'error' | 'info'): void
}

const emit = defineEmits<Emits>()

const {
  isLoading,
  isGenerating,
  exportStage,
  exportConfig,
  error,
  selectedCount,
  hasPreview,
  canGenerate,
  loadingMessage,
  previewData,
  preview,
  toggleSlideSelection,
  selectAllSlides,
  deselectAllSlides,
  updateStyleSource,
  generate,
  download,
  reset,
  clearError
} = usePptExport()

/** 选中的模板 ID */
const selectedTemplateId = ref('')

/** 当前查看的页面索引 */
const currentSlideIndex = ref(0)

/** 可用模板列表 */
const availableTemplates = computed(() => previewData.value?.availableTemplates ?? [])

/** 当前查看的幻灯片 */
const currentSlide = computed(() => {
  return exportConfig.value?.slides.find((slide) => slide.index === currentSlideIndex.value)
})

/** 生成进度步骤 */
const progressSteps = computed(() => getPptExportProgressSteps(exportStage.value))

const { templatePreviewMap } = usePptTemplatePreview(availableTemplates)

watch(
  () => props.visible,
  async (visible) => {
    if (!visible) {
      reset()
      currentSlideIndex.value = 0
      return
    }

    if (!props.content) {
      return
    }

    clearError()
    const initialTemplateId = props.initialTemplateId || undefined

    if (initialTemplateId) {
      selectedTemplateId.value = initialTemplateId
    }

    await preview(props.content, initialTemplateId)
    currentSlideIndex.value = 0
  },
  { immediate: true }
)

watch(selectedTemplateId, (templateId) => {
  if (!exportConfig.value || !templateId) {
    return
  }

  if (
    exportConfig.value.styleSource.type === 'template' &&
    exportConfig.value.styleSource.templateId === templateId
  ) {
    return
  }

  void updateStyleSource({ type: 'template', templateId })
})

watch(
  exportConfig,
  (config) => {
    if (!config) {
      return
    }

    if (config.styleSource.type === 'template') {
      selectedTemplateId.value = config.styleSource.templateId
    }
  },
  { immediate: true }
)

watch(availableTemplates, (templates) => {
  if (!templates.length) {
    selectedTemplateId.value = ''
    return
  }

  const hasSelectedTemplate = templates.some((template) => template.id === selectedTemplateId.value)
  if (!hasSelectedTemplate) {
    selectedTemplateId.value = templates[0].id
  }
})

watch(
  () => exportConfig.value?.slides,
  (slides) => {
    if (!slides?.length) {
      currentSlideIndex.value = 0
      return
    }

    const hasCurrentSlide = slides.some((slide) => slide.index === currentSlideIndex.value)
    if (!hasCurrentSlide) {
      currentSlideIndex.value = slides[0].index
    }
  },
  { immediate: true }
)

function handleClose(): void {
  if (!isGenerating.value) {
    emit('close')
  }
}

function handleToggleAll(): void {
  if (selectedCount.value === exportConfig.value?.slides.length) {
    deselectAllSlides()
  } else {
    selectAllSlides()
  }
}

async function handleExport(): Promise<void> {
  if (!canGenerate.value) {
    return
  }

  const result = await generate(props.content, props.title || '演示文稿')
  if (result?.success) {
    download(result)
    emit('showToast', 'PPT 已开始下载', 'success')
    emit('exported')
  }
}

async function handleRetry(): Promise<void> {
  if (!props.content) {
    return
  }

  clearError()
  await preview(props.content, selectedTemplateId.value || undefined)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="visible" class="ppt-export-dialog-overlay" @click.self="handleClose">
        <div
          class="ppt-export-dialog"
          :class="`ppt-export-dialog-stage-${exportStage}`"
          role="dialog"
          aria-modal="true"
          :aria-busy="isLoading || isGenerating"
        >
          <div class="ppt-export-dialog-header">
            <div>
              <h3 class="ppt-export-dialog-title">导出 PowerPoint</h3>
              <p class="ppt-export-dialog-subtitle">选择要导出的页面和模板</p>
            </div>
            <button
              type="button"
              class="btn ppt-export-dialog-close"
              :disabled="isGenerating"
              @click="handleClose"
            >
              关闭
            </button>
          </div>

          <div class="ppt-export-dialog-body">
            <div
              v-if="isLoading"
              class="ppt-export-loading"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              <div class="ppt-export-spinner"></div>
              <span>{{ loadingMessage }}</span>
            </div>

            <div v-if="exportStage !== 'idle' && !isLoading" class="ppt-export-progress">
              <div
                v-for="step in progressSteps"
                :key="step.key"
                class="ppt-export-progress-step"
                :class="{ active: step.active, done: step.done }"
              >
                <span class="ppt-export-progress-dot"></span>
                <span>{{ step.label }}</span>
              </div>
            </div>

            <div v-if="error" class="ppt-export-error" :class="`ppt-export-error-${error.type}`">
              <div class="ppt-export-error-content">
                <span class="ppt-export-error-icon">{{ getPptExportErrorIcon(error.type) }}</span>
                <span class="ppt-export-error-message">{{ error.message }}</span>
              </div>
              <div class="ppt-export-error-actions">
                <button
                  v-if="error.retryable"
                  type="button"
                  class="ppt-export-error-retry"
                  @click="handleRetry"
                >
                  重试
                </button>
                <button type="button" class="ppt-export-error-close" @click="clearError">×</button>
              </div>
            </div>

            <template v-if="hasPreview">
              <div v-if="previewData?.warning" class="ppt-export-warning">
                {{ previewData.warning }}
              </div>

              <div class="ppt-export-main-layout">
                <div class="ppt-export-left-panel">
                  <PptTemplatePicker
                    :templates="availableTemplates"
                    :selected-template-id="selectedTemplateId"
                    :template-preview-map="templatePreviewMap"
                    @select-template="selectedTemplateId = $event"
                  />
                </div>

                <div class="ppt-export-right-panel">
                  <PptSlideDetailPanel
                    :slide="currentSlide"
                    :is-generating="isGenerating"
                    :selected-count="selectedCount"
                    :total-slides="exportConfig?.slides.length || 0"
                    @toggle-all="handleToggleAll"
                    @toggle-slide-selection="
                      currentSlide && toggleSlideSelection(currentSlide.index)
                    "
                  />

                  <PptSlideThumbnailStrip
                    :slides="exportConfig?.slides || []"
                    :current-slide-index="currentSlideIndex"
                    @select-slide="currentSlideIndex = $event"
                    @toggle-selection="toggleSlideSelection"
                  />
                </div>
              </div>
            </template>
          </div>

          <div class="ppt-export-dialog-footer">
            <span class="ppt-export-status">
              <template v-if="isGenerating">{{ loadingMessage }}</template>
              <template v-else-if="hasPreview">
                已选择 {{ selectedCount }} / {{ exportConfig?.slides.length }} 页
              </template>
              <template v-else-if="isLoading">{{ loadingMessage }}</template>
            </span>
            <div class="ppt-export-actions">
              <button
                type="button"
                class="ppt-export-btn ppt-export-btn-cancel"
                :disabled="isGenerating"
                @click="handleClose"
              >
                取消
              </button>
              <button
                type="button"
                class="ppt-export-btn ppt-export-btn-export"
                :disabled="!canGenerate"
                @click="handleExport"
              >
                <span v-if="isGenerating" class="ppt-export-btn-spinner"></span>
                {{ isGenerating ? '生成中...' : '导出 PPT' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ppt-export-dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(11, 11, 12, 0.82);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
  padding: calc(54px + env(safe-area-inset-top, 0px)) 24px 24px;
  overflow: hidden;
}

.ppt-export-dialog {
  width: min(960px, calc(100vw - 48px));
  height: min(720px, calc(100vh - 96px - env(safe-area-inset-top, 0px)));
  background: var(--sm-color-surface-3);
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: border-color var(--sm-transition-fast);
}

.ppt-export-dialog-stage-generating {
  border-color: var(--sm-color-border-accent);
}

.ppt-export-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--sm-color-border-subtle);
  flex-shrink: 0;
}

.ppt-export-dialog-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
  margin: 0;
  letter-spacing: -0.01em;
}

.ppt-export-dialog-subtitle {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--sm-color-text-secondary);
}

.ppt-export-dialog-close {
  min-width: 64px;
  height: 32px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  border-radius: 999px;
  transition:
    border-color var(--sm-transition-fast),
    color var(--sm-transition-fast),
    background-color var(--sm-transition-fast);
}

.ppt-export-dialog-close:hover:not(:disabled) {
  border-color: var(--sm-color-border-accent);
  color: var(--sm-color-text-primary);
}

.ppt-export-dialog-close:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.ppt-export-dialog-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0;
}

.ppt-export-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 32px;
  color: var(--sm-color-text-secondary);
}

.ppt-export-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--sm-color-border-default);
  border-top-color: var(--sm-color-accent);
  border-radius: 50%;
  animation: ppt-export-spin 0.8s linear infinite;
}

.ppt-export-progress {
  display: flex;
  gap: 10px;
  margin: 16px 20px 0;
  padding: 12px 14px;
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-md);
  background: var(--sm-color-surface-2);
  flex-wrap: wrap;
}

.ppt-export-progress-step {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--sm-color-text-tertiary);
  font-size: 12px;
  font-weight: 500;
}

.ppt-export-progress-step.active {
  color: var(--sm-color-accent-hover);
}

.ppt-export-progress-step.done {
  color: var(--theme-success);
}

.ppt-export-progress-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.9;
}

@keyframes ppt-export-spin {
  to {
    transform: rotate(360deg);
  }
}

.ppt-export-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 16px 20px 0;
  padding: 12px 14px;
  border-radius: var(--sm-radius-md);
  border: 1px solid;
  font-size: 13px;
}

.ppt-export-error-parse {
  background: rgba(197, 161, 101, 0.08);
  border-color: rgba(197, 161, 101, 0.22);
  color: var(--theme-warning);
}

.ppt-export-error-style {
  background: rgba(199, 120, 120, 0.08);
  border-color: rgba(199, 120, 120, 0.22);
  color: var(--theme-danger);
}

.ppt-export-error-generate {
  background: rgba(199, 120, 120, 0.08);
  border-color: rgba(199, 120, 120, 0.22);
  color: var(--theme-danger);
}

.ppt-export-error-download {
  background: rgba(199, 120, 120, 0.08);
  border-color: rgba(199, 120, 120, 0.22);
  color: var(--theme-danger);
}

.ppt-export-error-network {
  background: rgba(199, 120, 120, 0.08);
  border-color: rgba(199, 120, 120, 0.22);
  color: var(--theme-danger);
}

.ppt-export-error-content {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
}

.ppt-export-error-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: color-mix(in srgb, currentColor 15%, transparent);
  font-size: 12px;
  font-weight: 700;
}

.ppt-export-error-message {
  flex: 1;
}

.ppt-export-error-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ppt-export-error-retry {
  padding: 4px 10px;
  border: 1px solid currentColor;
  border-radius: var(--sm-radius-sm);
  background: transparent;
  color: inherit;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.ppt-export-error-retry:hover {
  background: color-mix(in srgb, currentColor 10%, transparent);
}

.ppt-export-error-close {
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  opacity: 0.7;
  transition: opacity 0.2s ease;
}

.ppt-export-error-close:hover {
  opacity: 1;
}

.ppt-export-warning {
  margin: 16px 20px 0;
  padding: 10px 12px;
  border: 1px solid rgba(245, 158, 11, 0.2);
  border-radius: var(--sm-radius-md);
  background: rgba(245, 158, 11, 0.08);
  color: var(--theme-warning);
  font-size: 12px;
  line-height: 1.5;
}

.ppt-export-main-layout {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 0;
  overflow: hidden;
}

.ppt-export-left-panel {
  width: 260px;
  flex-shrink: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid var(--sm-color-border-subtle);
  padding: 16px;
}

.ppt-export-right-panel {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow: hidden;
  padding: 20px;
}

.ppt-export-dialog-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 20px;
  border-top: 1px solid var(--sm-color-border-subtle);
  background: var(--sm-color-surface-2);
  flex-shrink: 0;
}

.ppt-export-status {
  font-size: 13px;
  color: var(--sm-color-text-secondary);
}

.ppt-export-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ppt-export-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 16px;
  height: 36px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition:
    border-color var(--sm-transition-fast),
    color var(--sm-transition-fast),
    background-color var(--sm-transition-fast),
    opacity var(--sm-transition-fast);
}

.ppt-export-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.ppt-export-btn-cancel {
  border: 1px solid var(--sm-color-border-default);
  background: var(--sm-color-surface-1);
  color: var(--sm-color-text-secondary);
}

.ppt-export-btn-cancel:hover:not(:disabled) {
  border-color: var(--sm-color-border-strong);
  color: var(--sm-color-text-primary);
  background: var(--sm-color-surface-hover);
}

.ppt-export-btn-export {
  border: 1px solid var(--sm-color-border-accent);
  background: rgba(142, 149, 217, 0.12);
  color: var(--sm-color-text-primary);
}

.ppt-export-btn-export:hover:not(:disabled) {
  background: rgba(142, 149, 217, 0.18);
  border-color: rgba(161, 167, 230, 0.6);
}

.ppt-export-btn-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: ppt-export-spin 0.6s linear infinite;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--sm-transition-medium);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.fade-enter-active .ppt-export-dialog,
.fade-leave-active .ppt-export-dialog {
  transition:
    transform var(--sm-transition-medium),
    opacity var(--sm-transition-medium);
}

.fade-enter-from .ppt-export-dialog,
.fade-leave-to .ppt-export-dialog {
  transform: translateY(var(--sm-motion-distance-md));
  opacity: 0;
}

@media (max-width: 960px) {
  .ppt-export-dialog {
    width: min(1120px, calc(100vw - 24px));
    height: calc(100vh - 48px);
  }

  .ppt-export-main-layout {
    flex-direction: column;
  }

  .ppt-export-left-panel {
    width: 100%;
    height: 200px;
    border-right: none;
    border-bottom: 1px solid var(--sm-color-border-subtle);
  }

  .ppt-export-dialog-footer {
    padding: 12px 16px;
  }

  .ppt-export-actions {
    gap: 8px;
  }

  .ppt-export-btn {
    height: 32px;
    padding: 0 12px;
    font-size: 12px;
  }
}
</style>
