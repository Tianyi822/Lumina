<script setup lang="ts">
import { watch, ref, computed } from 'vue'
import type { PptStyleSource } from '@shared/types/ppt-export'
import type { PptTemplateListItem } from '@shared/types/ppt-template'
import { usePptExport } from '@renderer/composables/usePptExport'

/**
 * Props 定义
 */
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

/**
 * Emits 定义
 */
interface Emits {
  (e: 'close'): void
  (e: 'exported'): void
  (e: 'showToast', message: string, type?: 'success' | 'error' | 'info'): void
}

const emit = defineEmits<Emits>()

/**
 * 使用 PPT 导出 composable
 */
const {
  isLoading,
  isGenerating,
  exportStage,
  stylePresets,
  exportConfig,
  error,
  selectedCount,
  hasPreview,
  canGenerate,
  loadingMessage,
  previewData,
  preview,
  loadStylePresets,
  toggleSlideSelection,
  selectAllSlides,
  deselectAllSlides,
  updateStyleSource,
  updateStyle,
  generate,
  download,
  reset,
  clearError
} = usePptExport()

/** 当前样式来源类型 */
const styleSourceType = ref<'preset' | 'template' | 'custom'>('preset')

/** 选中的预设样式 ID */
const selectedPresetId = ref<string>('professional-blue')

/** 选中的模板 ID */
const selectedTemplateId = ref<string>('')

/** 可用模板列表（从预览数据中获取） */
const availableTemplates = computed<PptTemplateListItem[]>(() => {
  return previewData.value?.availableTemplates ?? []
})

/** 是否有可用模板 */
const hasTemplates = computed(() => availableTemplates.value.length > 0)

/** 当前生效的样式配置 */
const currentStyle = computed(() => exportConfig.value?.style ?? {})

/** 当前样式来源标签 */
const styleSourceLabel = computed(() => {
  switch (styleSourceType.value) {
    case 'template':
      return '模板提取'
    case 'custom':
      return '自定义'
    default:
      return '预设样式'
  }
})

/** 当前样式预览卡片 */
const stylePreviewItems = computed(() => {
  const style = currentStyle.value
  return [
    {
      key: 'primaryColor',
      label: '主色调',
      value: style.primaryColor ? `#${style.primaryColor}` : '未设置',
      color: style.primaryColor ? `#${style.primaryColor}` : undefined
    },
    {
      key: 'backgroundColor',
      label: '背景色',
      value: style.backgroundColor ? `#${style.backgroundColor}` : '未设置',
      color: style.backgroundColor ? `#${style.backgroundColor}` : undefined
    },
    {
      key: 'titleFont',
      label: '标题字体',
      value: style.titleFont || '未设置'
    },
    {
      key: 'bodyFont',
      label: '正文字体',
      value: style.bodyFont || '未设置'
    },
    {
      key: 'titleSize',
      label: '标题字号',
      value: style.titleSize ? `${style.titleSize} pt` : '未设置'
    },
    {
      key: 'bodySize',
      label: '正文字号',
      value: style.bodySize ? `${style.bodySize} pt` : '未设置'
    }
  ]
})

/** 生成进度步骤 */
const progressSteps = computed(() => {
  const currentStage = exportStage.value

  return [
    {
      key: 'parsing',
      label: '解析内容',
      done: currentStage === 'generating' || currentStage === 'downloading',
      active: currentStage === 'parsing'
    },
    {
      key: 'generating',
      label: '生成幻灯片',
      done: currentStage === 'downloading',
      active: currentStage === 'generating'
    },
    {
      key: 'downloading',
      label: '准备下载',
      done: false,
      active: currentStage === 'downloading'
    }
  ]
})

/** 内容类型显示名称映射 */
const contentTypeLabels: Record<string, string> = {
  title: '封面',
  content: '内容',
  table: '表格',
  list: '列表',
  mixed: '混合'
}

/**
 * 监听对话框显示状态
 */
watch(
  () => props.visible,
  async (visible) => {
    if (visible) {
      window.addEventListener('keydown', handleKeydown)
    } else {
      window.removeEventListener('keydown', handleKeydown)
      reset()
    }

    if (visible && props.content) {
      clearError()
      const initialTemplateId = props.initialTemplateId || undefined

      if (initialTemplateId) {
        selectedTemplateId.value = initialTemplateId
        styleSourceType.value = 'template'
      }

      await Promise.all([preview(props.content, initialTemplateId), loadStylePresets()])
    }
  },
  { immediate: true }
)

/**
 * 监听样式来源类型变化
 */
