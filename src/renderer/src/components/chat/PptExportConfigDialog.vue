<script setup lang="ts">
import { computed, ref, watch, onMounted, nextTick } from 'vue'
import { usePptExport } from '@renderer/composables/usePptExport'
import { useQuanmiaoSDK } from '@renderer/composables/useQuanmiaoSDK'

interface Props {
  /** 是否显示对话框 */
  visible: boolean
  /** 消息内容（提示词/用户请求） */
  content: string
  /** 初始大纲内容 */
  initialOutline?: string
  /** 初始任务 ID */
  initialTaskId?: string
  /** 文件标题（可选） */
  title?: string
}

const props = withDefaults(defineProps<Props>(), {
  title: ''
})

interface Emits {
  (e: 'close'): void
  (e: 'showToast', message: string, type?: 'success' | 'error' | 'info'): void
  (e: 'ppt-created'): void
}

const emit = defineEmits<Emits>()

// ==================== Composables ====================

const {
  isConfigured,
  outlineStatus,
  outlineText,
  taskId,
  appkey,
  code,
  renderingStatus,
  artifactId,
  error: pptError,
  checkConfig,
  generateOutline,
  initiateCreation,
  bindArtifact,
  reset
} = usePptExport()

const {
  loading: sdkLoading,
  error: sdkError,
  loadSDK,
  createPPT,
  destroy: destroySDK
} = useQuanmiaoSDK()

// ==================== 状态定义 ====================

/** PPT 容器 ref */
const pptContainer = ref<HTMLElement | null>(null)

/** 用户编辑的大纲文本 */
const editedOutlineText = ref('')

/** 是否在处理中 */
const isProcessing = computed(() => {
  return (
    outlineStatus.value === 'generating' || sdkLoading.value || renderingStatus.value === 'making'
  )
})

/** 当前对话框阶段 */
const dialogPhase = computed(() => {
  if (!isConfigured.value) return 'unconfigured'
  if (renderingStatus.value !== 'idle') return 'rendering'
  return 'outline'
})

/** 是否显示生成完成状态 */
const isRenderComplete = computed(() => {
  return renderingStatus.value === 'done' && artifactId.value !== null
})

// ==================== 生命周期 ====================

onMounted(async () => {
  await checkConfig()
})

// ==================== 监听器 ====================

watch(
  () => props.visible,
  async (visible) => {
    if (visible) {
      reset()
      destroySDK()
      editedOutlineText.value = ''

      // 对话框打开时检查配置
      await checkConfig()

      if (!isConfigured.value) {
        return
      }

      if (props.initialOutline?.trim() && props.initialTaskId?.trim()) {
        outlineStatus.value = 'done'
        outlineText.value = props.initialOutline
        taskId.value = props.initialTaskId
        editedOutlineText.value = props.initialOutline
        return
      }

      // 如果已配置且大纲状态为空闲，自动开始生成大纲
      if (outlineStatus.value === 'idle' && props.content) {
        await handleGenerateOutline()
      }
    } else {
      // 对话框关闭时清理
      reset()
      destroySDK()
      editedOutlineText.value = ''
    }
  }
)

// ==================== 方法 ====================

/**
 * 生成大纲
 */
async function handleGenerateOutline(): Promise<void> {
  if (!props.content) {
    emit('showToast', '内容不能为空', 'error')
    return
  }

  try {
    await generateOutline(props.content)
    editedOutlineText.value = outlineText.value
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : '生成大纲失败'
    emit('showToast', errorMsg, 'error')
  }
}

/**
 * 重新生成大纲
 */
async function handleRegenerateOutline(): Promise<void> {
  editedOutlineText.value = ''
  await handleGenerateOutline()
}

/**
 * 确认大纲并开始创建 PPT
 */
