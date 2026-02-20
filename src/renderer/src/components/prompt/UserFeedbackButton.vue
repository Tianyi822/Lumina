<script setup lang="ts">
import { ref, computed } from 'vue'

// ==================== Props ====================
const props = defineProps<{
  messageId: string
  sessionId: string
  promptVersion: string
  disabled?: boolean
  content?: string
}>()

// ==================== Emits ====================
const emit = defineEmits<{
  (e: 'submitted', type: 'thumbs_up' | 'thumbs_down'): void
  (e: 'error', message: string): void
}>()

// ==================== State ====================
const showFeedbackForm = ref(false)
const feedbackType = ref<'thumbs_up' | 'thumbs_down' | null>(null)
const feedbackReason = ref('')
const isAnonymous = ref(false)
const submitting = ref(false)
const submitted = ref(false)
const copied = ref(false)

// 反馈原因选项
const reasonOptions = [
  { value: 'accurate', label: '回答准确', for: 'thumbs_up' },
  { value: 'helpful', label: '有帮助', for: 'thumbs_up' },
  { value: 'clear', label: '清晰易懂', for: 'thumbs_up' },
  { value: 'fast', label: '响应快速', for: 'thumbs_up' },
  { value: 'incorrect', label: '回答错误', for: 'thumbs_down' },
  { value: 'unclear', label: '难以理解', for: 'thumbs_down' },
  { value: 'incomplete', label: '信息不完整', for: 'thumbs_down' },
  { value: 'slow', label: '响应太慢', for: 'thumbs_down' },
  { value: 'other', label: '其他', for: 'both' }
]

// ==================== Computed ====================
const filteredReasons = computed(() => {
  if (!feedbackType.value) return []
  return reasonOptions.filter(
    (r) => r.for === feedbackType.value || r.for === 'both'
  )
})

// ==================== Methods ====================
function openFeedbackForm(type: 'thumbs_up' | 'thumbs_down'): void {
  if (props.disabled || submitted.value) return
  feedbackType.value = type
  feedbackReason.value = ''
  showFeedbackForm.value = true
}

function closeForm(): void {
  showFeedbackForm.value = false
  feedbackType.value = null
  feedbackReason.value = ''
}

async function submitFeedback(): Promise<void> {
  if (!feedbackType.value) return

  submitting.value = true
  try {
    const result = await window.api.feedback.submitFeedback({
      messageId: props.messageId,
      sessionId: props.sessionId,
      promptVersion: props.promptVersion,
      type: feedbackType.value,
      reason: feedbackReason.value || undefined,
      isAnonymous: isAnonymous.value
    })

    if (result.success) {
      submitted.value = true
      showFeedbackForm.value = false
      emit('submitted', feedbackType.value)
    } else {
      emit('error', result.error || '提交失败')
    }
  } catch (error) {
    emit('error', '提交反馈失败')
    console.error(error)
  } finally {
    submitting.value = false
  }
}

/**
 * 复制消息内容到剪贴板
 */
