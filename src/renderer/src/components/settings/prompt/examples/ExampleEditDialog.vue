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
  source: 'static' | 'dynamic'
}

const formData = reactive<FormData>({
  userQuery: '',
  thought: '',
  toolCalls: '',
  finalAnswer: '',
  qualityScore: 0.8,
  source: 'dynamic'
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
    formData.source = props.example.source || 'dynamic'
  } else {
    formData.userQuery = ''
    formData.thought = ''
    formData.toolCalls = ''
    formData.finalAnswer = ''
    formData.qualityScore = 0.8
    formData.source = 'dynamic'
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
    source: formData.source,
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
  <Transition name="pe-fade">
    <div v-if="visible" class="pe-dialog-overlay" @click.self="handleClose">
      <div class="pe-dialog" @click.stop>
        <!-- 头部 -->
        <div class="pe-dialog-header">
          <h3 class="pe-dialog-title">编辑示例</h3>
          <button class="pe-dialog-close" @click="handleClose">
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

        <!-- 内容区 -->
        <div class="pe-dialog-body">
          <!-- 用户查询 -->
          <div class="pe-form-group" :class="{ 'pe-has-error': errors.userQuery }">
            <label class="pe-form-label"> 用户查询 <span class="pe-required">*</span> </label>
            <textarea
              v-model="formData.userQuery"
              class="pe-textarea"
              rows="3"
              placeholder="输入用户的问题或查询..."
              maxlength="2000"
            ></textarea>
            <div class="pe-form-footer">
              <span v-if="errors.userQuery" class="pe-error-text">{{ errors.userQuery }}</span>
              <span v-else class="pe-char-count">{{ formData.userQuery.length }} / 2000</span>
            </div>
          </div>

          <!-- 思考过程 -->
          <div class="pe-form-group">
            <label class="pe-form-label">思考过程</label>
            <textarea
              v-model="formData.thought"
              class="pe-textarea"
              rows="4"
              placeholder="输入 AI 的思考过程（可选）..."
            ></textarea>
            <p class="pe-help-text">描述 AI 如何分析问题并决定使用哪些工具</p>
          </div>

          <!-- 工具调用 -->
          <div class="pe-form-group" :class="{ 'pe-has-error': errors.toolCalls }">
            <div class="pe-form-label-row">
              <label class="pe-form-label">工具调用</label>
              <div class="pe-form-actions-inline">
                <button class="pe-text-btn" @click="insertExampleToolCall">插入示例</button>
                <button class="pe-text-btn" @click="formatJSON">格式化</button>
              </div>
            </div>
            <textarea
              v-model="formData.toolCalls"
              class="pe-textarea pe-code-editor"
              rows="8"
              placeholder='输入工具调用 JSON 数组，例如：[{"name":"tool_name","arguments":{},"result":"..."}]'
            ></textarea>
            <div class="pe-form-footer">
              <span v-if="errors.toolCalls" class="pe-error-text">{{ errors.toolCalls }}</span>
              <p v-else class="pe-help-text">
                以 JSON 数组格式输入工具调用记录，包含工具名称、参数和执行结果
              </p>
            </div>
          </div>

          <!-- 最终答案 -->
          <div class="pe-form-group" :class="{ 'pe-has-error': errors.finalAnswer }">
            <label class="pe-form-label"> 最终答案 <span class="pe-required">*</span> </label>
            <textarea
              v-model="formData.finalAnswer"
              class="pe-textarea"
              rows="5"
              placeholder="输入 AI 给用户的最终回答..."
              maxlength="5000"
            ></textarea>
            <div class="pe-form-footer">
              <span v-if="errors.finalAnswer" class="pe-error-text">{{ errors.finalAnswer }}</span>
              <span v-else class="pe-char-count">{{ formData.finalAnswer.length }} / 5000</span>
            </div>
          </div>

          <!-- 质量分数和来源 -->
          <div class="pe-form-row">
            <!-- 质量分数 -->
            <div
              class="pe-form-group pe-form-group-half"
              :class="{ 'pe-has-error': errors.qualityScore }"
            >
              <label class="pe-form-label">
                质量分数: {{ formData.qualityScore.toFixed(2) }}
              </label>
              <input
                v-model.number="formData.qualityScore"
                type="range"
                min="0"
                max="1"
                step="0.05"
                class="pe-slider"
              />
              <div class="pe-slider-labels">
                <span>0.0</span>
                <span>1.0</span>
              </div>
              <p v-if="errors.qualityScore" class="pe-error-text">{{ errors.qualityScore }}</p>
              <p v-else class="pe-help-text">示例的质量评分，用于筛选和排序</p>
            </div>

            <!-- 来源 -->
            <div class="pe-form-group pe-form-group-half">
              <label class="pe-form-label">来源</label>
              <div class="pe-source-preview">
                <span
                  class="pe-source-badge"
                  :class="{
                    'pe-source-static': formData.source === 'static',
                    'pe-source-dynamic': formData.source === 'dynamic'
                  }"
                >
                  {{ formData.source === 'static' ? '静态示例' : '动态示例' }}
                </span>
              </div>
              <p class="pe-help-text">
                {{
                  formData.source === 'static'
                    ? '系统预置示例，仅支持维护已有内容'
                    : '来自历史对话提取或导入的示例'
                }}
              </p>
            </div>
          </div>
        </div>

        <!-- 底部按钮 -->
        <div class="pe-dialog-footer">
          <button class="pe-btn pe-btn-secondary" @click="handleCancel">取消</button>
          <button class="pe-btn pe-btn-primary" @click="handleSave">保存</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* 对话框遮罩 */
.pe-dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

/* 对话框容器 */
.pe-dialog {
  background: var(--theme-bg);
  border: 1px solid var(--theme-border);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  width: 100%;
  max-width: 600px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

/* 头部 */
.pe-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--theme-border);
}