async function handleConfirmOutline(): Promise<void> {
  // 更新大纲文本为用户编辑后的版本
  outlineText.value = editedOutlineText.value

  // 发起创建
  await initiateCreation()
  if (pptError.value) {
    emit('showToast', pptError.value, 'error')
    return
  }

  if (!appkey.value || !code.value) {
    emit('showToast', '获取创建凭证失败', 'error')
    return
  }

  // 加载 SDK
  try {
    await loadSDK()
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : '加载 SDK 失败'
    emit('showToast', errorMsg, 'error')
    return
  }

  // 等待 DOM 更新后创建 PPT
  await nextTick()

  if (!pptContainer.value) {
    emit('showToast', 'PPT 容器未找到', 'error')
    return
  }

  // 创建 PPT
  createPPT({
    appkey: appkey.value,
    code: code.value,
    container: pptContainer.value,
    content: editedOutlineText.value,
    speaker: props.title,
    onMessage: (message) => {
      // 处理 SDK 消息
      switch (message.type) {
        case 'CHARGING':
          // 获取到 artifactId 后绑定
          if (artifactId.value) {
            void bindArtifact()
          }
          break
        case 'SET_PPT_MAKING_STATUS':
          if (renderingStatus.value === 'done') {
            emit('ppt-created')
          }
          break
        case 'ERROR': {
          const errMsg = typeof message.data === 'string' ? message.data : 'PPT 渲染出错'
          emit('showToast', errMsg, 'error')
          break
        }
      }
    }
  })
}

/**
 * 关闭对话框
 */
function handleClose(): void {
  if (isProcessing.value) {
    emit('showToast', '正在处理中，请稍候...', 'info')
    return
  }
  emit('close')
}

/**
 * 跳转到设置页面
 */
