<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type {
  BuildPresentationDraftRequest,
  ExportPresentationRequest,
  Message,
  PresentationConfig,
  PresentationTemplate,
  TemplateInfo,
  ValidationResult
} from '@renderer/types'

const props = defineProps<{
  message: Message
  defaultTitle?: string
  isExporting?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'export', request: ExportPresentationRequest): void
}>()

interface TemplatePreset {
  primaryColor: string
  secondaryColor: string
  accentColor: string
  fontFace: string
  headingFontFace: string
}

const TEMPLATE_PRESETS: Record<PresentationTemplate, TemplatePreset> = {
  lessonPlan: {
    primaryColor: '#2F6BFF',
    secondaryColor: '#DCE7FF',
    accentColor: '#63A4FF',
    fontFace: 'PingFang SC',
    headingFontFace: 'PingFang SC'
  },
  business: {
    primaryColor: '#0F172A',
    secondaryColor: '#D9E3F0',
    accentColor: '#1D4ED8',
    fontFace: 'Aptos',
    headingFontFace: 'Aptos Display'
  },
  minimal: {
    primaryColor: '#111827',
    secondaryColor: '#E5E7EB',
    accentColor: '#9CA3AF',
    fontFace: 'PingFang SC',
    headingFontFace: 'PingFang SC'
  },
  custom: {
    primaryColor: '#111827',
    secondaryColor: '#E5E7EB',
    accentColor: '#9CA3AF',
    fontFace: 'PingFang SC',
    headingFontFace: 'PingFang SC'
  }
}

const templates = ref<TemplateInfo[]>([])
const selectedTemplate = ref<PresentationTemplate>('lessonPlan')
const title = ref('')
const author = ref('')
const subject = ref('AI 助手生成演示文稿')
const primaryColor = ref(TEMPLATE_PRESETS.lessonPlan.primaryColor)
const secondaryColor = ref(TEMPLATE_PRESETS.lessonPlan.secondaryColor)
const accentColor = ref(TEMPLATE_PRESETS.lessonPlan.accentColor)
const fontFace = ref(TEMPLATE_PRESETS.lessonPlan.fontFace)
const headingFontFace = ref(TEMPLATE_PRESETS.lessonPlan.headingFontFace)

const previewImages = ref<string[]>([])
const previewIndex = ref(0)
const validationResult = ref<ValidationResult | null>(null)
const draftConfig = ref<PresentationConfig | null>(null)
const loadingTemplates = ref(false)
const loadingPreview = ref(false)
const loadError = ref('')

let previewTimer: number | null = null

const activeTemplateInfo = computed(() => {
  return templates.value.find((item) => item.id === selectedTemplate.value) || null
})

const currentPreviewImage = computed(() => {
  if (previewImages.value.length === 0) {
    return ''
  }

  return previewImages.value[Math.min(previewIndex.value, previewImages.value.length - 1)]
})

const warningIssues = computed(() => {
  return validationResult.value?.issues.filter((issue) => issue.severity === 'warning') || []
})

const errorIssues = computed(() => {
  return validationResult.value?.issues.filter((issue) => issue.severity === 'error') || []
})

function handleClose(): void {
  if (!props.isExporting) {
    emit('close')
  }
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    handleClose()
  }
}

function applyTemplatePreset(template: PresentationTemplate): void {
  const preset = TEMPLATE_PRESETS[template]
  primaryColor.value = preset.primaryColor
  secondaryColor.value = preset.secondaryColor
  accentColor.value = preset.accentColor
  fontFace.value = preset.fontFace
  headingFontFace.value = preset.headingFontFace
}

function buildDraftRequest(): BuildPresentationDraftRequest {
  return {
    content: props.message.content,
    title: title.value.trim() || props.defaultTitle || '未命名演示文稿',
    author: author.value.trim() || undefined,
    subject: subject.value.trim() || undefined,
    template: selectedTemplate.value,
    theme: {
      primaryColor: primaryColor.value,
      secondaryColor: secondaryColor.value,
      accentColor: accentColor.value,
      fontFace: fontFace.value.trim() || undefined,
      headingFontFace: headingFontFace.value.trim() || undefined
    }
  }
}

async function loadTemplates(): Promise<void> {
  loadingTemplates.value = true

  try {
    templates.value = await window.api.presentation.getTemplates()
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error)
  } finally {
    loadingTemplates.value = false
  }
}