watch(styleSourceType, async (type) => {
  if (!exportConfig.value) return

  let source: PptStyleSource
  switch (type) {
    case 'preset':
      source = { type: 'preset', presetId: selectedPresetId.value }
      break
    case 'template':
      // 如果已选择模板，使用模板 ID；否则使用第一个可用模板
      const templateId = selectedTemplateId.value || availableTemplates.value[0]?.id
      if (templateId) {
        selectedTemplateId.value = templateId
        source = { type: 'template', templateId }
      } else {
        // 没有可用模板，回退到预设样式
        source = { type: 'preset', presetId: selectedPresetId.value }
      }
      break
    case 'custom':
      source = { type: 'custom', config: exportConfig.value.style }
      break
    default:
      return
  }
  await updateStyleSource(source)
})

/**
 * 监听预设样式选择
 */
watch(selectedPresetId, (presetId) => {
  if (!exportConfig.value) return
  if (styleSourceType.value === 'preset') {
    if (
      exportConfig.value.styleSource.type === 'preset' &&
      exportConfig.value.styleSource.presetId === presetId
    ) {
      return
    }

    void updateStyleSource({ type: 'preset', presetId })
  }
})

/**
 * 监听模板选择
 */
watch(selectedTemplateId, (templateId) => {
  if (!exportConfig.value) return
  if (styleSourceType.value === 'template' && templateId) {
    if (
      exportConfig.value.styleSource.type === 'template' &&
      exportConfig.value.styleSource.templateId === templateId
    ) {
      return
    }

    void updateStyleSource({ type: 'template', templateId })
  }
})

/**
 * 同步导出配置中的样式来源到本地选择状态
 */
watch(
  exportConfig,
  (config) => {
    if (!config) return

    const { styleSource } = config
    if (styleSource.type === 'preset') {
      styleSourceType.value = 'preset'
      selectedPresetId.value = styleSource.presetId
      return
    }

    if (styleSource.type === 'template') {
      styleSourceType.value = 'template'
      selectedTemplateId.value = styleSource.templateId
      return
    }

    styleSourceType.value = 'custom'
  },
  { immediate: true }
)

/**
 * 预设样式加载后，纠正默认选中项
 */
watch(stylePresets, (presets) => {
  if (!presets.length) return

  const hasSelectedPreset = presets.some((preset) => preset.id === selectedPresetId.value)
  if (!hasSelectedPreset) {
    selectedPresetId.value = presets[0].id
  }
})

/**
 * 模板列表变化后，确保模板模式下存在默认选项
 */
watch(availableTemplates, (templates) => {
  if (styleSourceType.value !== 'template' || !templates.length) return

  const hasSelectedTemplate = templates.some((template) => template.id === selectedTemplateId.value)
  if (!hasSelectedTemplate) {
    selectedTemplateId.value = templates[0].id
  }
})

/**
 * 处理关闭
 */
function handleClose(): void {
  if (!isGenerating.value) {
    emit('close')
  }
}

/**
 * 处理全选/取消全选
 */
function handleToggleAll(): void {
  if (selectedCount.value === exportConfig.value?.slides.length) {
    deselectAllSlides()
  } else {
    selectAllSlides()
  }
}

/**
 * 处理导出
 */
async function handleExport(): Promise<void> {
  if (!canGenerate.value) return

  const result = await generate(props.content, props.title || '演示文稿')
  if (result?.success) {
    download(result)
    emit('showToast', 'PPT 已开始下载', 'success')
    emit('exported')
  }
}

/**
 * 处理键盘快捷键
 */
function handleKeydown(event: KeyboardEvent): void {
  // 如果在生成中，不允许任何快捷键操作
  if (isGenerating.value) return

  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
  const ctrlOrCmd = isMac ? event.metaKey : event.ctrlKey

  if (!ctrlOrCmd) {
    // 非 Ctrl/Cmd 组合键
    switch (event.key) {
      case 'Escape':
        event.preventDefault()
        handleClose()
        break
      case 'Enter':
        if (canGenerate.value) {
          event.preventDefault()
          handleExport()
        }
        break
    }
  } else {
    // Ctrl/Cmd 组合键
    switch (event.key.toLowerCase()) {
      case 'a':
        event.preventDefault()
        selectAllSlides()
        break
      case 'd':
        event.preventDefault()
        deselectAllSlides()
        break
    }
  }
}

/**
 * 获取预设样式的预览颜色
 */
function getPresetPreviewColor(presetId: string): string {
  const preset = stylePresets.value.find((p) => p.id === presetId)
  return preset?.config.primaryColor || '#3b82f6'
}

/**
 * 获取错误图标
 */
function getErrorIcon(type: string): string {
  switch (type) {
    case 'parse':
      return '!'
    case 'style':
      return '🎨'
    case 'generate':
      return '⚠'
    case 'download':
      return '📥'
    case 'network':
      return '🔌'
    default:
      return '⚠'
  }
}

/**
 * 重试操作
 */
