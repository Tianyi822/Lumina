<script setup lang="ts">
import { watch, ref, computed, nextTick } from 'vue'
import type {
  PptTemplateListItem,
  PptTemplateAnalysis,
  PptTemplateElementAnalysis,
  PptTemplateSlideAnalysis
} from '@shared/types/ppt-template'
import type { PptExportSlidePreview } from '@shared/types/ppt-export'
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
const selectedTemplateId = ref<string>('')

/** 当前查看的页面索引 */
const currentSlideIndex = ref<number>(0)

/** 缩略图滚动容器引用 */
const thumbnailScrollRef = ref<HTMLElement | null>(null)

/** 可用模板列表（从预览数据中获取） */
const availableTemplates = computed<PptTemplateListItem[]>(() => {
  return previewData.value?.availableTemplates ?? []
})

/** 是否有可用模板 */
const hasTemplates = computed(() => availableTemplates.value.length > 0)

/** 当前查看的幻灯片 */
const currentSlide = computed<PptExportSlidePreview | undefined>(() => {
  return exportConfig.value?.slides[currentSlideIndex.value]
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

/** 内容类型颜色映射 */
const contentTypeColors: Record<string, string> = {
  title: '#3b82f6',
  content: '#10b981',
  table: '#f59e0b',
  list: '#8b5cf6',
  mixed: '#ec4899'
}

type TemplatePreviewStatus = 'idle' | 'loading' | 'ready' | 'error'

interface TemplatePreviewModel {
  status: TemplatePreviewStatus
  imageUrl?: string
}

const EMU_PER_PX = 9525
const DEFAULT_PREVIEW_WIDTH = 1280
const DEFAULT_PREVIEW_HEIGHT = 720
const OFFICE_THEME_COLORS: Record<string, string> = {
  accent1: '#4472c4',
  accent2: '#ed7d31',
  accent3: '#a5a5a5',
  accent4: '#ffc000',
  accent5: '#5b9bd5',
  accent6: '#70ad47',
  bg1: '#ffffff',
  bg2: '#e7e6e6',
  tx1: '#000000',
  tx2: '#44546a',
  dk1: '#000000',
  dk2: '#44546a',
  lt1: '#ffffff',
  lt2: '#e7e6e6'
}

/** 模板第一页预览缓存 */
const templatePreviewMap = ref<Record<string, TemplatePreviewModel>>({})

function emuToPx(value?: number): number {
  if (!value || Number.isNaN(value)) {
    return 0
  }
  return Math.max(0, Math.round(value / EMU_PER_PX))
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function resolvePptColor(color?: string, fallback = '#ffffff'): string {
  if (!color) {
    return fallback
  }

  const normalized = color.trim().replace(/^#/, '').toLowerCase()
  if (/^[0-9a-f]{6}$/i.test(normalized)) {
    return `#${normalized}`
  }

  return OFFICE_THEME_COLORS[normalized] ?? fallback
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

function encodeSvgDataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${encodeBase64(new TextEncoder().encode(svg))}`
}

function inferMimeType(path: string): string {
  const normalized = path.toLowerCase()
  if (normalized.endsWith('.png')) return 'image/png'
  if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) return 'image/jpeg'
  if (normalized.endsWith('.gif')) return 'image/gif'
  if (normalized.endsWith('.webp')) return 'image/webp'
  if (normalized.endsWith('.svg')) return 'image/svg+xml'
  return 'application/octet-stream'
}

function estimateCharacterUnits(char: string): number {
  return /[\u0000-\u00ff]/.test(char) ? 0.55 : 1
}

function wrapPreviewText(text: string, maxUnits: number): string[] {
  const trimmed = text.trim()
  if (!trimmed) {
    return []
  }

  const rawLines = trimmed.split(/\r?\n/).flatMap((line) => {
    const current = line.trim()
    if (!current) {
      return ['']
    }

    const segments: string[] = []
    let buffer = ''
    let units = 0

    for (const char of current) {
      const nextUnits = units + estimateCharacterUnits(char)
      if (buffer && nextUnits > maxUnits) {
        segments.push(buffer)
        buffer = char
        units = estimateCharacterUnits(char)
      } else {
        buffer += char
        units = nextUnits
      }
    }

    if (buffer) {
      segments.push(buffer)
    }

    return segments
  })

  return rawLines.filter((line, index) => line.length > 0 || index === 0)
}

function getPreviewElements(slide: PptTemplateSlideAnalysis): PptTemplateElementAnalysis[] {
  const slideElements = slide.elements.filter((element) => element.source === 'slide')
  return (slideElements.length ? slideElements : slide.elements).slice().sort((a, b) => a.zIndex - b.zIndex)
}

function getTextFontSize(element: PptTemplateElementAnalysis, slideHeight: number): number {
  const boxHeight = emuToPx(element.cy)
  const plainText = element.text?.plainText ?? ''
  const isHeading = boxHeight > slideHeight * 0.18 || plainText.length <= 24
  const baseSize = isHeading ? boxHeight * 0.15 : boxHeight * 0.12
  return clamp(Math.round(baseSize), isHeading ? 18 : 12, isHeading ? 40 : 24)
}

function renderShapeElement(element: PptTemplateElementAnalysis): string {
  const x = emuToPx(element.x)
  const y = emuToPx(element.y)
  const width = emuToPx(element.cx)
  const height = emuToPx(element.cy)
  const fill = resolvePptColor(element.shape?.fillColor, 'transparent')
  const stroke = element.shape?.strokeColor
    ? resolvePptColor(element.shape.strokeColor, 'transparent')
    : 'transparent'
  const strokeWidth = element.shape?.strokeWidth
    ? Math.max(1, Math.round(element.shape.strokeWidth / EMU_PER_PX))
    : 0

  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`
}

function renderTextElement(
  element: PptTemplateElementAnalysis,
  slideWidth: number,
  slideHeight: number
): string {
  const plainText = element.text?.plainText?.trim()
  if (!plainText) {
    return element.shape ? renderShapeElement(element) : ''
  }

  const x = emuToPx(element.x)
  const y = emuToPx(element.y)
  const width = emuToPx(element.cx)
  const height = emuToPx(element.cy)
  const fontSize = getTextFontSize(element, slideHeight)
  const maxUnits = Math.max(6, width / Math.max(fontSize * 0.62, 1))
  const lines = wrapPreviewText(plainText, maxUnits).slice(0, 4)
  const lineHeight = Math.round(fontSize * 1.28)
  const totalHeight = lines.length * lineHeight
  const isCentered = width > slideWidth * 0.45
  const startY = y + Math.max(fontSize, Math.round((height - totalHeight) / 2 + fontSize))
  const anchor = isCentered ? 'middle' : 'start'
  const textX = isCentered ? x + width / 2 : x + 12
  const weight = fontSize >= 28 ? 700 : 500
  const textColor = fontSize >= 28 ? '#0f172a' : '#1e293b'
  const boxMarkup = element.shape ? renderShapeElement(element) : ''
  const lineMarkup = lines
    .map((line, index) => {
      const dy = index === 0 ? 0 : lineHeight
      return `<tspan x="${textX}" dy="${dy}">${escapeXml(line)}</tspan>`
    })
    .join('')

  return `${boxMarkup}<text x="${textX}" y="${startY}" fill="${textColor}" font-size="${fontSize}" font-weight="${weight}" text-anchor="${anchor}" font-family="'Microsoft YaHei','PingFang SC','Noto Sans SC',sans-serif">${lineMarkup}</text>`
}

function renderImageElement(
  element: PptTemplateElementAnalysis,
  imageDataUrl?: string
): string {
  const x = emuToPx(element.x)
  const y = emuToPx(element.y)
  const width = emuToPx(element.cx)
  const height = emuToPx(element.cy)

  if (imageDataUrl) {
    return `<image x="${x}" y="${y}" width="${width}" height="${height}" href="${imageDataUrl}" preserveAspectRatio="xMidYMid meet" />`
  }

  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="8" ry="8" fill="#e2e8f0" /><text x="${x + width / 2}" y="${y + height / 2}" fill="#64748b" font-size="16" font-weight="600" text-anchor="middle" dominant-baseline="middle">IMAGE</text>`
}

function renderTableElement(element: PptTemplateElementAnalysis): string {
  const x = emuToPx(element.x)
  const y = emuToPx(element.y)
  const width = emuToPx(element.cx)
  const height = emuToPx(element.cy)
  const summary = element.table?.cells
    ?.slice(0, 4)
    .map((cell) => cell.text.trim())
    .filter(Boolean)
    .join(' / ')

  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#ffffff" stroke="#cbd5e1" stroke-width="1" /><text x="${x + 10}" y="${y + 24}" fill="#334155" font-size="14" font-weight="600">${escapeXml(summary || '表格')}</text>`
}

async function extractSlideImages(
  slide: PptTemplateSlideAnalysis,
  sourceData: Uint8Array
): Promise<Record<string, string>> {
  const imageTargets = new Set(
    slide.elements
      .filter((element) => element.source === 'slide' && element.kind === 'image')
      .map((element) => element.image?.relationshipTarget)
      .filter((target): target is string => !!target)
  )

  if (!imageTargets.size) {
    return {}
  }

  const jszipModule = await import('jszip2')
  const JSZip = ((jszipModule as { default?: unknown }).default ?? jszipModule) as new (
    data?: ArrayBuffer
  ) => {
    file: (name: string) => { asUint8Array: () => Uint8Array } | null
  }

  const zip = new JSZip(new Uint8Array(sourceData).buffer as ArrayBuffer)
  const imageMap: Record<string, string> = {}

  imageTargets.forEach((target) => {
    const entry = zip.file(target)
    if (!entry) {
      return
    }

    const bytes = entry.asUint8Array()
    imageMap[target] = `data:${inferMimeType(target)};base64,${encodeBase64(bytes)}`
  })

  return imageMap
}

async function buildTemplatePreviewImage(
  analysis: PptTemplateAnalysis,
  sourceData?: Uint8Array
): Promise<string> {
  const slide = analysis.slides[0]
  if (!slide) {
    throw new Error('模板缺少第一页')
  }

  const slideWidth = emuToPx(analysis.presentation.slideWidth) || DEFAULT_PREVIEW_WIDTH
  const slideHeight = emuToPx(analysis.presentation.slideHeight) || DEFAULT_PREVIEW_HEIGHT
  const imageMap = sourceData ? await extractSlideImages(slide, sourceData) : {}
  const elements = getPreviewElements(slide)
  const backgroundColor = resolvePptColor(slide.background?.color, '#ffffff')

  const elementMarkup = elements
    .map((element) => {
      switch (element.kind) {
        case 'shape':
          return renderShapeElement(element)
        case 'text':
        case 'placeholder':
          return renderTextElement(element, slideWidth, slideHeight)
        case 'image':
          return renderImageElement(element, imageMap[element.image?.relationshipTarget ?? ''])
        case 'table':
          return renderTableElement(element)
        default:
          return ''
      }
    })
    .join('')

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${slideWidth}" height="${slideHeight}" viewBox="0 0 ${slideWidth} ${slideHeight}">
      <rect width="100%" height="100%" fill="${backgroundColor}" />
      ${elementMarkup}
    </svg>
  `.trim()

  return encodeSvgDataUrl(svg)
}

/**
 * 读取模板源文件并渲染第一页
 */
async function ensureTemplatePreview(templateId: string): Promise<void> {
  const currentPreview = templatePreviewMap.value[templateId]
  if (currentPreview?.status === 'loading' || currentPreview?.status === 'ready') {
    return
  }

  templatePreviewMap.value = {
    ...templatePreviewMap.value,
    [templateId]: {
      status: 'loading'
    }
  }

  try {
    const [analysisResult, sourceResult] = await Promise.all([
      window.api.pptTemplate.getAnalysis(templateId) as Promise<{
        success: boolean
        data?: PptTemplateAnalysis
        error?: string
      }>,
      window.api.pptTemplate.getSourceData(templateId)
    ])

    if (!analysisResult.success || !analysisResult.data) {
      throw new Error(analysisResult.error || '模板分析结果不存在')
    }

    const sourceData =
      sourceResult.success && sourceResult.data?.data?.length
        ? new Uint8Array(sourceResult.data.data)
        : undefined
    const imageUrl = await buildTemplatePreviewImage(analysisResult.data, sourceData)

    templatePreviewMap.value = {
      ...templatePreviewMap.value,
      [templateId]: {
        status: 'ready',
        imageUrl
      }
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    void window.api.logger.warn('[PptExportConfigDialog] 渲染模板第一页失败', {
      templateId,
      error: errorMessage
    })

    templatePreviewMap.value = {
      ...templatePreviewMap.value,
      [templateId]: {
        status: 'error'
      }
    }
  }
}

/**
 * 切换当前查看的幻灯片
 */
function selectCurrentSlide(index: number): void {
  currentSlideIndex.value = index
  // 滚动缩略图到可见区域
  nextTick(() => {
    const thumbnailEl = thumbnailScrollRef.value?.querySelector(`[data-slide-index="${index}"]`)
    if (thumbnailEl) {
      thumbnailEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }
  })
}

/**
 * 切换当前幻灯片的选中状态
 */
function toggleCurrentSlideSelection(): void {
  if (currentSlide.value) {
    toggleSlideSelection(currentSlide.value.index)
  }
}

/**
 * 监听对话框显示状态
 */
watch(
  () => props.visible,
  async (visible) => {
    if (!visible) {
      reset()
      currentSlideIndex.value = 0
    }

    if (visible && props.content) {
      clearError()
      const initialTemplateId = props.initialTemplateId || undefined

      if (initialTemplateId) {
        selectedTemplateId.value = initialTemplateId
      }

      await preview(props.content, initialTemplateId)
      currentSlideIndex.value = 0
    }
  },
  { immediate: true }
)

/**
 * 监听模板选择
 */
watch(selectedTemplateId, (templateId) => {
  if (!exportConfig.value) return
  if (templateId) {
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
    if (styleSource.type === 'template') {
      selectedTemplateId.value = styleSource.templateId
    }
  },
  { immediate: true }
)

/**
 * 模板列表变化后，确保存在默认选项
 */
watch(availableTemplates, (templates) => {
  if (!templates.length) return

  const hasSelectedTemplate = templates.some((template) => template.id === selectedTemplateId.value)
  if (!hasSelectedTemplate) {
    selectedTemplateId.value = templates[0].id
  }

  templates.forEach((template) => {
    void ensureTemplatePreview(template.id)
  })
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
    await preview(props.content, selectedTemplateId.value || undefined)
  }
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
              <p class="ppt-export-dialog-subtitle">选择要导出的页面和模板</p>
            </div>
            <button class="ppt-export-dialog-close" :disabled="isGenerating" @click="handleClose">
              关闭
            </button>
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

            <!-- 左右布局主体 -->
            <div class="ppt-export-main-layout">
              <!-- 左侧：模板选择网格 -->
              <div class="ppt-export-left-panel">
                <div class="ppt-export-section-header">
                  <h4 class="ppt-export-section-title">选择模板</h4>
                </div>
                <div v-if="hasTemplates" class="ppt-export-templates-grid">
                  <div
                    v-for="template in availableTemplates"
                    :key="template.id"
                    class="ppt-export-template-card"
                    :class="{ active: selectedTemplateId === template.id }"
                    @click="selectedTemplateId = template.id"
                  >
                    <!-- 模板预览图区域 -->
                    <div class="ppt-export-template-preview">
                      <div
                        v-if="templatePreviewMap[template.id]?.imageUrl"
                        class="ppt-export-template-preview-slide"
                      >
                        <img
                          :src="templatePreviewMap[template.id]?.imageUrl"
                          :alt="`${template.name} 首页预览`"
                          class="ppt-export-template-preview-image"
                        />
                      </div>
                      <div v-else class="ppt-export-template-preview-placeholder">
                        <span class="ppt-export-template-preview-icon">📄</span>
                        <span class="ppt-export-template-preview-count">
                          {{
                            templatePreviewMap[template.id]?.status === 'loading'
                              ? '正在加载首页'
                              : templatePreviewMap[template.id]?.status === 'error'
                                ? '暂无首页预览'
                                : '暂无首页预览'
                          }}
                        </span>
                      </div>
                      <div class="ppt-export-template-preview-page-count">
                        {{ template.slideCount }} 页
                      </div>
                      <div class="ppt-export-template-check-badge">
                        <span>✓</span>
                      </div>
                    </div>
                    <!-- 模板信息 -->
                    <div class="ppt-export-template-card-info">
                      <span class="ppt-export-template-card-name" :title="template.name">
                        {{ template.name }}
                      </span>
                      <span class="ppt-export-template-card-meta">
                        {{ formatFileSize(template.fileSize) }}
                      </span>
                    </div>
                  </div>
                </div>
                <div v-else class="ppt-export-empty-state">
                  <p>暂无可用模板</p>
                  <p class="ppt-export-empty-hint">请先上传 PPT 模板文件</p>
                </div>
              </div>

              <!-- 右侧：内容预览面板 -->
              <div class="ppt-export-right-panel">
                <!-- 上半部分：当前页面详细预览 -->
                <div class="ppt-export-preview-detail">
                  <div class="ppt-export-section-header">
                    <h4 class="ppt-export-section-title">页面预览</h4>
                    <div class="ppt-export-preview-actions">
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
                  </div>
                  <!-- 当前页面内容 -->
                  <div v-if="currentSlide" class="ppt-export-slide-detail-content">
                    <div class="ppt-export-slide-detail-stage">
                      <div
                        v-if="currentSlide.previewImageDataUrl"
                        class="ppt-export-slide-detail-canvas"
                      >
                        <img
                          :src="currentSlide.previewImageDataUrl"
                          :alt="`第 ${currentSlide.index + 1} 页预览`"
                          class="ppt-export-slide-detail-image"
                        />
                      </div>
                      <div v-else class="ppt-export-slide-detail-placeholder">
                        <span>页面预览生成中</span>
                      </div>
                    </div>
                    <div class="ppt-export-slide-detail-header">
                      <div class="ppt-export-slide-detail-title-row">
                        <label class="ppt-export-slide-checkbox">
                          <input
                            type="checkbox"
                            :checked="currentSlide.selected"
                            :disabled="isGenerating"
                            @change="toggleCurrentSlideSelection"
                            @click.stop
                          />
                        </label>
                        <span class="ppt-export-slide-detail-index">
                          第 {{ currentSlide.index + 1 }} 页
                        </span>
                        <span
                          class="ppt-export-slide-detail-type"
                          :style="{
                            backgroundColor: contentTypeColors[currentSlide.contentType] + '20',
                            color: contentTypeColors[currentSlide.contentType]
                          }"
                        >
                          {{ contentTypeLabels[currentSlide.contentType] || currentSlide.contentType }}
                        </span>
                      </div>
                      <h5 class="ppt-export-slide-detail-title">
                        {{ currentSlide.title || '无标题' }}
                      </h5>
                    </div>
                    <div class="ppt-export-slide-detail-summary">
                      <p>{{ currentSlide.summary }}</p>
                    </div>
                    <div
                      class="ppt-export-slide-detail-status"
                      :class="{ selected: currentSlide.selected }"
                    >
                      {{ currentSlide.selected ? '已选中导出' : '未选中' }}
                    </div>
                  </div>
                  <div v-else class="ppt-export-slide-detail-empty">
                    <p>暂无页面</p>
                  </div>
                </div>

                <!-- 下半部分：横向缩略图滚动 -->
                <div class="ppt-export-thumbnails-panel">
                  <div class="ppt-export-section-header">
                    <h4 class="ppt-export-section-title">全部页面</h4>
                    <span class="ppt-export-thumbnails-count">
                      共 {{ exportConfig?.slides.length || 0 }} 页
                    </span>
                  </div>
                  <div ref="thumbnailScrollRef" class="ppt-export-thumbnails-scroll">
                    <div
                      v-for="slide in exportConfig?.slides"
                      :key="slide.index"
                      :data-slide-index="slide.index"
                      class="ppt-export-thumbnail-item"
                      :class="{
                        active: currentSlideIndex === slide.index,
                        selected: slide.selected
                      }"
                      @click="selectCurrentSlide(slide.index)"
                    >
                      <div class="ppt-export-thumbnail-preview">
                        <img
                          v-if="slide.previewImageDataUrl"
                          :src="slide.previewImageDataUrl"
                          :alt="`第 ${slide.index + 1} 页缩略图`"
                          class="ppt-export-thumbnail-image"
                        />
                        <span v-else class="ppt-export-thumbnail-number">
                          {{ slide.index + 1 }}
                        </span>
                        <span
                          class="ppt-export-thumbnail-type"
                          :style="{
                            backgroundColor: contentTypeColors[slide.contentType] || '#6b7280'
                          }"
                        ></span>
                      </div>
                      <div class="ppt-export-thumbnail-info">
                        <span class="ppt-export-thumbnail-title">
                          {{ slide.title || '无标题' }}
                        </span>
                      </div>
                      <div v-if="slide.selected" class="ppt-export-thumbnail-check">
                        <span>✓</span>
                      </div>
                    </div>
                  </div>
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
  width: min(960px, 100%);
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

.ppt-export-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.ppt-export-section-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--theme-text);
}

/* ==================== 左右布局主体 ==================== */
.ppt-export-main-layout {
  display: flex;
  gap: 20px;
  padding: 0 22px;
  overflow: hidden;
  flex: 1;
}

/* ==================== 左侧面板：模板选择 ==================== */
.ppt-export-left-panel {
  width: 280px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ==================== 模板网格 ==================== */
.ppt-export-templates-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  overflow-y: auto;
  padding-right: 4px;
}

.ppt-export-templates-grid::-webkit-scrollbar {
  width: 4px;
}

.ppt-export-templates-grid::-webkit-scrollbar-track {
  background: transparent;
}

.ppt-export-templates-grid::-webkit-scrollbar-thumb {
  background: var(--theme-border);
  border-radius: 2px;
}

.ppt-export-template-card {
  display: flex;
  flex-direction: column;
  border: 2px solid var(--theme-border);
  border-radius: var(--theme-radius-lg);
  background: var(--theme-bg);
  cursor: pointer;
  overflow: hidden;
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease,
    transform 0.15s ease;
}

.ppt-export-template-card:hover {
  border-color: color-mix(in srgb, var(--theme-accent) 40%, var(--theme-border));
  background: var(--theme-bg-hover);
  transform: translateY(-2px);
}

.ppt-export-template-card.active {
  border-color: var(--theme-accent);
  background: color-mix(in srgb, var(--theme-accent) 8%, var(--theme-bg));
}

.ppt-export-template-preview {
  position: relative;
  aspect-ratio: 16 / 9;
  background: linear-gradient(135deg, #f0f4f8 0%, #e2e8f0 100%);
  overflow: hidden;
}

.ppt-export-template-preview-slide {
  position: absolute;
  inset: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  overflow: hidden;
  background: #ffffff;
  box-shadow:
    0 10px 24px rgba(15, 23, 42, 0.12),
    inset 0 0 0 1px rgba(255, 255, 255, 0.65);
}

.ppt-export-template-preview-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* ==================== 骨架屏样式 ==================== */
.ppt-export-template-preview-skeleton {
  position: absolute;
  inset: 8px;
  border-radius: 10px;
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  overflow: hidden;
  box-shadow: inset 0 0 0 1px rgba(203, 213, 225, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
}

.ppt-export-template-preview-skeleton::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.4) 50%,
    transparent 100%
  );
  animation: skeleton-shimmer 1.5s ease-in-out infinite;
}

@keyframes skeleton-shimmer {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}

.ppt-export-template-preview-skeleton-content {
  position: relative;
  width: 70%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
}

.skeleton-header {
  height: 10px;
  width: 60%;
  border-radius: 999px;
  background: linear-gradient(90deg, #e2e8f0 0%, #cbd5e1 50%, #e2e8f0 100%);
  background-size: 200% 100%;
  animation: skeleton-pulse 1.5s ease-in-out infinite;
}

.skeleton-body {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.skeleton-line {
  height: 5px;
  border-radius: 999px;
  background: linear-gradient(90deg, #e2e8f0 0%, #cbd5e1 50%, #e2e8f0 100%);
  background-size: 200% 100%;
  animation: skeleton-pulse 1.5s ease-in-out infinite;
}

.skeleton-line.short {
  width: 75%;
}

@keyframes skeleton-pulse {
  0%,
  100% {
    opacity: 0.6;
    background-position: 200% 0;
  }
  50% {
    opacity: 1;
    background-position: 0 0;
  }
}

.ppt-export-template-preview-skeleton-badge {
  position: absolute;
  left: 8px;
  bottom: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.72);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  gap: 4px;
}

.skeleton-spinner {
  width: 10px;
  height: 10px;
  border: 1.5px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: ppt-export-spin 0.8s linear infinite;
}

.ppt-export-template-preview-layer {
  position: absolute;
  overflow: hidden;
}

.ppt-export-template-preview-layer.is-text {
  padding: 2px 4px;
  white-space: pre-wrap;
  word-break: break-word;
}

.ppt-export-template-preview-layer.is-text-lines {
  padding: 4px 5px;
}

.ppt-export-template-preview-text {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.ppt-export-template-preview-lines {
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: 100%;
  height: 100%;
}

.ppt-export-template-preview-line {
  display: block;
  height: 3px;
  border-radius: 999px;
  background: rgba(71, 85, 105, 0.28);
}

.ppt-export-template-preview-layer.is-media {
  display: flex;
  align-items: center;
  justify-content: center;
}

.ppt-export-template-preview-media-label {
  font-size: 9px;
  font-weight: 700;
  color: #64748b;
  letter-spacing: 0.04em;
}

.ppt-export-template-preview-fallback {
  position: absolute;
  inset: 12px;
  display: -webkit-box;
  overflow: hidden;
  color: #0f172a;
  font-size: 10px;
  font-weight: 600;
  line-height: 1.35;
  white-space: pre-wrap;
  word-break: break-word;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 5;
}

.ppt-export-template-preview-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: #64748b;
}

.ppt-export-template-preview-icon {
  font-size: 24px;
  opacity: 0.6;
}

.ppt-export-template-preview-count {
  font-size: 11px;
  font-weight: 500;
  opacity: 0.8;
}

.ppt-export-template-preview-page-count {
  position: absolute;
  left: 8px;
  bottom: 8px;
  padding: 2px 6px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.72);
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  line-height: 1.4;
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.ppt-export-template-check-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--theme-accent);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  opacity: 0;
  transform: scale(0.8);
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.ppt-export-template-card.active .ppt-export-template-check-badge {
  opacity: 1;
  transform: scale(1);
}

.ppt-export-template-card-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px;
}

.ppt-export-template-card-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--theme-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ppt-export-template-card-meta {
  font-size: 11px;
  color: var(--theme-text-tertiary);
}

/* ==================== 右侧面板：内容预览 ==================== */
.ppt-export-right-panel {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow: hidden;
}

/* ==================== 页面详细预览 ==================== */
.ppt-export-preview-detail {
  flex: 1;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius-lg);
  background: var(--theme-bg);
  overflow: hidden;
  padding: 14px;
}

.ppt-export-preview-actions {
  display: flex;
  gap: 8px;
}

.ppt-export-slide-detail-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
}

.ppt-export-slide-detail-stage {
  flex-shrink: 0;
}

.ppt-export-slide-detail-canvas {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border-radius: calc(var(--theme-radius-lg) - 2px);
  background:
    radial-gradient(circle at top left, rgba(255, 255, 255, 0.65), transparent 42%),
    linear-gradient(135deg, #edf2f7 0%, #dbe4ee 100%);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.6),
    0 12px 28px rgba(15, 23, 42, 0.08);
}

.ppt-export-slide-detail-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.ppt-export-slide-detail-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 16 / 9;
  border: 1px dashed color-mix(in srgb, var(--theme-border) 70%, transparent);
  border-radius: calc(var(--theme-radius-lg) - 2px);
  background: color-mix(in srgb, var(--theme-bg-hover) 60%, transparent);
  color: var(--theme-text-tertiary);
  font-size: 13px;
  font-weight: 500;
}

.ppt-export-slide-detail-header {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ppt-export-slide-detail-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ppt-export-slide-detail-index {
  font-size: 15px;
  font-weight: 600;
  color: var(--theme-text);
}

.ppt-export-slide-detail-type {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
}

.ppt-export-slide-detail-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--theme-text);
  line-height: 1.4;
}

.ppt-export-slide-detail-summary {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  border-radius: var(--theme-radius);
  background: color-mix(in srgb, var(--theme-bg-hover) 60%, transparent);
}

.ppt-export-slide-detail-summary p {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--theme-text-secondary);
}

.ppt-export-slide-detail-status {
  padding: 8px 12px;
  border-radius: var(--theme-radius);
  background: color-mix(in srgb, var(--theme-border) 60%, transparent);
  font-size: 12px;
  color: var(--theme-text-secondary);
  text-align: center;
  transition: background-color 0.2s ease, color 0.2s ease;
}

.ppt-export-slide-detail-status.selected {
  background: color-mix(in srgb, var(--theme-accent) 15%, transparent);
  color: var(--theme-accent);
  font-weight: 500;
}

.ppt-export-slide-detail-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--theme-text-tertiary);
}

/* ==================== 缩略图面板 ==================== */
.ppt-export-thumbnails-panel {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius-lg);
  background: var(--theme-bg);
  overflow: hidden;
  padding: 14px;
}

.ppt-export-thumbnails-count {
  font-size: 12px;
  color: var(--theme-text-tertiary);
}

.ppt-export-thumbnails-scroll {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 4px 0 8px;
}

.ppt-export-thumbnails-scroll::-webkit-scrollbar {
  height: 6px;
}

.ppt-export-thumbnails-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.ppt-export-thumbnails-scroll::-webkit-scrollbar-thumb {
  background: var(--theme-border);
  border-radius: 3px;
}

.ppt-export-thumbnail-item {
  position: relative;
  flex-shrink: 0;
  width: 100px;
  cursor: pointer;
  border: 2px solid var(--theme-border);
  border-radius: var(--theme-radius);
  background: var(--theme-bg);
  overflow: hidden;
  transition:
    border-color 0.15s ease,
    transform 0.15s ease,
    box-shadow 0.15s ease;
}

.ppt-export-thumbnail-item:hover {
  border-color: color-mix(in srgb, var(--theme-accent) 40%, var(--theme-border));
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.ppt-export-thumbnail-item.active {
  border-color: var(--theme-accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--theme-accent) 20%, transparent);
}

.ppt-export-thumbnail-item.selected {
  background: color-mix(in srgb, var(--theme-accent) 5%, var(--theme-bg));
}

.ppt-export-thumbnail-preview {
  position: relative;
  aspect-ratio: 16 / 9;
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.ppt-export-thumbnail-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.ppt-export-thumbnail-number {
  font-size: 18px;
  font-weight: 700;
  color: #94a3b8;
}

.ppt-export-thumbnail-type {
  position: absolute;
  top: 4px;
  left: 4px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.ppt-export-thumbnail-info {
  padding: 6px 8px;
}

.ppt-export-thumbnail-title {
  display: block;
  font-size: 11px;
  color: var(--theme-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ppt-export-thumbnail-check {
  position: absolute;
  bottom: 4px;
  right: 4px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--theme-accent);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
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

/* ==================== 复选框样式 ==================== */
.ppt-export-slide-checkbox {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.ppt-export-slide-checkbox input[type='checkbox'] {
  width: 16px;
  height: 16px;
  accent-color: var(--theme-accent);
  cursor: pointer;
}

/* ==================== 按钮样式 ==================== */
.ppt-export-select-all {
  padding: 4px 10px;
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

.ppt-export-select-all:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

/* ==================== 底部操作栏 ==================== */
.ppt-export-dialog-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 22px 18px;
  border-top: 1px solid var(--theme-border);
  background: var(--theme-bg-secondary);
  flex-shrink: 0;
}

.ppt-export-status {
  font-size: 13px;
  color: var(--theme-text-secondary);
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
  padding: 8px 16px;
  border-radius: var(--theme-radius);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease,
    opacity 0.2s ease;
}

.ppt-export-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.ppt-export-btn-cancel {
  border: 1px solid var(--theme-border);
  background: var(--theme-bg);
  color: var(--theme-text-secondary);
}

.ppt-export-btn-cancel:hover:not(:disabled) {
  border-color: var(--theme-text-tertiary);
  color: var(--theme-text);
}

.ppt-export-btn-export {
  border: none;
  background: var(--theme-accent);
  color: white;
}

.ppt-export-btn-export:hover:not(:disabled) {
  background: color-mix(in srgb, var(--theme-accent) 85%, black);
}

.ppt-export-btn-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: ppt-export-spin 0.6s linear infinite;
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

.fade-enter-active .ppt-export-dialog,
.fade-leave-active .ppt-export-dialog {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.fade-enter-from .ppt-export-dialog,
.fade-leave-to .ppt-export-dialog {
  transform: scale(0.96);
  opacity: 0;
}
</style>