function handleOpenSettings(): void {
  emit('close')
  // 用户需要手动打开设置页面
  emit('showToast', '请在设置中配置阿里云妙笔 AccessKey', 'info')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="visible" class="sm-ppt-dialog-overlay" @click.self="handleClose">
        <div class="sm-ppt-dialog" role="dialog" aria-modal="true" :aria-busy="isProcessing">
          <!-- 头部 -->
          <div class="sm-ppt-dialog__header">
            <h2 class="sm-ppt-dialog__title">生成 PPT</h2>
            <button
              type="button"
              class="sm-ppt-dialog__close"
              :disabled="isProcessing"
              @click="handleClose"
            >
              ✕
            </button>
          </div>

          <!-- 主体内容 -->
          <div class="sm-ppt-dialog__body">
            <!-- 未配置状态 -->
            <div v-if="dialogPhase === 'unconfigured'" class="sm-ppt-dialog__unconfigured">
              <div class="sm-ppt-dialog__icon">⚙️</div>
              <h3 class="sm-ppt-dialog__empty-title">请先配置阿里云妙笔</h3>
              <p class="sm-ppt-dialog__empty-desc">
                您需要先在设置中配置阿里云妙笔的 AccessKey 才能使用 PPT 生成功能
              </p>
              <button
                type="button"
                class="sm-button sm-button--primary"
                @click="handleOpenSettings"
              >
                前往设置
              </button>
            </div>

            <!-- 大纲生成/编辑状态 -->
            <template v-else-if="dialogPhase === 'outline'">
              <!-- 生成中 -->
              <div v-if="outlineStatus === 'generating'" class="sm-ppt-dialog__generating">
                <div class="sm-ppt-dialog__spinner"></div>
                <p class="sm-ppt-dialog__status">正在生成大纲...</p>
                <pre class="sm-ppt-dialog__outline-preview">{{ outlineText }}</pre>
              </div>

              <!-- 生成错误 -->
              <div
                v-else-if="outlineStatus === 'error'"
                class="sm-ppt-dialog__error sm-ppt-dialog__error--block"
              >
                <div class="sm-ppt-dialog__error-icon">⚠️</div>
                <p class="sm-ppt-dialog__error-message">{{ pptError || '生成大纲失败' }}</p>
                <button
                  type="button"
                  class="sm-button sm-button--secondary"
                  @click="handleRegenerateOutline"
                >
                  重试
                </button>
              </div>

              <!-- 生成完成，可编辑 -->
              <div v-else class="sm-ppt-dialog__outline-editor">
                <label class="sm-ppt-dialog__label" for="outline-textarea">
                  PPT 大纲（可编辑）
                </label>
                <textarea
                  id="outline-textarea"
                  v-model="editedOutlineText"
                  class="sm-ppt-dialog__textarea"
                  rows="12"
                  placeholder="大纲内容..."
                ></textarea>
              </div>
            </template>

            <!-- PPT 渲染状态 -->
            <template v-else-if="dialogPhase === 'rendering'">
              <!-- 渲染中 -->
              <div v-if="renderingStatus === 'making'" class="sm-ppt-dialog__rendering">
                <div class="sm-ppt-dialog__spinner"></div>
                <p class="sm-ppt-dialog__status">正在渲染 PPT...</p>
              </div>

              <!-- 渲染完成 -->
              <div v-else-if="isRenderComplete" class="sm-ppt-dialog__render-complete">
                <div class="sm-ppt-dialog__success-icon">✓</div>
                <p class="sm-ppt-dialog__success-message">PPT 生成完成！</p>
              </div>

              <!-- 渲染错误 -->
              <div v-else-if="renderingStatus === 'error'" class="sm-ppt-dialog__error">
                <div class="sm-ppt-dialog__error-icon">⚠️</div>
                <p class="sm-ppt-dialog__error-message">
                  {{ pptError || sdkError || 'PPT 渲染失败' }}
                </p>
              </div>

              <!-- PPT 容器 -->
              <div ref="pptContainer" class="sm-ppt-dialog__ppt-container"></div>
            </template>
          </div>

          <!-- 底部操作栏 -->
          <div class="sm-ppt-dialog__footer">
            <template v-if="dialogPhase === 'outline' && outlineStatus === 'done'">
              <button
                type="button"
                class="sm-button sm-button--secondary"
                :disabled="isProcessing"
                @click="handleRegenerateOutline"
              >
                重新生成
              </button>
              <button
                type="button"
                class="sm-button sm-button--primary"
                :disabled="isProcessing || !editedOutlineText.trim()"
                @click="handleConfirmOutline"
              >
                确认生成
              </button>
            </template>

            <template v-else-if="isRenderComplete">
              <button type="button" class="sm-button sm-button--primary" @click="handleClose">
                完成
              </button>
            </template>

            <template v-else>
              <button
                type="button"
                class="sm-button sm-button--secondary"
                :disabled="isProcessing"
                @click="handleClose"
              >
                取消
              </button>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.sm-ppt-dialog-overlay {
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

.sm-ppt-dialog {
  width: min(800px, calc(100vw - 48px));
  height: min(600px, calc(100vh - 96px - env(safe-area-inset-top, 0px)));
  background: var(--sm-color-surface-3);
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sm-ppt-dialog__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--sm-color-border-subtle);
  flex-shrink: 0;
}

.sm-ppt-dialog__title {
  font-size: 16px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
  margin: 0;
}

.sm-ppt-dialog__close {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--sm-color-text-secondary);
  cursor: pointer;
  border-radius: var(--sm-radius-sm);
  transition: background-color var(--sm-transition-fast);
}

.sm-ppt-dialog__close:hover:not(:disabled) {
  background: var(--sm-color-surface-hover);
}

.sm-ppt-dialog__close:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.sm-ppt-dialog__body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: auto;
  padding: 20px;
}

.sm-ppt-dialog__unconfigured {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  text-align: center;
  height: 100%;
}

.sm-ppt-dialog__icon {
  font-size: 48px;
  opacity: 0.8;
}

.sm-ppt-dialog__empty-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
  margin: 0;
}