async function handleRetry(): Promise<void> {
  if (props.content) {
    clearError()
    await preview(
      props.content,
      styleSourceType.value === 'template' ? selectedTemplateId.value || undefined : undefined
    )
  }
}

/**
 * 更新颜色配置
 */
function handleColorUpdate(key: 'primaryColor' | 'backgroundColor', value: string): void {
  const normalizedValue = value.replace('#', '').toUpperCase()
  if (key === 'primaryColor') {
    updateStyle({ primaryColor: normalizedValue })
    return
  }

  updateStyle({ backgroundColor: normalizedValue })
}

/**
 * 更新文本配置
 */
function handleTextStyleUpdate(key: 'titleFont' | 'bodyFont', value: string): void {
  const normalizedValue = value.trim() || undefined
  if (key === 'titleFont') {
    updateStyle({ titleFont: normalizedValue })
    return
  }

  updateStyle({ bodyFont: normalizedValue })
}

/**
 * 更新字号配置
 */
function handleSizeUpdate(key: 'titleSize' | 'bodySize', value: number): void {
  const normalizedValue = value > 0 ? value : undefined
  if (key === 'titleSize') {
    updateStyle({ titleSize: normalizedValue })
    return
  }

  updateStyle({ bodySize: normalizedValue })
}

/**
 * 格式化文件大小
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="visible" class="ppt-export-dialog-overlay" @click.self="handleClose">
        <div
          class="ppt-export-dialog"
          :class="`ppt-export-dialog-stage-${exportStage}`"
        >
          <!-- 标题栏 -->
          <div class="ppt-export-dialog-header">
            <div>
              <h3 class="ppt-export-dialog-title">导出 PowerPoint</h3>
              <p class="ppt-export-dialog-subtitle">选择要导出的页面和样式</p>
            </div>
            <button class="ppt-export-dialog-close" :disabled="isGenerating" @click="handleClose">
              关闭
            </button>
          </div>

          <!-- 快捷键提示 -->
          <div v-if="hasPreview && !isLoading" class="ppt-export-shortcuts">
            <span class="ppt-export-shortcut">Ctrl+A 全选</span>
            <span class="ppt-export-shortcut">Ctrl+D 取消全选</span>
            <span class="ppt-export-shortcut">Enter 导出</span>
            <span class="ppt-export-shortcut">Esc 关闭</span>
          </div>

          <!-- 加载状态 -->
          <div v-if="isLoading" class="ppt-export-loading">
            <div class="ppt-export-spinner"></div>
            <span>{{ loadingMessage }}</span>
          </div>

          <!-- 进度状态 -->
          <div
            v-if="exportStage !== 'idle' && !isLoading"
            class="ppt-export-progress"
          >
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

          <!-- 错误提示 -->
          <div v-if="error" class="ppt-export-error" :class="`ppt-export-error-${error.type}`">
            <div class="ppt-export-error-content">
              <span class="ppt-export-error-icon">{{ getErrorIcon(error.type) }}</span>
              <span class="ppt-export-error-message">{{ error.message }}</span>
            </div>
            <div class="ppt-export-error-actions">
              <button
                v-if="error.retryable"
                class="ppt-export-error-retry"
                @click="handleRetry"
              >
                重试
              </button>
              <button class="ppt-export-error-close" @click="clearError">×</button>
            </div>
          </div>

          <!-- 主内容 -->
          <template v-if="hasPreview">
            <div v-if="previewData?.warning" class="ppt-export-warning">
              {{ previewData.warning }}
            </div>

            <!-- 样式来源选择 -->
            <div class="ppt-export-section">
              <h4 class="ppt-export-section-title">样式来源</h4>
              <div class="ppt-export-style-source">
                <label class="ppt-export-radio">
                  <input
                    v-model="styleSourceType"
                    type="radio"
                    value="preset"
                    :disabled="isGenerating"
                  />
                  <span>预设样式</span>
                </label>
                <label class="ppt-export-radio" :class="{ disabled: !hasTemplates }">
                  <input
                    v-model="styleSourceType"
                    type="radio"
                    value="template"
                    :disabled="isGenerating || !hasTemplates"
                  />
                  <span>从模板提取</span>
                  <span v-if="!hasTemplates" class="ppt-export-radio-hint">(无可用模板)</span>
                </label>
                <label class="ppt-export-radio">
                  <input
                    v-model="styleSourceType"
                    type="radio"
                    value="custom"
                    :disabled="isGenerating"
                  />
                  <span>自定义</span>
                </label>
              </div>
            </div>

            <!-- 样式预览 -->
            <div class="ppt-export-section">
              <div class="ppt-export-preview-header">
                <h4 class="ppt-export-section-title">样式预览</h4>
                <span class="ppt-export-style-tag">{{ styleSourceLabel }}</span>
              </div>
              <div class="ppt-export-style-preview">
                <div class="ppt-export-style-preview-hero">
                  <div
                    class="ppt-export-style-preview-card"
                    :style="{
                      backgroundColor: currentStyle.backgroundColor
                        ? `#${currentStyle.backgroundColor}`
                        : '#ffffff'
                    }"
                  >
                    <div
                      class="ppt-export-style-preview-title"
                      :style="{
                        color: currentStyle.primaryColor ? `#${currentStyle.primaryColor}` : '#1E3A5F',
                        fontFamily: currentStyle.titleFont || 'inherit',
                        fontSize: `${currentStyle.titleSize || 32}px`
                      }"
                    >
                      标题示例
                    </div>
                    <div
                      class="ppt-export-style-preview-body"
                      :style="{
                        fontFamily: currentStyle.bodyFont || 'inherit',
                        fontSize: `${currentStyle.bodySize || 16}px`
                      }"
                    >
                      正文示例将按照当前样式导出到 PPT。
                    </div>
                  </div>
                </div>
                <div class="ppt-export-style-preview-grid">
                  <div
                    v-for="item in stylePreviewItems"
                    :key="item.key"
                    class="ppt-export-style-preview-item"
                  >
                    <span class="ppt-export-style-preview-label">{{ item.label }}</span>
                    <span class="ppt-export-style-preview-value">
                      <span
                        v-if="item.color"
                        class="ppt-export-style-swatch"
                        :style="{ backgroundColor: item.color }"
                      ></span>
                      {{ item.value }}
                    </span>
                  </div>
                  <div
                    v-if="exportConfig?.slideSize"
                    class="ppt-export-style-preview-item"
                  >
                    <span class="ppt-export-style-preview-label">页面尺寸</span>
                    <span class="ppt-export-style-preview-value">
                      {{ exportConfig.slideSize.width.toFixed(2) }} x
                      {{ exportConfig.slideSize.height.toFixed(2) }} in
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 预设样式选择 -->
            <div v-if="styleSourceType === 'preset'" class="ppt-export-section">
              <h4 class="ppt-export-section-title">预设样式</h4>
              <div class="ppt-export-style-presets">
                <div
                  v-for="preset in stylePresets"
                  :key="preset.id"
                  class="ppt-export-style-preset-card"
                  :class="{ active: selectedPresetId === preset.id }"
                  :style="{ '--preview-color': getPresetPreviewColor(preset.id) }"
                  @click="selectedPresetId = preset.id"
                >
                  <div class="ppt-export-preset-preview">
                    <div class="ppt-export-preset-color"></div>
                  </div>
                  <span class="ppt-export-preset-name">{{ preset.name }}</span>
                </div>
              </div>
            </div>

            <!-- 自定义样式 -->
            <div v-if="styleSourceType === 'custom'" class="ppt-export-section">
              <h4 class="ppt-export-section-title">自定义样式</h4>
              <div class="ppt-export-custom-grid">
                <label class="ppt-export-field">
                  <span class="ppt-export-field-label">主色调</span>
                  <input
                    class="ppt-export-input ppt-export-input-color"
                    type="color"
                    :value="currentStyle.primaryColor ? `#${currentStyle.primaryColor}` : '#1e3a5f'"
                    :disabled="isGenerating"
                    @input="
                      handleColorUpdate(
                        'primaryColor',
                        ($event.target as HTMLInputElement).value
                      )
                    "
                  />
                </label>
                <label class="ppt-export-field">
                  <span class="ppt-export-field-label">背景色</span>
                  <input
                    class="ppt-export-input ppt-export-input-color"
                    type="color"
                    :value="
                      currentStyle.backgroundColor ? `#${currentStyle.backgroundColor}` : '#ffffff'
                    "
                    :disabled="isGenerating"
                    @input="
                      handleColorUpdate(
                        'backgroundColor',
                        ($event.target as HTMLInputElement).value
                      )
                    "
                  />
                </label>
                <label class="ppt-export-field">
                  <span class="ppt-export-field-label">标题字体</span>
                  <input
                    class="ppt-export-input"
                    type="text"
                    :value="currentStyle.titleFont || ''"
                    :disabled="isGenerating"
                    placeholder="例如：Microsoft YaHei"
                    @input="
                      handleTextStyleUpdate('titleFont', ($event.target as HTMLInputElement).value)
                    "
                  />
                </label>
                <label class="ppt-export-field">
                  <span class="ppt-export-field-label">正文字体</span>
                  <input
                    class="ppt-export-input"
                    type="text"
                    :value="currentStyle.bodyFont || ''"
                    :disabled="isGenerating"
                    placeholder="例如：Microsoft YaHei"
                    @input="
                      handleTextStyleUpdate('bodyFont', ($event.target as HTMLInputElement).value)
                    "
                  />
                </label>
                <label class="ppt-export-field">
                  <span class="ppt-export-field-label">标题字号</span>
                  <input
                    class="ppt-export-input"
                    type="number"
                    min="12"
                    max="72"
                    :value="currentStyle.titleSize || 36"
                    :disabled="isGenerating"
                    @input="
                      handleSizeUpdate(
                        'titleSize',
                        Number(($event.target as HTMLInputElement).value)
                      )
                    "
                  />
                </label>
                <label class="ppt-export-field">
                  <span class="ppt-export-field-label">正文字号</span>
                  <input
                    class="ppt-export-input"
                    type="number"
                    min="10"
                    max="48"
                    :value="currentStyle.bodySize || 18"
                    :disabled="isGenerating"
                    @input="
                      handleSizeUpdate(
                        'bodySize',
                        Number(($event.target as HTMLInputElement).value)
                      )
                    "
                  />
                </label>
              </div>
            </div>

            <!-- 模板选择 -->
            <div v-if="styleSourceType === 'template'" class="ppt-export-section">
              <h4 class="ppt-export-section-title">选择模板</h4>
              <div v-if="hasTemplates" class="ppt-export-templates-list">
                <div
                  v-for="template in availableTemplates"
                  :key="template.id"
                  class="ppt-export-template-item"
                  :class="{ active: selectedTemplateId === template.id }"
                  @click="selectedTemplateId = template.id"
                >
                  <div class="ppt-export-template-info">
                    <span class="ppt-export-template-name">{{ template.name }}</span>
                    <span class="ppt-export-template-meta">
                      {{ template.slideCount }} 页 · {{ formatFileSize(template.fileSize) }}
                    </span>
                  </div>
                  <div class="ppt-export-template-check" :class="{ visible: selectedTemplateId === template.id }">
                    <span>✓</span>
                  </div>
                </div>
              </div>
              <div v-else class="ppt-export-empty-state">
                <p>暂无可用模板</p>
                <p class="ppt-export-empty-hint">请先上传 PPT 模板文件</p>
              </div>
            </div>

            <!-- 内容预览 -->
            <div class="ppt-export-section ppt-export-section-preview">
              <div class="ppt-export-preview-header">
                <h4 class="ppt-export-section-title">内容预览</h4>
                <button
                  class="ppt-export-select-all"
                  :disabled="isGenerating"
                  @click="handleToggleAll"
                >
                  {{
                    selectedCount === exportConfig?.slides.length ? '取消全选' : '全选'
                  }}
                </button>
              </div>
              <div class="ppt-export-slides-list">
                <div
                  v-for="slide in exportConfig?.slides"
                  :key="slide.index"
                  class="ppt-export-slide-item"
                  :class="{ selected: slide.selected }"
                  @click="toggleSlideSelection(slide.index)"
                >
                  <label class="ppt-export-slide-checkbox">
                    <input
                      type="checkbox"
                      :checked="slide.selected"
                      :disabled="isGenerating"
                      @change="toggleSlideSelection(slide.index)"
                      @click.stop
                    />
                  </label>
                  <div class="ppt-export-slide-info">
                    <span class="ppt-export-slide-index">第 {{ slide.index + 1 }} 页</span>
                    <span class="ppt-export-slide-type">
                      {{ contentTypeLabels[slide.contentType] || slide.contentType }}
                    </span>
                  </div>
                  <span class="ppt-export-slide-title">
                    {{ slide.title || '无标题' }}
                  </span>
                  <span class="ppt-export-slide-summary">{{ slide.summary }}</span>
                </div>
              </div>
            </div>
          </template>

          <!-- 底部操作栏 -->
          <div class="ppt-export-dialog-footer">
            <span class="ppt-export-status">
              <template v-if="isGenerating">{{ loadingMessage }}</template>
              <template v-else-if="hasPreview">
                已选择 {{ selectedCount }} / {{ exportConfig?.slides.length }} 页
              </template>
              <template v-else-if="isLoading">{{ loadingMessage }}</template>
            </span>
            <div class="ppt-export-actions">
              <button class="ppt-export-btn ppt-export-btn-cancel" :disabled="isGenerating" @click="handleClose">
                取消
              </button>
              <button
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
/* ==================== 遮罩层 ==================== */
.ppt-export-dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.24);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

