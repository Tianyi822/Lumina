<script setup lang="ts">
import { ref, computed } from 'vue'
import MarkdownIt from 'markdown-it'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import { estimateTokenCount, formatTokenCount } from '@renderer/utils/tokenEstimate'
import styles from './PaperChatReasoningPanel.module.css'

// 初始化 markdown-it 实例
const md = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: true,
  typographer: true
})

const props = defineProps<{
  content: string
  isExpanded?: boolean
  reasoningTokens?: number
}>()

const emit = defineEmits<{
  (e: 'toggle'): void
}>()

// 本地展开状态
const localExpanded = ref(props.isExpanded ?? false)

// 计算实际展开状态
const isActuallyExpanded = computed(() => {
  return props.isExpanded !== undefined ? props.isExpanded : localExpanded.value
})

/**
 * 切换展开/折叠状态
 */
function toggle(): void {
  if (props.isExpanded === undefined) {
    localExpanded.value = !localExpanded.value
  }
  emit('toggle')
}

/**
 * 渲染 Markdown 内容
 */
function renderMarkdown(content: string): string {
  if (!content) return ''
  return md.render(content)
}

/**
 * 计算思考内容的 Token 数
 */
const contentTokens = computed(() => {
  return props.reasoningTokens ?? estimateTokenCount(props.content)
})

/**
 * 获取思考内容的 Token 显示文案
 */
const contentTokenLabel = computed(() => {
  if (props.reasoningTokens !== undefined) {
    return formatTokenCount(props.reasoningTokens)
  }

  return `约 ${formatTokenCount(contentTokens.value)}`
})
</script>

<template>
  <div class="reasoning-panel" :class="{ expanded: isActuallyExpanded }">
    <!-- 头部（始终显示） -->
    <div :class="styles['sm-reasoning-panel__header']" @click="toggle">
      <div :class="styles['header-left']">
        <div :class="styles['header-icon']">
          <SvgIcon name="thinking" :size="20" />
        </div>
        <div :class="styles['header-text']">
          <span :class="styles['header-label']">思考过程</span>
          <span :class="styles['header-meta']">{{ contentTokenLabel }}</span>
        </div>
      </div>
      <div :class="styles['header-right']">
        <div class="expand-arrow" :class="{ rotated: isActuallyExpanded }">
          <SvgIcon name="arrow-down" :size="16" />
        </div>
      </div>
    </div>

    <!-- 内容区域（可展开/收起） -->
    <div class="sm-reasoning-panel__content-shell" :class="{ expanded: isActuallyExpanded }">
      <div :class="styles['sm-reasoning-panel__content']">
        <!-- markdown-it 已禁用原生 HTML，这里仅渲染受控 Markdown -->
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div
          :class="[styles['reasoning-text'], 'markdown-body']"
          v-html="renderMarkdown(content)"
        ></div>
      </div>
    </div>
  </div>
</template>
