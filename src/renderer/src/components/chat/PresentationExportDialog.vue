<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type {
  BuildPresentationDraftRequest,
  DeletePresentationTemplateRequest,
  ExportPresentationRequest,
  Message,
  PresentationConfig,
  PresentationThemeConfig,
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
  backgroundColor: string
  textColor: string
  mutedTextColor: string
  fontFace: string
  headingFontFace: string
}

const DEFAULT_TEMPLATE_PRESET: TemplatePreset = {
  primaryColor: '#2F6BFF',
  secondaryColor: '#DCE7FF',
  accentColor: '#63A4FF',
  backgroundColor: '#F7FAFF',
  textColor: '#17324D',
  mutedTextColor: '#5B6F84',
  fontFace: 'PingFang SC',
  headingFontFace: 'PingFang SC'
}

const templates = ref<TemplateInfo[]>([])
const selectedTemplateKey = ref('')
const title = ref('')
const author = ref('')
const subject = ref('AI 助手生成演示文稿')
const primaryColor = ref(DEFAULT_TEMPLATE_PRESET.primaryColor)
const secondaryColor = ref(DEFAULT_TEMPLATE_PRESET.secondaryColor)
const accentColor = ref(DEFAULT_TEMPLATE_PRESET.accentColor)
const backgroundColor = ref(DEFAULT_TEMPLATE_PRESET.backgroundColor)
const textColor = ref(DEFAULT_TEMPLATE_PRESET.textColor)
const mutedTextColor = ref(DEFAULT_TEMPLATE_PRESET.mutedTextColor)
const fontFace = ref(DEFAULT_TEMPLATE_PRESET.fontFace)
const headingFontFace = ref(DEFAULT_TEMPLATE_PRESET.headingFontFace)

const previewImages = ref<string[]>([])
const previewIndex = ref(0)
const validationResult = ref<ValidationResult | null>(null)
const draftConfig = ref<PresentationConfig | null>(null)
const loadingTemplates = ref(false)
const loadingPreview = ref(false)
const loadError = ref('')
const importingTemplate = ref(false)
const deletingTemplateKey = ref('')
const templateImportError = ref('')
const templateImportSuccess = ref('')
const templateFileInput = ref<HTMLInputElement | null>(null)

let previewTimer: number | null = null
let templateSuccessTimer: number | null = null

const activeTemplateInfo = computed(() => {
  return templates.value.find((item) => item.selectionKey === selectedTemplateKey.value) || null
})