async function refreshPreview(): Promise<void> {
  if (!props.message.content.trim()) {
    loadError.value = '当前消息内容为空，无法生成 PPT 预览'
    previewImages.value = []
    return
  }

  loadingPreview.value = true
  loadError.value = ''

  try {
    const draftResult = await window.api.presentation.buildDraft(buildDraftRequest())

    if (!draftResult.success || !draftResult.data) {
      draftConfig.value = null
      previewImages.value = []
      validationResult.value = null
      loadError.value = draftResult.error || 'PPT 草稿生成失败'
      return
    }

    const resolvedDraft = draftResult.data as PresentationConfig
    draftConfig.value = resolvedDraft

    const [previewResult, validateResult] = await Promise.all([
      window.api.presentation.preview(resolvedDraft),
      window.api.presentation.validate(resolvedDraft)
    ])

    validationResult.value = validateResult

    if (!previewResult.success || !previewResult.images) {
      previewImages.value = []
      loadError.value = previewResult.error || 'PPT 预览生成失败'
      return
    }

    previewImages.value = previewResult.images
    previewIndex.value = Math.min(previewIndex.value, Math.max(previewImages.value.length - 1, 0))
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error)
    previewImages.value = []
    validationResult.value = null
    draftConfig.value = null
  } finally {
    loadingPreview.value = false
  }
}

function schedulePreview(): void {
  if (previewTimer !== null) {
    window.clearTimeout(previewTimer)
  }

  previewTimer = window.setTimeout(() => {
    void refreshPreview()
  }, 260)
}

function handleTemplateSelect(template: PresentationTemplate): void {
  if (selectedTemplate.value === template) {
    return
  }

  selectedTemplate.value = template
  applyTemplatePreset(template)
}

function handleExport(): void {
  emit('export', {
    ...buildDraftRequest(),
    timestamp: props.message.timestamp
  })
}

watch(
  () => props.message.id,
  () => {
    previewIndex.value = 0
    schedulePreview()
  }
)

watch(
  [
    selectedTemplate,
    title,
    author,
    subject,
    primaryColor,
    secondaryColor,
    accentColor,
    fontFace,
    headingFontFace
  ],
  () => {
    schedulePreview()
  }
)

onMounted(async () => {
  title.value =
    props.defaultTitle || props.message.content.split('\n')[0]?.slice(0, 30) || '未命名演示文稿'
  author.value = props.message.modelName || 'Sparrow Manus'

  document.addEventListener('keydown', handleKeydown)
  await loadTemplates()
  schedulePreview()
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)

  if (previewTimer !== null) {
    window.clearTimeout(previewTimer)
  }
})
</script>