/* ==================== 对话框容器 ==================== */
.ppt-export-dialog {
  width: min(640px, 100%);
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--theme-border);
  border-radius: calc(var(--theme-radius-lg) + 2px);
  background: linear-gradient(
    180deg,
    var(--glass-white-027, rgba(255, 255, 255, 0.027)) 0%,
    var(--theme-bg-secondary) 100%
  );
  box-shadow:
    0 22px 60px rgba(15, 23, 42, 0.18),
    inset 0 1px 0 var(--glass-white-1, rgba(255, 255, 255, 0.1));
  overflow: hidden;
  transition: border-color 0.3s ease;
}

/* 不同阶段的对话框视觉效果 */
.ppt-export-dialog-stage-generating {
  border-color: color-mix(in srgb, var(--theme-accent) 50%, var(--theme-border));
}

/* ==================== 标题栏 ==================== */
.ppt-export-dialog-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 22px 14px;
  flex-shrink: 0;
}

.ppt-export-dialog-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--theme-text);
}

.ppt-export-dialog-subtitle {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--theme-text-secondary);
}

.ppt-export-dialog-close {
  padding: 8px 12px;
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius);
  background: var(--theme-bg);
  color: var(--theme-text-secondary);
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    color 0.2s ease,
    background-color 0.2s ease;
}

