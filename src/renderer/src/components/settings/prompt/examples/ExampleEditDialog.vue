<script setup lang="ts">
import { reactive, watch } from 'vue'
import type { EnhancedFewShotExample, FewShotToolCall } from '@shared/types/prompt'

/** Props */
interface Props {
  visible: boolean
  example?: EnhancedFewShotExample | null
}

const props = withDefaults(defineProps<Props>(), {
  example: null
})

/** Emits */
interface Emits {
  (e: 'update:visible', value: boolean): void
  (e: 'save', example: Omit<EnhancedFewShotExample, 'id' | 'createdAt' | 'usageCount'>): void
  (e: 'cancel'): void
}

const emit = defineEmits<Emits>()

/** 表单数据 */
interface FormData {
  userQuery: string
  thought: string
  toolCalls: string
  finalAnswer: string
  qualityScore: number
}

const formData = reactive<FormData>({
  userQuery: '',
  thought: '',
  toolCalls: '',
  finalAnswer: '',
  qualityScore: 0.8
})

/** 验证错误 */
interface ValidationErrors {
  userQuery?: string
  finalAnswer?: string
  qualityScore?: string
  toolCalls?: string
}

const errors = reactive<ValidationErrors>({})

/** 初始化表单数据 */
function initFormData(): void {
  if (props.example) {
    formData.userQuery = props.example.userQuery || ''
    formData.thought = props.example.thought || ''
    formData.toolCalls = props.example.toolCalls
      ? JSON.stringify(props.example.toolCalls, null, 2)
      : ''
    formData.finalAnswer = props.example.finalAnswer || ''
    formData.qualityScore = props.example.qualityScore ?? 0.8
  } else {
    formData.userQuery = ''
    formData.thought = ''
    formData.toolCalls = ''
    formData.finalAnswer = ''
    formData.qualityScore = 0.8
  }
  clearErrors()
}

/** 清除验证错误 */
function clearErrors(): void {
  errors.userQuery = undefined
  errors.finalAnswer = undefined
  errors.qualityScore = undefined
  errors.toolCalls = undefined
}

/** 验证表单 */
function validateForm(): boolean {
  clearErrors()
  let isValid = true

  // 验证 userQuery
  if (!formData.userQuery.trim()) {
    errors.userQuery = '用户查询不能为空'
    isValid = false
  } else if (formData.userQuery.length > 2000) {
    errors.userQuery = '用户查询不能超过 2000 字符'
    isValid = false
  }

  // 验证 finalAnswer
  if (!formData.finalAnswer.trim()) {
    errors.finalAnswer = '最终答案不能为空'
    isValid = false
  } else if (formData.finalAnswer.length > 5000) {
    errors.finalAnswer = '最终答案不能超过 5000 字符'
    isValid = false
  }

  // 验证 qualityScore
  if (formData.qualityScore < 0 || formData.qualityScore > 1) {
    errors.qualityScore = '质量分数必须在 0-1 之间'
    isValid = false
  }

  // 验证 toolCalls JSON 格式
  if (formData.toolCalls.trim()) {
    try {
      JSON.parse(formData.toolCalls)
    } catch {
      errors.toolCalls = '工具调用 JSON 格式不正确'
      isValid = false
    }
  }

  return isValid
}

/** 解析工具调用 */
function parseToolCalls(): FewShotToolCall[] | undefined {
  if (!formData.toolCalls.trim()) {
    return undefined
  }
  try {
    return JSON.parse(formData.toolCalls) as FewShotToolCall[]
  } catch {
    return undefined
  }
}

/** 保存 */
function handleSave(): void {
  if (!validateForm()) {
    return
  }

  const toolCalls = parseToolCalls()
  const toolsUsed = toolCalls ? toolCalls.map((tc) => tc.name).filter(Boolean) : []

  emit('save', {
    userQuery: formData.userQuery.trim(),
    thought: formData.thought.trim(),
    toolCalls,
    finalAnswer: formData.finalAnswer.trim(),
    qualityScore: formData.qualityScore,
    source: 'dynamic',
    toolsUsed
  })
}

/** 取消 */
function handleCancel(): void {
  emit('cancel')
  emit('update:visible', false)
}

/** 关闭对话框 */
function handleClose(): void {
  handleCancel()
}