<template>
  <div class="presentation-overlay" @click.self="handleClose">
    <div class="presentation-dialog">
      <div class="presentation-header">
        <div>
          <h3 class="presentation-title">PPT 导出配置</h3>
          <p class="presentation-subtitle">选择模板、调整主题并预览后再导出 .pptx</p>
        </div>
        <button class="presentation-close" :disabled="isExporting" @click="handleClose">
          关闭
        </button>
      </div>

      <div class="presentation-body">
        <section class="presentation-panel config-panel">
          <div class="panel-section">
            <div class="section-heading">
              <h4>模板选择</h4>
            </div>

            <div v-if="loadingTemplates" class="panel-state">正在加载模板...</div>

            <div v-else class="template-grid">
              <button
                v-for="templateItem in templates"
                :key="templateItem.id"
                class="template-card"
                :class="{ active: selectedTemplate === templateItem.id }"
                @click="handleTemplateSelect(templateItem.id)"
              >
                <div class="template-swatches">
                  <span
                    v-for="color in templateItem.previewColors || []"
                    :key="color"
                    class="template-swatch"
                    :style="{ backgroundColor: `#${color.replace(/^#/, '')}` }"
                  />
                </div>
                <div class="template-card-title">{{ templateItem.name }}</div>
                <div class="template-card-desc">{{ templateItem.description }}</div>
              </button>
            </div>
          </div>

          <div class="panel-section">
            <div class="section-heading">
              <h4>基础信息</h4>
            </div>

            <div class="form-grid">
              <label class="field">
                <span class="field-label">标题</span>
                <input
                  v-model="title"
                  class="form-input"
                  maxlength="200"
                  placeholder="例如：Python 基础教程"
                />
              </label>
              <label class="field">
                <span class="field-label">作者</span>
                <input
                  v-model="author"
                  class="form-input"
                  maxlength="120"
                  placeholder="例如：Sparrow Manus"
                />
              </label>
            </div>

            <label class="field">
              <span class="field-label">主题说明</span>
              <input
                v-model="subject"
                class="form-input"
                maxlength="200"
                placeholder="例如：AI 助手生成的课程演示文稿"
              />
            </label>
          </div>

          <div class="panel-section">
            <div class="section-heading">
              <h4>主题设置</h4>
            </div>

            <div class="color-grid">
              <label class="color-field">
                <span class="field-label">主色</span>
                <div class="color-input-wrap">
                  <input v-model="primaryColor" type="color" class="color-picker" />
                  <input v-model="primaryColor" class="form-input color-text" />
                </div>
              </label>
              <label class="color-field">
                <span class="field-label">辅助色</span>
                <div class="color-input-wrap">
                  <input v-model="secondaryColor" type="color" class="color-picker" />
                  <input v-model="secondaryColor" class="form-input color-text" />
                </div>
              </label>
              <label class="color-field">
                <span class="field-label">强调色</span>
                <div class="color-input-wrap">
                  <input v-model="accentColor" type="color" class="color-picker" />
                  <input v-model="accentColor" class="form-input color-text" />
                </div>
              </label>
            </div>

            <div class="form-grid">
              <label class="field">
                <span class="field-label">正文字体</span>
                <input
                  v-model="fontFace"
                  class="form-input"
                  maxlength="120"
                  placeholder="PingFang SC"
                />
              </label>
              <label class="field">
                <span class="field-label">标题字体</span>
                <input
                  v-model="headingFontFace"
                  class="form-input"
                  maxlength="120"
                  placeholder="PingFang SC"
                />
              </label>
            </div>

            <div class="theme-actions">
              <button class="minor-btn" @click="applyTemplatePreset(selectedTemplate)">
                恢复模板默认
              </button>
              <button class="minor-btn" :disabled="loadingPreview" @click="refreshPreview">
                刷新预览
              </button>
            </div>
          </div>
        </section>

        <section class="presentation-panel preview-panel">
          <div class="preview-header">
            <div>
              <h4>实时预览</h4>
            </div>
            <div class="preview-meta">
              <span v-if="draftConfig" class="meta-pill">{{ draftConfig.slides.length }} 页</span>
              <span v-if="activeTemplateInfo" class="meta-pill">{{ activeTemplateInfo.name }}</span>
            </div>
          </div>

          <div v-if="loadingPreview" class="preview-state">正在生成预览...</div>
          <div v-else-if="loadError" class="preview-state error">{{ loadError }}</div>
          <div v-else-if="currentPreviewImage" class="preview-stage">
            <div class="preview-canvas">
              <img :src="currentPreviewImage" alt="PPT 预览" class="preview-image" />
            </div>

            <div class="preview-strip">
              <button
                v-for="(image, index) in previewImages"
                :key="index"
                class="preview-thumb"
                :class="{ active: previewIndex === index }"
                @click="previewIndex = index"
              >
                <img :src="image" :alt="`预览 ${index + 1}`" />
                <span>{{ index + 1 }}</span>
              </button>
            </div>
          </div>
          <div v-else class="preview-state">暂无预览</div>

          <div class="validation-panel">
            <div class="validation-summary">
              <span class="summary-pill danger" :class="{ empty: errorIssues.length === 0 }">
                错误 {{ errorIssues.length }}
              </span>
              <span class="summary-pill warning" :class="{ empty: warningIssues.length === 0 }">
                警告 {{ warningIssues.length }}
              </span>
            </div>

            <div v-if="errorIssues.length > 0" class="issue-list error-list">
              <div v-for="issue in errorIssues.slice(0, 3)" :key="`${issue.path}-${issue.message}`">
                {{ issue.message }}
              </div>
            </div>

            <div v-else-if="warningIssues.length > 0" class="issue-list warning-list">
              <div
                v-for="issue in warningIssues.slice(0, 3)"
                :key="`${issue.path}-${issue.message}`"
              >
                {{ issue.message }}
              </div>
            </div>

            <div v-else class="issue-list ready-list">当前配置可直接导出</div>
          </div>
        </section>
      </div>

      <div class="presentation-footer">
        <div class="footer-tip">预览图基于当前模板和主题即时生成，用于快速确认排版方向。</div>
        <div class="footer-actions">
          <button class="minor-btn" :disabled="isExporting" @click="handleClose">取消</button>
          <button
            class="primary-btn"
            :disabled="isExporting || errorIssues.length > 0"
            @click="handleExport"
          >
            {{ isExporting ? '正在导出...' : '导出 PPTX' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.presentation-overlay {
  position: fixed;
  inset: 0;
  z-index: 1110;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background:
    radial-gradient(circle at top right, rgba(47, 107, 255, 0.12), transparent 30%),
    rgba(15, 23, 42, 0.34);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

.presentation-dialog {
  width: min(1140px, 100%);
  max-height: min(840px, calc(100vh - 48px));
  display: flex;
  flex-direction: column;
  border: 1px solid var(--theme-border);
  border-radius: calc(var(--theme-radius-lg) + 4px);
  background:
    linear-gradient(160deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.01)),
    var(--theme-bg-secondary);
  box-shadow:
    0 28px 80px rgba(15, 23, 42, 0.28),
    inset 0 1px 0 rgba(255, 255, 255, 0.12);
  overflow: hidden;
}

.presentation-header,
.presentation-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 24px;
}

.presentation-header {
  border-bottom: 1px solid var(--theme-border);
}

.presentation-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: var(--theme-text);
}