.ppt-export-dialog-close:hover:not(:disabled) {
  border-color: var(--theme-accent);
  color: var(--theme-accent);
}

.ppt-export-dialog-close:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

/* ==================== 快捷键提示 ==================== */
.ppt-export-shortcuts {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 22px;
  border-bottom: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-bg-hover) 50%, transparent);
  flex-wrap: wrap;
}

.ppt-export-shortcut {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: var(--theme-radius);
  background: var(--theme-bg);
  font-size: 11px;
  color: var(--theme-text-tertiary);
}

.ppt-export-shortcut::before,
.ppt-export-shortcut::after {
  content: '';
  display: inline-block;
  padding: 2px 4px;
  border: 1px solid var(--theme-border);
  border-radius: 3px;
  background: var(--theme-bg-secondary);
  font-family: monospace;
  font-size: 10px;
  line-height: 1;
}

/* ==================== 加载和错误状态 ==================== */
.ppt-export-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 32px;
  color: var(--theme-text-secondary);
}

.ppt-export-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--theme-border);
  border-top-color: var(--theme-accent);
  border-radius: 50%;
  animation: ppt-export-spin 0.8s linear infinite;
}

.ppt-export-progress {
  display: flex;
  gap: 10px;
  margin: 0 22px 12px;
  padding: 12px 14px;
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius);
  background: color-mix(in srgb, var(--theme-bg-hover) 45%, transparent);
  flex-wrap: wrap;
}