async function copyMessage(): Promise<void> {
  if (!props.content) return

  try {
    await navigator.clipboard.writeText(props.content)
    copied.value = true
    // 2秒后恢复状态
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch (error) {
    console.error('复制失败:', error)
    // 降级方案：使用传统的复制方法
    const textarea = document.createElement('textarea')
    textarea.value = props.content
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    document.body.appendChild(textarea)
    textarea.select()
    try {
      document.execCommand('copy')
      copied.value = true
      setTimeout(() => {
        copied.value = false
      }, 2000)
    } catch (err) {
      console.error('复制失败:', err)
    }
    document.body.removeChild(textarea)
  }
}
</script>

<template>
  <div class="feedback-button">
    <!-- 操作按钮组 -->
    <div v-if="!submitted" class="feedback-actions">
      <!-- 复制按钮 -->
      <button
        v-if="content"
        class="feedback-btn"
        :class="{ active: copied }"
        :disabled="disabled"
        :title="copied ? '已复制' : '复制内容'"
        @click="copyMessage"
      >
        <svg v-if="!copied" viewBox="0 0 24 24" width="14" height="14">
          <path
            fill="currentColor"
            d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"
          />
        </svg>
        <svg v-else viewBox="0 0 24 24" width="14" height="14">
          <path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
        </svg>
      </button>
      <button
        class="feedback-btn"
        :class="{ active: feedbackType === 'thumbs_up' }"
        :disabled="disabled"
        title="有帮助"
        @click="openFeedbackForm('thumbs_up')"
      >
        <svg viewBox="0 0 24 24" width="14" height="14">
          <path
            fill="currentColor"
            d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"
          />
        </svg>
      </button>
      <button
        class="feedback-btn"
        :class="{ active: feedbackType === 'thumbs_down' }"
        :disabled="disabled"
        title="无帮助"
        @click="openFeedbackForm('thumbs_down')"
      >
        <svg viewBox="0 0 24 24" width="14" height="14">
          <path
            fill="currentColor"
            d="M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v2c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2zm4 0v12h4V3h-4z"
          />
        </svg>
      </button>
    </div>

    <!-- 已提交状态 -->
    <div v-else class="feedback-submitted">
      <svg viewBox="0 0 24 24" width="14" height="14">
        <path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
      </svg>
      <span>已反馈</span>
    </div>

    <!-- 反馈表单弹窗 -->
    <div v-if="showFeedbackForm" class="feedback-modal" @click="closeForm">
      <div class="feedback-form" @click.stop>
        <div class="form-header">
          <h4>{{ feedbackType === 'thumbs_up' ? '👍 点赞' : '👎 点踩' }}</h4>
          <button class="close-btn" @click="closeForm">×</button>
        </div>

        <div class="form-body">
          <p class="form-hint">请选择反馈原因（可选）：</p>
          <div class="reason-options">
            <label
              v-for="reason in filteredReasons"
              :key="reason.value"
              class="reason-option"
            >
              <input v-model="feedbackReason" type="radio" :value="reason.value" />
              <span>{{ reason.label }}</span>
            </label>
          </div>

          <label class="anonymous-option">
            <input v-model="isAnonymous" type="checkbox" />
            <span>匿名反馈</span>
          </label>
        </div>

        <div class="form-footer">
          <button class="btn btn-sm" @click="closeForm">取消</button>
          <button
            class="btn btn-sm btn-primary"
            :disabled="submitting"
            @click="submitFeedback"
          >
            {{ submitting ? '提交中...' : '提交' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.feedback-button {
  display: inline-flex;
  align-items: center;
}

.feedback-actions {
  display: flex;
  gap: 4px;
}

.feedback-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 21px;
  height: 21px;
  padding: 0;
  background: transparent;
  border: 1px solid var(--theme-border);
  border-radius: 4px;
  color: var(--theme-text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.feedback-btn:hover:not(:disabled) {
  background-color: var(--theme-bg-hover);
  border-color: var(--theme-text-secondary);
  color: var(--theme-text);
}

.feedback-btn.active {
  background-color: var(--theme-accent);
  border-color: var(--theme-accent);
  color: var(--theme-bg);
}

.feedback-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.feedback-submitted {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--theme-success);
}

/* 反馈表单弹窗 */
.feedback-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.feedback-form {
  background-color: var(--theme-bg);
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius);
  width: 320px;
  overflow: hidden;
}

.form-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--theme-border);
}

.form-header h4 {
  margin: 0;
  font-size: 14px;
  color: var(--theme-text);
}

.close-btn {
  background: none;
  border: none;
  color: var(--theme-text-secondary);
  font-size: 20px;
  cursor: pointer;
  padding: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  color: var(--theme-text);
}

.form-body {
  padding: 16px;
}

.form-hint {
  font-size: 13px;
  color: var(--theme-text-secondary);
  margin: 0 0 12px 0;
}

.reason-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.reason-option {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--theme-text);
  cursor: pointer;
}

.reason-option input[type='radio'] {
  margin: 0;
}

.anonymous-option {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--theme-text-secondary);
}

.anonymous-option input[type='checkbox'] {
  margin: 0;
}

.form-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--theme-border);
  background-color: var(--theme-bg-secondary);
}

.btn-sm {
  padding: 6px 12px;
  font-size: 12px;
}

.btn-primary {
  background-color: var(--theme-accent);
  border-color: var(--theme-accent);
  color: var(--theme-bg);
}
</style>