.presentation-subtitle {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--theme-text-secondary);
}

.presentation-close,
.minor-btn,
.primary-btn {
  min-height: 38px;
  padding: 0 14px;
  border-radius: var(--theme-radius);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    border-color 0.2s ease,
    background-color 0.2s ease,
    color 0.2s ease;
}

.presentation-close,
.minor-btn {
  border: 1px solid var(--theme-border);
  background: var(--theme-bg);
  color: var(--theme-text-secondary);
}

.primary-btn {
  border: 1px solid transparent;
  background: linear-gradient(
    135deg,
    var(--theme-accent),
    color-mix(in srgb, var(--theme-accent) 72%, #ffffff)
  );
  color: #fff;
}

.presentation-close:hover:not(:disabled),
.minor-btn:hover:not(:disabled),
.primary-btn:hover:not(:disabled) {
  transform: translateY(-1px);
}

.presentation-close:disabled,
.minor-btn:disabled,
.primary-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.presentation-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(360px, 420px) minmax(0, 1fr);
  gap: 18px;
  padding: 20px 24px;
  overflow: hidden;
}

.presentation-panel {
  min-height: 0;
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius-lg);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.045), rgba(255, 255, 255, 0.01)), var(--theme-bg);
}

.config-panel {
  padding: 18px;
  overflow: auto;
  overscroll-behavior: contain;
}

.preview-panel {
  display: flex;
  flex-direction: column;
  padding: 18px;
  gap: 16px;
}

.panel-section + .panel-section {
  margin-top: 22px;
}

.section-heading {
  margin-bottom: 14px;
}

.section-heading h4,
.preview-header h4 {
  margin: 0;
  font-size: 16px;
  color: var(--theme-text);
}

.template-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.template-card {
  padding: 14px;
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius);
  background: var(--theme-bg-secondary);
  text-align: left;
  color: var(--theme-text);
  cursor: pointer;
  transition:
    transform 0.18s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.template-card.active {
  border-color: var(--theme-accent);
  box-shadow: 0 12px 26px rgba(47, 107, 255, 0.12);
}

.template-card:hover {
  transform: translateY(-1px);
}

.template-swatches {
  display: flex;
  gap: 6px;
  margin-bottom: 10px;
}

.template-swatch {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.28);
}

.template-card-title {
  font-size: 14px;
  font-weight: 700;
}

.template-card-desc {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.55;
  color: var(--theme-text-secondary);
}

.form-grid,
.color-grid {
  display: grid;
  gap: 12px;
}

.form-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.color-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.color-grid + .form-grid,
.form-grid + .field,
.form-grid + .theme-actions {
  margin-top: 16px;
}

.field,
.color-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--theme-text-secondary);
}