.ppt-export-progress-step {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--theme-text-tertiary);
  font-size: 12px;
  font-weight: 500;
}

.ppt-export-progress-step.active {
  color: var(--theme-accent);
}

.ppt-export-progress-step.done {
  color: #16a34a;
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
  margin: 0 22px 12px;
  padding: 12px 14px;
  border-radius: var(--theme-radius);
  border: 1px solid;
  font-size: 13px;
  animation: ppt-export-shake 0.3s ease;
}

.ppt-export-error-parse {
  background: color-mix(in srgb, #f59e0b 10%, transparent);
  border-color: color-mix(in srgb, #f59e0b 30%, transparent);
  color: #f59e0b;
}

.ppt-export-error-style {
  background: color-mix(in srgb, #8b5cf6 10%, transparent);
  border-color: color-mix(in srgb, #8b5cf6 30%, transparent);
  color: #8b5cf6;
}

.ppt-export-error-generate {
  background: color-mix(in srgb, #ef4444 10%, transparent);
  border-color: color-mix(in srgb, #ef4444 30%, transparent);
  color: #ef4444;
}

.ppt-export-error-download {
  background: color-mix(in srgb, #ec4899 10%, transparent);
  border-color: color-mix(in srgb, #ec4899 30%, transparent);
  color: #ec4899;
}

.ppt-export-error-network {
  background: color-mix(in srgb, #3b82f6 10%, transparent);
  border-color: color-mix(in srgb, #3b82f6 30%, transparent);
  color: #3b82f6;
}

@keyframes ppt-export-shake {
  0%,
  100% {
    transform: translateX(0);
  }
  25% {
    transform: translateX(-4px);
  }
  75% {
    transform: translateX(4px);
  }
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
  border-radius: var(--theme-radius);
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

/* ==================== 内容区域 ==================== */
.ppt-export-dialog > :not(.ppt-export-dialog-header):not(.ppt-export-dialog-footer) {
  overflow-y: auto;
  padding: 0 22px;
}

.ppt-export-dialog > *:not(.ppt-export-dialog-header):not(.ppt-export-dialog-footer)::-webkit-scrollbar {
  width: 6px;
}

.ppt-export-dialog
  > *:not(.ppt-export-dialog-header):not(.ppt-export-dialog-footer)::-webkit-scrollbar-track {
  background: transparent;
}

.ppt-export-dialog
  > *:not(.ppt-export-dialog-header):not(.ppt-export-dialog-footer)::-webkit-scrollbar-thumb {
  background: var(--theme-border);
  border-radius: 3px;
}

/* ==================== 分节 ==================== */
.ppt-export-section {
  padding: 16px 0;
  border-bottom: 1px solid var(--theme-border);
}

.ppt-export-section:last-of-type {
  border-bottom: none;
}

.ppt-export-warning {
  margin: 0 0 12px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, #f59e0b 28%, transparent);
  border-radius: var(--theme-radius);
  background: color-mix(in srgb, #f59e0b 10%, transparent);
  color: #b45309;
  font-size: 12px;
  line-height: 1.5;
}

.ppt-export-section-preview {
  border-bottom: none;
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.ppt-export-section-title {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 600;
  color: var(--theme-text);
}

/* ==================== 样式来源选择 ==================== */
.ppt-export-style-source {
  display: flex;
  gap: 20px;
}

.ppt-export-radio {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: var(--theme-text-secondary);
  font-size: 14px;
}

.ppt-export-radio input[type='radio'] {
  accent-color: var(--theme-accent);
}

.ppt-export-radio input[type='radio']:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

/* ==================== 预设样式卡片 ==================== */
.ppt-export-style-presets {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.ppt-export-style-preset-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 14px;
  border: 2px solid var(--theme-border);
  border-radius: var(--theme-radius-lg);
  background: var(--theme-bg);
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease;
}

.ppt-export-style-preset-card:hover {
  border-color: color-mix(in srgb, var(--theme-accent) 40%, var(--theme-border));
}

.ppt-export-style-preset-card.active {
  border-color: var(--theme-accent);
  background: color-mix(in srgb, var(--theme-accent) 8%, var(--theme-bg));
}

.ppt-export-preset-preview {
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: var(--theme-radius);
  background: var(--theme-bg-secondary);
  overflow: hidden;
}

.ppt-export-preset-color {
  width: 100%;
  height: 100%;
  background: var(--preview-color);
}

.ppt-export-preset-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--theme-text);
}

/* ==================== 模板列表 ==================== */
.ppt-export-templates-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 200px;
  overflow-y: auto;
  padding-right: 4px;
}

.ppt-export-templates-list::-webkit-scrollbar {
  width: 4px;
}

.ppt-export-templates-list::-webkit-scrollbar-track {
  background: transparent;
}

.ppt-export-templates-list::-webkit-scrollbar-thumb {
  background: var(--theme-border);
  border-radius: 2px;
}

.ppt-export-template-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border: 2px solid var(--theme-border);
  border-radius: var(--theme-radius-lg);
  background: var(--theme-bg);
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease;
}

.ppt-export-template-item:hover {
  border-color: color-mix(in srgb, var(--theme-accent) 40%, var(--theme-border));
  background: var(--theme-bg-hover);
}

.ppt-export-template-item.active {
  border-color: var(--theme-accent);
  background: color-mix(in srgb, var(--theme-accent) 8%, var(--theme-bg));
}

.ppt-export-template-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}

.ppt-export-template-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--theme-text);
}

.ppt-export-template-meta {
  font-size: 12px;
  color: var(--theme-text-tertiary);
}

.ppt-export-template-check {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--theme-accent);
  color: white;
  opacity: 0;
  transform: scale(0.8);
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.ppt-export-template-check.visible {
  opacity: 1;
  transform: scale(1);
}

/* ==================== 空状态 ==================== */
.ppt-export-empty-state {
  padding: 32px;
  text-align: center;
  color: var(--theme-text-secondary);
}

.ppt-export-empty-state p {
  margin: 0 0 8px;
}

.ppt-export-empty-hint {
  font-size: 12px;
  color: var(--theme-text-tertiary);
}

/* ==================== 样式来源提示 ==================== */
.ppt-export-radio.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ppt-export-radio-hint {
  font-size: 11px;
  color: var(--theme-text-tertiary);
  margin-left: 4px;
}

.ppt-export-style-tag {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--theme-accent) 10%, transparent);
  color: var(--theme-accent);
  font-size: 12px;
  font-weight: 600;
}

.ppt-export-style-preview {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
  gap: 14px;
}

.ppt-export-style-preview-hero {
  min-width: 0;
}

.ppt-export-style-preview-card {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 14px;
  min-height: 180px;
  padding: 20px;
  border: 1px solid var(--theme-border);
  border-radius: calc(var(--theme-radius-lg) + 2px);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3);
}

.ppt-export-style-preview-title {
  font-weight: 700;
  line-height: 1.2;
}

.ppt-export-style-preview-body {
  color: color-mix(in srgb, var(--theme-text) 80%, #6b7280);
  line-height: 1.6;
}

.ppt-export-style-preview-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

.ppt-export-style-preview-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius);
  background: var(--theme-bg);
}

.ppt-export-style-preview-label {
  font-size: 12px;
  color: var(--theme-text-tertiary);
}

.ppt-export-style-preview-value {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 20px;
  font-size: 13px;
  color: var(--theme-text);
  word-break: break-word;
}

.ppt-export-style-swatch {
  width: 14px;
  height: 14px;
  border: 1px solid color-mix(in srgb, var(--theme-text) 16%, transparent);
  border-radius: 4px;
  flex-shrink: 0;
}

.ppt-export-custom-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.ppt-export-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ppt-export-field-label {
  font-size: 12px;
  color: var(--theme-text-secondary);
}

.ppt-export-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius);
  background: var(--theme-bg);
  color: var(--theme-text);
  font-size: 13px;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.ppt-export-input:focus {
  outline: none;
  border-color: var(--theme-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--theme-accent) 12%, transparent);
}