const resolvedTemplateInfo = computed(() => {
  return activeTemplateInfo.value || templates.value[0] || null
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

function normalizeColorInput(
  color: string | undefined,
  fallback: string = DEFAULT_TEMPLATE_PRESET.primaryColor
): string {
  const normalized = color?.trim().replace(/^#/, '').toUpperCase()
  if (normalized && /^[0-9A-F]{6}$/.test(normalized)) {
    return `#${normalized}`
  }

  return fallback
}

function buildTemplatePreset(templateInfo: TemplateInfo | null): TemplatePreset {
  const theme = templateInfo?.theme || {}

  return {
    primaryColor: normalizeColorInput(theme.primaryColor, DEFAULT_TEMPLATE_PRESET.primaryColor),
    secondaryColor: normalizeColorInput(
      theme.secondaryColor,
      DEFAULT_TEMPLATE_PRESET.secondaryColor
    ),
    accentColor: normalizeColorInput(theme.accentColor, DEFAULT_TEMPLATE_PRESET.accentColor),
    backgroundColor: normalizeColorInput(
      theme.backgroundColor,
      DEFAULT_TEMPLATE_PRESET.backgroundColor
    ),
    textColor: normalizeColorInput(theme.textColor, DEFAULT_TEMPLATE_PRESET.textColor),
    mutedTextColor: normalizeColorInput(
      theme.mutedTextColor,
      DEFAULT_TEMPLATE_PRESET.mutedTextColor
    ),
    fontFace: theme.fontFace?.trim() || DEFAULT_TEMPLATE_PRESET.fontFace,
    headingFontFace: theme.headingFontFace?.trim() || DEFAULT_TEMPLATE_PRESET.headingFontFace
  }
}

function applyTemplatePreset(templateInfo: TemplateInfo | null): void {
  const preset = buildTemplatePreset(templateInfo)
  primaryColor.value = preset.primaryColor
  secondaryColor.value = preset.secondaryColor
  accentColor.value = preset.accentColor
  backgroundColor.value = preset.backgroundColor
  textColor.value = preset.textColor
  mutedTextColor.value = preset.mutedTextColor
  fontFace.value = preset.fontFace
  headingFontFace.value = preset.headingFontFace
}

function buildThemeConfig(): PresentationThemeConfig {
  return {
    primaryColor: primaryColor.value,
    secondaryColor: secondaryColor.value,
    accentColor: accentColor.value,
    backgroundColor: backgroundColor.value,
    textColor: textColor.value,
    mutedTextColor: mutedTextColor.value,
    fontFace: fontFace.value.trim() || undefined,
    headingFontFace: headingFontFace.value.trim() || undefined
  }
}

function buildDraftRequest(): BuildPresentationDraftRequest {
  const templateInfo = resolvedTemplateInfo.value

  return {
    content: props.message.content,
    title: title.value.trim() || props.defaultTitle || '未命名演示文稿',
    author: author.value.trim() || undefined,
    subject: subject.value.trim() || undefined,
    template: templateInfo?.id || 'lessonPlan',
    customTemplateId: templateInfo?.userTemplateId,
    theme: buildThemeConfig()
  }
}

function resolveDeleteRequest(
  templateInfo: TemplateInfo | null
): DeletePresentationTemplateRequest | null {
  if (!templateInfo) {
    return null
  }

  if (templateInfo.source === 'builtin') {
    return {
      templateId: templateInfo.id,
      source: 'builtin'
    }
  }

  if (templateInfo.userTemplateId) {
    return {
      templateId: templateInfo.userTemplateId,
      source: 'user'
    }
  }

  return null
}

function canDeleteTemplate(templateInfo: TemplateInfo): boolean {
  return !!resolveDeleteRequest(templateInfo)
}

function isDeletingTemplate(templateInfo: TemplateInfo): boolean {
  return deletingTemplateKey.value === templateInfo.selectionKey
}

async function loadTemplates(): Promise<void> {
  loadingTemplates.value = true

  try {
    templates.value = await window.api.presentation.getTemplates()
    const matchedTemplate = templates.value.find(
      (item) => item.selectionKey === selectedTemplateKey.value
    )

    if (matchedTemplate) {
      return
    }

    const fallbackTemplate = templates.value[0] || null
    if (fallbackTemplate) {
      selectedTemplateKey.value = fallbackTemplate.selectionKey
      applyTemplatePreset(fallbackTemplate)
    } else {
      selectedTemplateKey.value = ''
      previewImages.value = []
      validationResult.value = null
      draftConfig.value = null
    }
  } catch (error) {
    templateImportError.value = error instanceof Error ? error.message : String(error)
  } finally {
    loadingTemplates.value = false
  }
}

function clearTemplateSuccessTimer(): void {
  if (templateSuccessTimer !== null) {
    window.clearTimeout(templateSuccessTimer)
    templateSuccessTimer = null
  }
}

function showTemplateSuccess(message: string): void {
  clearTemplateSuccessTimer()
  templateImportSuccess.value = message
  templateSuccessTimer = window.setTimeout(() => {
    templateImportSuccess.value = ''
    templateSuccessTimer = null
  }, 2600)
}

async function refreshPreview(): Promise<void> {
  if (!resolvedTemplateInfo.value) {
    loadError.value = '当前没有可用模板，请先上传模板'
    previewImages.value = []
    validationResult.value = null
    draftConfig.value = null
    return
  }

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

function handleTemplateSelect(selectionKey: string): void {
  if (selectedTemplateKey.value === selectionKey) {
    return
  }

  const templateInfo = templates.value.find((item) => item.selectionKey === selectionKey) || null
  if (!templateInfo) {
    return
  }

  selectedTemplateKey.value = templateInfo.selectionKey
  applyTemplatePreset(templateInfo)
}

function triggerTemplateUpload(): void {
  if (!importingTemplate.value && !deletingTemplateKey.value) {
    templateFileInput.value?.click()
  }
}

async function handleTemplateFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) {
    return
  }

  templateImportError.value = ''
  templateImportSuccess.value = ''
  clearTemplateSuccessTimer()
  importingTemplate.value = true

  try {
    const data = new Uint8Array(await file.arrayBuffer())
    const result = await window.api.presentation.importTemplate({
      data: Array.from(data),
      fileName: file.name
    })

    if (!result.success || !result.data) {
      templateImportError.value = result.error || '模板导入失败'
      return
    }

    await loadTemplates()
    handleTemplateSelect(result.data.selectionKey)
    showTemplateSuccess(`模板“${result.data.name}”已保存`)
  } catch (error) {
    templateImportError.value = error instanceof Error ? error.message : String(error)
  } finally {
    importingTemplate.value = false
    input.value = ''
  }
}

async function handleDeleteTemplate(templateInfo: TemplateInfo): Promise<void> {
  const deleteRequest = resolveDeleteRequest(templateInfo)

  if (!templateInfo || !deleteRequest) {
    return
  }

  const actionLabel = templateInfo.source === 'builtin' ? '移除' : '删除'
  const confirmed = window.confirm(`确认${actionLabel}模板“${templateInfo.name}”吗？`)
  if (!confirmed) {
    return
  }

  templateImportError.value = ''
  templateImportSuccess.value = ''
  clearTemplateSuccessTimer()
  deletingTemplateKey.value = templateInfo.selectionKey

  try {
    const deleteTemplateApi = window.api.presentation?.deleteTemplate
    if (typeof deleteTemplateApi !== 'function') {
      templateImportError.value = '当前版本未加载模板删除接口，请重启应用后重试'
      return
    }

    const result = await deleteTemplateApi(deleteRequest)

    if (!result.success) {
      templateImportError.value = result.error || '模板删除失败'
      return
    }

    await loadTemplates()
    showTemplateSuccess(`模板“${templateInfo.name}”已${actionLabel}`)
  } catch (error) {
    templateImportError.value = error instanceof Error ? error.message : String(error)
  } finally {
    deletingTemplateKey.value = ''
  }
}

function handleExport(): void {
  if (!resolvedTemplateInfo.value) {
    loadError.value = '当前没有可用模板，请先上传模板'
    return
  }

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
    selectedTemplateKey,
    title,
    author,
    subject,
    primaryColor,
    secondaryColor,
    accentColor,
    backgroundColor,
    textColor,
    mutedTextColor,
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

  clearTemplateSuccessTimer()
})
</script>

<template>
  <div class="presentation-overlay" @click.self="handleClose">
    <div class="presentation-dialog">
      <div v-if="templateImportSuccess" class="floating-tip success">
        {{ templateImportSuccess }}
      </div>

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
            <div class="section-heading template-section-heading">
              <h4>模板选择</h4>

              <button
                class="minor-btn upload-btn"
                :disabled="importingTemplate || !!deletingTemplateKey"
                @click="triggerTemplateUpload"
              >
                {{ importingTemplate ? '正在导入...' : '上传模板' }}
              </button>
            </div>

            <input
              ref="templateFileInput"
              type="file"
              accept=".pptx,.potx"
              class="hidden-file-input"
              @change="handleTemplateFileChange"
            />

            <div v-if="templateImportError" class="inline-tip error">{{ templateImportError }}</div>

            <div v-if="loadingTemplates" class="panel-state">正在加载模板...</div>

            <div v-else-if="templates.length === 0" class="panel-state">
              当前没有可用模板，请先上传模板。
            </div>

            <div v-else class="template-grid">
              <div
                v-for="templateItem in templates"
                :key="templateItem.selectionKey"
                class="template-card"
                :class="{ active: selectedTemplateKey === templateItem.selectionKey }"
                role="button"
                tabindex="0"
                @click="handleTemplateSelect(templateItem.selectionKey)"
                @keydown.enter.prevent="handleTemplateSelect(templateItem.selectionKey)"
                @keydown.space.prevent="handleTemplateSelect(templateItem.selectionKey)"
              >
                <div class="template-card-head">
                  <div class="template-swatches">
                    <span
                      v-for="color in templateItem.previewColors || []"
                      :key="color"
                      class="template-swatch"
                      :style="{ backgroundColor: `#${color.replace(/^#/, '')}` }"
                    />
                  </div>
                </div>
                <div class="template-card-title">{{ templateItem.name }}</div>

                <button
                  class="template-delete-btn"
                  :disabled="
                    !canDeleteTemplate(templateItem) || importingTemplate || !!deletingTemplateKey
                  "
                  @click.stop="handleDeleteTemplate(templateItem)"
                >
                  {{ isDeletingTemplate(templateItem) ? '正在删除...' : '删除模板' }}
                </button>
              </div>
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
              <label class="color-field">
                <span class="field-label">背景色</span>
                <div class="color-input-wrap">
                  <input v-model="backgroundColor" type="color" class="color-picker" />
                  <input v-model="backgroundColor" class="form-input color-text" />
                </div>
              </label>
              <label class="color-field">
                <span class="field-label">正文字色</span>
                <div class="color-input-wrap">
                  <input v-model="textColor" type="color" class="color-picker" />
                  <input v-model="textColor" class="form-input color-text" />
                </div>
              </label>
              <label class="color-field">
                <span class="field-label">弱化文字</span>
                <div class="color-input-wrap">
                  <input v-model="mutedTextColor" type="color" class="color-picker" />
                  <input v-model="mutedTextColor" class="form-input color-text" />
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
              <button class="minor-btn" @click="applyTemplatePreset(resolvedTemplateInfo)">
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
              <span v-if="resolvedTemplateInfo" class="meta-pill">{{
                resolvedTemplateInfo.name
              }}</span>
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

          <div class="preview-validation">
            <div class="validation-badge-wrap">
              <span class="summary-pill danger" :class="{ empty: errorIssues.length === 0 }">
                错误 {{ errorIssues.length }}
              </span>

              <div v-if="errorIssues.length > 0" class="validation-tooltip">
                <div class="issue-list">
                  <div
                    v-for="issue in errorIssues.slice(0, 6)"
                    :key="`error-${issue.path}-${issue.message}`"
                    class="validation-tooltip-item error-list"
                  >
                    {{ issue.message }}
                  </div>
                </div>
              </div>
            </div>

            <div class="validation-badge-wrap">
              <span class="summary-pill warning" :class="{ empty: warningIssues.length === 0 }">
                警告 {{ warningIssues.length }}
              </span>

              <div v-if="warningIssues.length > 0" class="validation-tooltip">
                <div class="issue-list">
                  <div
                    v-for="issue in warningIssues.slice(0, 6)"
                    :key="`warning-${issue.path}-${issue.message}`"
                    class="validation-tooltip-item warning-list"
                  >
                    {{ issue.message }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div class="presentation-footer">
        <div class="footer-tip">预览图基于当前模板和主题即时生成，用于快速确认排版方向。</div>
        <div class="footer-actions">
          <button class="minor-btn" :disabled="isExporting" @click="handleClose">取消</button>
          <button
            class="primary-btn"
            :disabled="isExporting || errorIssues.length > 0 || !resolvedTemplateInfo"
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
  position: relative;
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
  position: relative;
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

.template-section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.section-heading h4,
.preview-header h4 {
  margin: 0;
  font-size: 16px;
  color: var(--theme-text);
}

.template-section-heading h4 {
  display: flex;
  align-items: center;
  min-height: 38px;
}

.hidden-file-input {
  display: none;
}

.upload-btn {
  min-height: 38px;
  white-space: nowrap;
}

.floating-tip {
  position: absolute;
  top: 18px;
  right: 108px;
  z-index: 3;
  max-width: min(360px, calc(100% - 156px));
  padding: 10px 14px;
  border-radius: var(--theme-radius);
  font-size: 12px;
  line-height: 1.6;
  box-shadow: 0 14px 28px rgba(15, 23, 42, 0.18);
  pointer-events: none;
}

.floating-tip.success {
  background: rgba(34, 197, 94, 0.14);
  color: #15803d;
}

.inline-tip {
  margin-bottom: 12px;
  padding: 10px 12px;
  border-radius: var(--theme-radius);
  font-size: 12px;
  line-height: 1.6;
}

.inline-tip.success {
  background: rgba(34, 197, 94, 0.12);
  color: #15803d;
}

.inline-tip.error {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
}

.template-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.template-card {
  display: flex;
  flex-direction: column;
  min-height: 126px;
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

.template-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}

.template-swatches {
  display: flex;
  gap: 6px;
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

.template-delete-btn {
  align-self: flex-end;
  margin-top: auto;
  flex-shrink: 0;
  padding: 6px 10px;
  border: 1px solid rgba(239, 68, 68, 0.22);
  border-radius: 999px;
  background: rgba(239, 68, 68, 0.08);
  color: #ef4444;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    border-color 0.2s ease,
    background-color 0.2s ease;
}

.template-delete-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: rgba(239, 68, 68, 0.34);
  background: rgba(239, 68, 68, 0.14);
}

.template-delete-btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
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
.preview-validation {
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

.meta-pill.muted {
  background: color-mix(in srgb, var(--theme-border) 60%, transparent);
  color: var(--theme-text-secondary);
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
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(148px, 148px);
  align-items: center;
  gap: 12px;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 8px;
  border: 1px solid var(--theme-border);
  border-radius: calc(var(--theme-radius-lg) - 2px);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.028), rgba(255, 255, 255, 0)),
    color-mix(in srgb, var(--theme-bg-secondary) 82%, transparent);
}

.preview-thumb {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 148px;
  min-width: 148px;
  padding: 10px;
  box-sizing: border-box;
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius);
  background: var(--theme-bg-secondary);
  color: var(--theme-text-secondary);
  cursor: pointer;
  overflow: hidden;
  transition:
    transform 0.18s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.preview-thumb.active {
  border-color: var(--theme-accent);
  color: var(--theme-text);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--theme-accent) 24%, transparent);
}