.color-input-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.color-picker {
  width: 40px;
  min-width: 40px;
  height: 40px;
  padding: 3px;
  border: 1px solid color-mix(in srgb, var(--theme-border) 88%, #ffffff 12%);
  border-radius: 999px;
  background: color-mix(in srgb, var(--theme-bg-secondary) 90%, #ffffff 10%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.2),
    0 8px 18px rgba(15, 23, 42, 0.08);
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  overflow: hidden;
  transition:
    transform 0.18s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.color-picker:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--theme-accent) 42%, var(--theme-border));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.24),
    0 10px 22px rgba(15, 23, 42, 0.12);
}

.color-picker:focus-visible {
  outline: none;
  border-color: color-mix(in srgb, var(--theme-accent) 58%, var(--theme-border));
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--theme-accent) 18%, transparent),
    0 10px 22px rgba(15, 23, 42, 0.12);
}

.color-picker::-webkit-color-swatch-wrapper {
  padding: 0;
}

.color-picker::-webkit-color-swatch {
  border: none;
  border-radius: 999px;
}

.color-text {
  text-transform: uppercase;
}

.theme-actions,
.footer-actions,
.preview-meta,
.validation-summary {
  display: flex;
  align-items: center;
  gap: 10px;
}

.preview-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.meta-pill,
.summary-pill {
  padding: 5px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
}

.meta-pill {
  background: color-mix(in srgb, var(--theme-accent) 12%, transparent);
  color: var(--theme-accent);
}

.summary-pill.danger {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
}

.summary-pill.warning {
  background: rgba(245, 158, 11, 0.14);
  color: #d97706;
}

.summary-pill.empty {
  opacity: 0.55;
}

.preview-stage {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
}

.preview-canvas {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 360px;
  padding: 18px;
  border: 1px solid var(--theme-border);
  border-radius: calc(var(--theme-radius-lg) - 2px);
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0)),
    color-mix(in srgb, var(--theme-bg) 88%, #0f172a 12%);
}

.preview-image {
  width: 100%;
  max-width: 640px;
  border-radius: 18px;
  box-shadow: 0 18px 36px rgba(15, 23, 42, 0.18);
}

.preview-strip {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.preview-thumb {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 128px;
  min-width: 128px;
  padding: 8px;
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius);
  background: var(--theme-bg-secondary);
  color: var(--theme-text-secondary);
  cursor: pointer;
}

.preview-thumb.active {
  border-color: var(--theme-accent);
  color: var(--theme-text);
}

.preview-thumb img {
  width: 100%;
  border-radius: 10px;
}

.preview-thumb span {
  font-size: 12px;
  font-weight: 600;
}

.preview-state,
.panel-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 160px;
  border: 1px dashed var(--theme-border);
  border-radius: var(--theme-radius);
  color: var(--theme-text-secondary);
  font-size: 13px;
}

.preview-state.error {
  border-color: rgba(239, 68, 68, 0.24);
  color: #ef4444;
}

.validation-panel {
  margin-top: auto;
  padding: 14px;
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius);
  background: color-mix(in srgb, var(--theme-bg-secondary) 72%, transparent);
}

.issue-list {
  margin-top: 12px;
  font-size: 12px;
  line-height: 1.6;
}

.error-list {
  color: #ef4444;
}

.warning-list {
  color: #d97706;
}

.ready-list {
  color: var(--theme-success, #16a34a);
}

.footer-tip {
  max-width: 60%;
  font-size: 12px;
  line-height: 1.6;
  color: var(--theme-text-secondary);
}

@media (max-width: 960px) {
  .presentation-body {
    grid-template-columns: 1fr;
    overflow: auto;
  }

  .config-panel {
    overflow: visible;
  }

  .footer-tip {
    max-width: none;
  }
}

@media (max-width: 720px) {
  .presentation-overlay {
    padding: 12px;
  }

  .presentation-dialog {
    max-height: calc(100vh - 24px);
  }

  .presentation-header,
  .presentation-footer,
  .presentation-body {
    padding-left: 16px;
    padding-right: 16px;
  }

  .template-grid,
  .form-grid,
  .color-grid {
    grid-template-columns: 1fr;
  }

  .presentation-footer {
    flex-direction: column;
    align-items: stretch;
  }

  .footer-actions {
    justify-content: flex-end;
  }
}
</style>