.ppt-export-input:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.ppt-export-input-color {
  min-height: 42px;
  padding: 6px;
}

/* ==================== 内容预览 ==================== */
.ppt-export-preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.ppt-export-select-all {
  padding: 6px 12px;
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius);
  background: var(--theme-bg);
  color: var(--theme-text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    color 0.2s ease;
}

.ppt-export-select-all:hover:not(:disabled) {
  border-color: var(--theme-accent);
  color: var(--theme-accent);
}

.ppt-export-slides-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 280px;
  overflow-y: auto;
  padding-right: 4px;
}

.ppt-export-slides-list::-webkit-scrollbar {
  width: 4px;
}

.ppt-export-slides-list::-webkit-scrollbar-track {
  background: transparent;
}

.ppt-export-slides-list::-webkit-scrollbar-thumb {
  background: var(--theme-border);
  border-radius: 2px;
}

.ppt-export-slide-item {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: auto auto;
  gap: 4px 12px;
  padding: 12px 14px;
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius);
  background: var(--theme-bg);
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease;
}

.ppt-export-slide-item:hover {
  border-color: color-mix(in srgb, var(--theme-accent) 30%, var(--theme-border));
  background: var(--theme-bg-hover);
}

.ppt-export-slide-item.selected {
  border-color: color-mix(in srgb, var(--theme-accent) 40%, var(--theme-border));
  background: color-mix(in srgb, var(--theme-accent) 6%, var(--theme-bg));
}