.sm-ppt-dialog__empty-desc {
  font-size: 14px;
  color: var(--sm-color-text-secondary);
  max-width: 400px;
  margin: 0;
}

.sm-ppt-dialog__generating {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  height: 100%;
}

.sm-ppt-dialog__spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--sm-color-border-default);
  border-top-color: var(--sm-color-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.sm-ppt-dialog__status {
  font-size: 14px;
  color: var(--sm-color-text-secondary);
  margin: 0;
}

.sm-ppt-dialog__outline-preview {
  font-size: 12px;
  color: var(--sm-color-text-tertiary);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow: auto;
  margin: 0;
  padding: 12px;
  background: var(--sm-color-surface-2);
  border-radius: var(--sm-radius-md);
}

.sm-ppt-dialog__error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px;
  background: rgba(199, 120, 120, 0.08);
  border: 1px solid rgba(199, 120, 120, 0.22);
  border-radius: var(--sm-radius-md);
  color: var(--sm-color-status-danger);
}

.sm-ppt-dialog__error--block {
  height: 100%;
}

.sm-ppt-dialog__error-icon {
  font-size: 32px;
}

.sm-ppt-dialog__error-message {
  font-size: 14px;
  margin: 0;
  text-align: center;
}

.sm-ppt-dialog__outline-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
}

.sm-ppt-dialog__label {
  font-size: 14px;
  font-weight: 500;
  color: var(--sm-color-text-primary);
}

.sm-ppt-dialog__textarea {
  flex: 1;
  min-height: 200px;
  padding: 12px;
  background: var(--sm-color-surface-1);
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-md);
  color: var(--sm-color-text-primary);
  font-size: 14px;
  line-height: 1.6;
  resize: none;
  font-family: inherit;
}

.sm-ppt-dialog__textarea:focus {
  outline: none;
  border-color: var(--sm-color-border-accent);
}

.sm-ppt-dialog__rendering {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  height: 100%;
}

.sm-ppt-dialog__render-complete {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px;
  background: rgba(130, 170, 130, 0.08);
  border: 1px solid rgba(130, 170, 130, 0.22);
  border-radius: var(--sm-radius-md);
  color: var(--sm-color-status-success);
}

.sm-ppt-dialog__success-icon {
  font-size: 48px;
}

.sm-ppt-dialog__success-message {
  font-size: 16px;
  font-weight: 500;
  margin: 0;
}

.sm-ppt-dialog__ppt-container {
  flex: 1;
  min-height: 300px;
  border-radius: var(--sm-radius-md);
  overflow: hidden;
  background: var(--sm-color-surface-1);
}

.sm-ppt-dialog__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--sm-color-border-subtle);
  background: var(--sm-color-surface-2);
  flex-shrink: 0;
}

.sm-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
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
  border: 1px solid transparent;
}

.sm-button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.sm-button--secondary {
  border-color: var(--sm-color-border-default);
  background: var(--sm-color-surface-1);
  color: var(--sm-color-text-secondary);
}

.sm-button--secondary:hover:not(:disabled) {
  border-color: var(--sm-color-border-strong);
  color: var(--sm-color-text-primary);
  background: var(--sm-color-surface-hover);
}

.sm-button--primary {
  border-color: var(--sm-color-border-accent);
  background: rgba(142, 149, 217, 0.12);
  color: var(--sm-color-text-primary);
}

.sm-button--primary:hover:not(:disabled) {
  background: rgba(142, 149, 217, 0.18);
  border-color: rgba(161, 167, 230, 0.6);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--sm-transition-medium);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.fade-enter-active .sm-ppt-dialog,
.fade-leave-active .sm-ppt-dialog {
  transition:
    transform var(--sm-transition-medium),
    opacity var(--sm-transition-medium);
}

.fade-enter-from .sm-ppt-dialog,
.fade-leave-to .sm-ppt-dialog {
  transform: translateY(var(--sm-motion-distance-md));
  opacity: 0;
}
</style>