/** 格式化 JSON */
function formatJSON(): void {
  if (formData.toolCalls.trim()) {
    try {
      const parsed = JSON.parse(formData.toolCalls)
      formData.toolCalls = JSON.stringify(parsed, null, 2)
      errors.toolCalls = undefined
    } catch {
      errors.toolCalls = '工具调用 JSON 格式不正确'
    }
  }
}

/** 插入示例工具调用 */
function insertExampleToolCall(): void {
  const example: FewShotToolCall[] = [
    {
      name: 'knowledge__search',
      arguments: {
        query: '搜索关键词'
      },
      result: '搜索结果...'
    }
  ]
  formData.toolCalls = JSON.stringify(example, null, 2)
  errors.toolCalls = undefined
}

/** 监听 visible 变化，初始化表单 */
watch(
  () => props.visible,
  (newValue) => {
    if (newValue) {
      initFormData()
    }
  }
)

/** 监听 example 变化 */
watch(
  () => props.example,
  () => {
    if (props.visible) {
      initFormData()
    }
  }
)
</script>

<template>
  <Transition name="sm-prompt-dialog">
    <div
      v-if="visible"
      class="sm-modal__overlay sm-prompt-example-dialog__overlay"
      @click.self="handleClose"
    >
      <div class="sm-modal__surface sm-prompt-example-dialog__surface" @click.stop>
        <div class="sm-pane-header sm-prompt-example-dialog__header">
          <h3 class="sm-prompt-example-dialog__title">编辑示例</h3>
          <button class="sm-icon-button" @click="handleClose">
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12 4L4 12M4 4L12 12"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              />
            </svg>
          </button>
        </div>

        <div class="sm-prompt-example-dialog__body">
          <div class="sm-prompt-example-dialog__field" :class="{ 'is-error': errors.userQuery }">
            <label class="sm-prompt-example-dialog__label">
              用户查询 <span class="sm-prompt-example-dialog__required">*</span>
            </label>
            <textarea
              v-model="formData.userQuery"
              class="sm-textarea"
              rows="3"
              placeholder="输入用户的问题或查询..."
              maxlength="2000"
            ></textarea>
            <div class="sm-prompt-example-dialog__footer">
              <span v-if="errors.userQuery" class="sm-prompt-example-dialog__error">{{
                errors.userQuery
              }}</span>
              <span v-else class="sm-prompt-example-dialog__count"
                >{{ formData.userQuery.length }} / 2000</span
              >
            </div>
          </div>

          <div class="sm-prompt-example-dialog__field">
            <label class="sm-prompt-example-dialog__label">思考过程</label>
            <textarea
              v-model="formData.thought"
              class="sm-textarea"
              rows="4"
              placeholder="输入 AI 的思考过程（可选）..."
            ></textarea>
            <p class="sm-prompt-example-dialog__help">描述 AI 如何分析问题并决定使用哪些工具</p>
          </div>

          <div class="sm-prompt-example-dialog__field" :class="{ 'is-error': errors.toolCalls }">
            <div class="sm-prompt-example-dialog__label-row">
              <label class="sm-prompt-example-dialog__label">工具调用</label>
              <div class="sm-prompt-example-dialog__inline-actions">
                <button
                  class="sm-prompt-example-dialog__text-button"
                  @click="insertExampleToolCall"
                >
                  插入示例
                </button>
                <button class="sm-prompt-example-dialog__text-button" @click="formatJSON">
                  格式化
                </button>
              </div>
            </div>
            <textarea
              v-model="formData.toolCalls"
              class="sm-textarea sm-prompt-example-dialog__code"
              rows="8"
              placeholder='输入工具调用 JSON 数组，例如：[{"name":"tool_name","arguments":{},"result":"..."}]'
            ></textarea>
            <div class="sm-prompt-example-dialog__footer">
              <span v-if="errors.toolCalls" class="sm-prompt-example-dialog__error">{{
                errors.toolCalls
              }}</span>
              <p v-else class="sm-prompt-example-dialog__help">
                以 JSON 数组格式输入工具调用记录，包含工具名称、参数和执行结果
              </p>
            </div>
          </div>

          <div class="sm-prompt-example-dialog__field" :class="{ 'is-error': errors.finalAnswer }">
            <label class="sm-prompt-example-dialog__label">
              最终答案 <span class="sm-prompt-example-dialog__required">*</span>
            </label>
            <textarea
              v-model="formData.finalAnswer"
              class="sm-textarea"
              rows="5"
              placeholder="输入 AI 给用户的最终回答..."
              maxlength="5000"
            ></textarea>
            <div class="sm-prompt-example-dialog__footer">
              <span v-if="errors.finalAnswer" class="sm-prompt-example-dialog__error">{{
                errors.finalAnswer
              }}</span>
              <span v-else class="sm-prompt-example-dialog__count"
                >{{ formData.finalAnswer.length }} / 5000</span
              >
            </div>
          </div>

          <div class="sm-prompt-example-dialog__field" :class="{ 'is-error': errors.qualityScore }">
            <label class="sm-prompt-example-dialog__label">
              质量分数: {{ formData.qualityScore.toFixed(2) }}
            </label>
            <input
              v-model.number="formData.qualityScore"
              type="range"
              min="0"
              max="1"
              step="0.05"
              class="sm-prompt-example-dialog__range"
            />
            <div class="sm-prompt-example-dialog__range-labels">
              <span>0.0</span>
              <span>1.0</span>
            </div>
            <p v-if="errors.qualityScore" class="sm-prompt-example-dialog__error">
              {{ errors.qualityScore }}
            </p>
            <p v-else class="sm-prompt-example-dialog__help">示例的质量评分，用于筛选和排序</p>
          </div>
        </div>

        <div class="sm-settings-actions sm-prompt-example-dialog__actions">
          <button class="sm-button sm-button--secondary" @click="handleCancel">取消</button>
          <button class="sm-button sm-button--primary" @click="handleSave">保存</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.sm-prompt-example-dialog__overlay {
  z-index: 1000;
}