.ppt-export-slide-checkbox {
  grid-row: 1 / -1;
  display: flex;
  align-items: flex-start;
  padding-top: 2px;
}

.ppt-export-slide-checkbox input[type='checkbox'] {
  width: 16px;
  height: 16px;
  accent-color: var(--theme-accent);
  cursor: pointer;
}

.ppt-export-slide-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ppt-export-slide-index {
  font-size: 12px;
  font-weight: 600;
  color: var(--theme-text);
}

.ppt-export-slide-type {
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--theme-accent) 10%, transparent);
  color: var(--theme-accent);
  font-size: 11px;
  font-weight: 600;
}

.ppt-export-slide-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--theme-text);
}

.ppt-export-slide-summary {
  font-size: 12px;
  color: var(--theme-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ==================== 底部操作栏 ==================== */
.ppt-export-dialog-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 22px 20px;
  border-top: 1px solid var(--theme-border);
  flex-shrink: 0;
}

.ppt-export-status {
  font-size: 12px;
  color: var(--theme-text-tertiary);
}

.ppt-export-actions {
  display: flex;
  gap: 10px;
}

.ppt-export-btn {
  padding: 10px 18px;
  border-radius: var(--theme-radius);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    color 0.2s ease,
    background-color 0.2s ease;
}

.ppt-export-btn-cancel {
  border: 1px solid var(--theme-border);
  background: var(--theme-bg);
  color: var(--theme-text-secondary);
}

.ppt-export-btn-cancel:hover:not(:disabled) {
  border-color: var(--theme-accent);
  color: var(--theme-accent);
}

.ppt-export-btn-export {
  border: 1px solid var(--theme-accent);
  background: var(--theme-accent);
  color: white;
}

.ppt-export-btn-export:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--theme-accent) 80%, white);
  background: color-mix(in srgb, var(--theme-accent) 90%, white);
}

.ppt-export-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.ppt-export-btn-spinner {
  display: inline-block;
  width: 12px;
  height: 12px;
  margin-right: 6px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: ppt-export-spin 0.6s linear infinite;
  vertical-align: middle;
}

/* ==================== 过渡动画 ==================== */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* ==================== 响应式 ==================== */
@media (max-width: 640px) {
  .ppt-export-dialog-overlay {
    padding: 16px;
  }

  .ppt-export-style-preview,
  .ppt-export-custom-grid,
  .ppt-export-style-presets {
    grid-template-columns: 1fr;
  }

  .ppt-export-dialog-footer {
    flex-direction: column;
    align-items: stretch;
  }

  .ppt-export-actions {
    justify-content: stretch;
  }

  .ppt-export-btn {
    flex: 1;
  }
}
</style>