.preview-thumb:hover {
  transform: translateY(-1px);
}

.preview-thumb img {
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
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

.preview-validation {
  position: relative;
  margin-top: auto;
  justify-content: flex-end;
  padding-top: 2px;
}

.validation-badge-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.validation-badge-wrap:hover .validation-tooltip,
.validation-badge-wrap:focus-within .validation-tooltip {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
}

.validation-tooltip {
  position: absolute;
  right: 0;
  bottom: calc(100% + 10px);
  z-index: 2;
  width: min(360px, 45vw);
  padding: 12px 14px;
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.045), rgba(255, 255, 255, 0.01)),
    color-mix(in srgb, var(--theme-bg-secondary) 94%, #0f172a 6%);
  box-shadow: 0 18px 36px rgba(15, 23, 42, 0.18);
  opacity: 0;
  visibility: hidden;
  transform: translateY(6px);
  transition:
    opacity 0.18s ease,
    transform 0.18s ease,
    visibility 0.18s ease;
}

.issue-list {
  font-size: 12px;
  line-height: 1.6;
}

.validation-tooltip-item + .validation-tooltip-item {
  margin-top: 8px;
}

.error-list {
  color: #ef4444;
}

.warning-list {
  color: #d97706;
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

  .template-section-heading {
    flex-direction: column;
    align-items: stretch;
  }

  .presentation-footer {
    flex-direction: column;
    align-items: stretch;
  }

  .floating-tip {
    top: 72px;
    right: 16px;
    left: 16px;
    max-width: none;
  }

  .footer-actions {
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .validation-tooltip {
    right: 0;
    left: auto;
    width: min(100vw - 56px, 360px);
  }
}
</style>