.sm-prompt-example-dialog__surface {
  width: min(600px, 100%);
  max-height: min(90vh, 780px);
  display: flex;
  flex-direction: column;
}

.sm-prompt-example-dialog__header {
  flex-shrink: 0;
}

.sm-prompt-example-dialog__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
}

.sm-prompt-example-dialog__body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-4);
}

.sm-prompt-example-dialog__field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sm-prompt-example-dialog__field.is-error :deep(textarea) {
  border-color: rgba(199, 120, 120, 0.4);
}

.sm-prompt-example-dialog__label,
.sm-prompt-example-dialog__label-row {
  font-size: 13px;
  font-weight: 500;
  color: var(--sm-color-text-primary);
}

.sm-prompt-example-dialog__label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sm-space-3);
}

.sm-prompt-example-dialog__required,
.sm-prompt-example-dialog__error {
  color: #c77878;
}

.sm-prompt-example-dialog__code {
  font-family: var(--sm-font-mono);
  font-size: 12px;
  line-height: 1.6;
}

.sm-prompt-example-dialog__range {
  width: 100%;
  accent-color: var(--sm-color-accent);
}

.sm-prompt-example-dialog__range-labels,
.sm-prompt-example-dialog__footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--sm-space-3);
}

.sm-prompt-example-dialog__count,
.sm-prompt-example-dialog__help {
  font-size: 11px;
  line-height: 1.5;
  color: var(--sm-color-text-secondary);
}

.sm-prompt-example-dialog__inline-actions {
  display: flex;
  gap: 8px;
}

.sm-prompt-example-dialog__text-button {
  min-height: 24px;
  padding: 4px 8px;
  border: 1px solid var(--sm-color-border-accent);
  border-radius: var(--sm-radius-sm);
  background: transparent;
  color: var(--sm-color-accent-hover);
  font-size: 11px;
  cursor: pointer;
  transition:
    background-color var(--sm-transition-fast),
    color var(--sm-transition-fast);
}

.sm-prompt-example-dialog__text-button:hover {
  background: rgba(142, 149, 217, 0.14);
  color: var(--sm-color-text-primary);
}

.sm-prompt-example-dialog__actions {
  padding: 16px 20px;
  border-top: 1px solid var(--sm-color-border-subtle);
}

.sm-prompt-dialog-enter-active,
.sm-prompt-dialog-leave-active {
  transition: opacity 0.2s ease;
}

.sm-prompt-dialog-enter-from,
.sm-prompt-dialog-leave-to {
  opacity: 0;
}

.sm-prompt-dialog-enter-active .sm-prompt-example-dialog__surface,
.sm-prompt-dialog-leave-active .sm-prompt-example-dialog__surface {
  transition:
    transform 0.2s ease,
    opacity 0.2s ease;
}

.sm-prompt-dialog-enter-from .sm-prompt-example-dialog__surface,
.sm-prompt-dialog-leave-to .sm-prompt-example-dialog__surface {
  transform: scale(0.96);
  opacity: 0;
}
</style>