.pe-dialog-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--theme-text);
  margin: 0;
}

.pe-dialog-close {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--theme-text-secondary);
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.15s ease;
}

.pe-dialog-close:hover {
  background: var(--theme-bg-secondary);
  color: var(--theme-text);
}

/* 内容区 */
.pe-dialog-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

/* 表单组 */
.pe-form-group {
  margin-bottom: 20px;
}

.pe-form-group-half {
  flex: 1;
}

.pe-form-row {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.pe-form-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--theme-text);
  margin-bottom: 8px;
}

.pe-form-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.pe-required {
  color: var(--theme-error, #ef4444);
  margin-left: 2px;
}

/* 输入控件 */
.pe-textarea,
.pe-select {
  width: 100%;
  padding: 8px 12px;
  font-size: 13px;
  color: var(--theme-text);
  background: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 4px;
  transition: border-color 0.15s ease;
  box-sizing: border-box;
}

.pe-textarea:focus,
.pe-select:focus {
  outline: none;
  border-color: var(--theme-accent);
}

.pe-textarea {
  font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace;
  line-height: 1.6;
  resize: vertical;
}

.pe-code-editor {
  font-size: 12px;
  line-height: 1.5;
}

.pe-select {
  appearance: none;
  -webkit-appearance: none;
  background: var(--theme-bg-secondary);
  cursor: pointer;
}

.pe-source-preview {
  display: flex;
  align-items: center;
  min-height: 36px;
  padding: 0 12px;
  background: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 4px;
}

.pe-source-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
}

.pe-source-static {
  color: var(--theme-info, #3b82f6);
  background: color-mix(in srgb, var(--theme-info, #3b82f6) 12%, transparent);
}

.pe-source-dynamic {
  color: var(--theme-accent);
  background: color-mix(in srgb, var(--theme-accent) 12%, transparent);
}

/* 滑块 */
.pe-slider {
  width: 100%;
  margin: 8px 0;
  cursor: pointer;
  accent-color: var(--theme-accent);
}

.pe-slider-labels {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--theme-text-secondary);
  margin-top: 4px;
}

/* 表单底部 */
.pe-form-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
}

.pe-char-count {
  font-size: 11px;
  color: var(--theme-text-secondary);
}

/* 错误状态 */
.pe-has-error .pe-textarea,
.pe-has-error .pe-select {
  border-color: var(--theme-error, #ef4444);
}

.pe-error-text {
  font-size: 12px;
  color: var(--theme-error, #ef4444);
}

/* 帮助文本 */
.pe-help-text {
  margin-top: 6px;
  font-size: 11px;
  color: var(--theme-text-secondary);
  line-height: 1.4;
}

/* 内联操作按钮 */
.pe-form-actions-inline {
  display: flex;
  gap: 8px;
  align-items: center;
}

.pe-text-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 24px;
  padding: 4px 8px;
  font-size: 11px;
  background: transparent;
  color: var(--theme-accent);
  border: 1px solid var(--theme-accent);
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.15s ease;
  line-height: 1;
  box-sizing: border-box;
}

.pe-text-btn:hover {
  background: var(--theme-accent);
  color: white;
}

/* 底部按钮区 */
.pe-dialog-footer {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  padding: 16px 20px;
  border-top: 1px solid var(--theme-border);
}

.pe-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 20px;
  font-size: 13px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
  line-height: 1.2;
  box-sizing: border-box;
}

.pe-btn-secondary {
  background: var(--theme-bg-secondary);
  color: var(--theme-text);
  border: 1px solid var(--theme-border);
}

.pe-btn-secondary:hover {
  background: var(--theme-bg-tertiary);
}

.pe-btn-primary {
  background: var(--theme-accent);
  color: white;
  border: none;
}

.pe-btn-primary:hover {
  opacity: 0.9;
}

/* 过渡动画 */
.pe-fade-enter-active,
.pe-fade-leave-active {
  transition: opacity 0.2s ease;
}

.pe-fade-enter-from,
.pe-fade-leave-to {
  opacity: 0;
}

.pe-fade-enter-active .pe-dialog,
.pe-fade-leave-active .pe-dialog {
  transition:
    transform 0.2s ease,
    opacity 0.2s ease;
}

.pe-fade-enter-from .pe-dialog,
.pe-fade-leave-to .pe-dialog {
  transform: scale(0.95);
  opacity: 0;
}
</style>
