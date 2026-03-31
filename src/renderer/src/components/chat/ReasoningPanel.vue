<script setup lang="ts">
import { ref, computed } from 'vue'
import MarkdownIt from 'markdown-it'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import { estimateTokenCount, formatTokenCount } from '@renderer/utils/tokenEstimate'

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
    <div class="sm-reasoning-panel__header" @click="toggle">
      <div class="header-left">
        <div class="header-icon">
          <SvgIcon name="thinking" :size="20" />
        </div>
        <div class="header-text">
          <span class="header-label">思考过程</span>
          <span class="header-meta">{{ contentTokenLabel }}</span>
        </div>
      </div>
      <div class="header-right">
        <div class="expand-arrow" :class="{ rotated: isActuallyExpanded }">
          <SvgIcon name="arrow-down" :size="16" />
        </div>
      </div>
    </div>

    <!-- 内容区域（可展开/收起） -->
    <div class="sm-reasoning-panel__content-shell" :class="{ expanded: isActuallyExpanded }">
      <div class="sm-reasoning-panel__content">
        <!-- markdown-it 已禁用原生 HTML，这里仅渲染受控 Markdown -->
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div class="reasoning-text markdown-body" v-html="renderMarkdown(content)"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.reasoning-panel {
  width: 100%;
  border-radius: var(--sm-radius-md);
  overflow: hidden;
  background: var(--sm-color-surface-1);
  border: 1px solid var(--sm-color-border-default);
  transition:
    background-color var(--sm-transition-fast),
    border-color var(--sm-transition-fast);
}

.reasoning-panel:hover {
  background: var(--sm-color-surface-2);
  border-color: var(--sm-color-border-strong);
}

.reasoning-panel.expanded {
  background: var(--sm-color-surface-2);
  border-color: rgba(142, 149, 217, 0.28);
}

.sm-reasoning-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sm-space-3);
  padding: 11px 14px;
  border-bottom: 1px solid transparent;
  cursor: pointer;
  transition:
    background-color var(--sm-transition-fast),
    border-color var(--sm-transition-fast);
}

.sm-reasoning-panel__header:hover {
  background: var(--sm-color-surface-hover);
}

.reasoning-panel.expanded .sm-reasoning-panel__header {
  background: rgba(142, 149, 217, 0.08);
  border-bottom-color: rgba(142, 149, 217, 0.18);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.header-icon {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--sm-color-accent-hover);
}

.header-icon svg {
  width: 20px;
  height: 20px;
}

.header-text {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.header-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
}

.reasoning-panel.expanded .header-label {
  color: var(--sm-color-accent-hover);
}

.header-meta {
  font-size: 11px;
  color: var(--sm-color-text-tertiary);
  white-space: nowrap;
}

.header-right {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.expand-arrow {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--sm-color-text-tertiary);
  transition:
    color var(--sm-transition-fast),
    transform var(--sm-transition-fast);
}

.expand-arrow svg {
  width: 16px;
  height: 16px;
}

.expand-arrow.rotated {
  transform: rotate(180deg);
}

.sm-reasoning-panel__header:hover .expand-arrow {
  color: var(--sm-color-text-secondary);
}

.sm-reasoning-panel__content-shell {
  max-height: 0;
  overflow: hidden;
  opacity: 0;
  transition:
    max-height var(--sm-transition-medium),
    opacity var(--sm-transition-instant);
}

.sm-reasoning-panel__content-shell.expanded {
  max-height: 520px;
  opacity: 1;
}

.sm-reasoning-panel__content {
  padding: 14px;
  overflow-y: auto;
  max-height: 500px;
  border-top: 1px solid var(--sm-color-border-subtle);
}

.sm-reasoning-panel__content::-webkit-scrollbar {
  width: 4px;
}

.sm-reasoning-panel__content::-webkit-scrollbar-track {
  background: transparent;
}

.sm-reasoning-panel__content::-webkit-scrollbar-thumb {
  background: var(--sm-color-border-default);
  border-radius: 999px;
}

.reasoning-text {
  font-family: var(--sm-font-mono);
  font-size: 13px;
  line-height: 1.55;
  color: var(--sm-color-text-secondary);
  white-space: normal;
  animation: contentFadeIn 140ms ease;
}

@keyframes contentFadeIn {
  0% {
    opacity: 0;
    transform: translateY(-4px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

.markdown-body :deep(p) {
  margin: 0 0 0.34em 0;
}

.markdown-body :deep(p:last-child) {
  margin-bottom: 0;
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4),
.markdown-body :deep(h5),
.markdown-body :deep(h6) {
  margin: 0.8em 0 0.3em 0;
  font-weight: 700;
  line-height: 1.28;
  color: var(--sm-color-text-primary);
}

.markdown-body :deep(h1:first-child),
.markdown-body :deep(h2:first-child),
.markdown-body :deep(h3:first-child),
.markdown-body :deep(h4:first-child),
.markdown-body :deep(h5:first-child),
.markdown-body :deep(h6:first-child) {
  margin-top: 0;
}

.markdown-body :deep(h1) {
  font-size: 1.22em;
}

.markdown-body :deep(h2) {
  font-size: 1.14em;
}

.markdown-body :deep(h3) {
  font-size: 1.08em;
}

.markdown-body :deep(h4),
.markdown-body :deep(h5),
.markdown-body :deep(h6) {
  font-size: 1.02em;
}

.markdown-body :deep(br) {
  line-height: 1.42;
}

.markdown-body :deep(code) {
  background: var(--sm-color-bg-embedded);
  border: 1px solid var(--sm-color-border-subtle);
  padding: 0.2em 0.4em;
  border-radius: 4px;
  font-family: var(--sm-font-mono);
  font-size: 0.9em;
  color: var(--sm-color-accent-hover);
}

.markdown-body :deep(pre) {
  background: var(--sm-color-bg-embedded);
  padding: 12px 16px;
  border-radius: var(--sm-radius-md);
  overflow-x: auto;
  margin: 0.4em 0;
  border: 1px solid var(--sm-color-border-subtle);
}

.markdown-body :deep(pre code) {
  background: none;
  border: 0;
  padding: 0;
  font-size: 0.85em;
  line-height: 1.4;
  color: var(--sm-color-text-secondary);
}

.markdown-body :deep(blockquote) {
  margin: 0.4em 0;
  padding: 0.4em 0.9em;
  border-left: 3px solid var(--sm-color-accent);
  background: rgba(142, 149, 217, 0.08);
  border-radius: 0 var(--sm-radius-sm) var(--sm-radius-sm) 0;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin: 0.22em 0;
  padding-left: 1.8em;
  list-style-position: outside;
}

.markdown-body :deep(li) {
  margin: 0.14em 0;
  padding-left: 0.15em;
  line-height: 1.42;
}

.markdown-body :deep(strong) {
  font-weight: 600;
  color: var(--sm-color-text-primary);
}

.markdown-body :deep(em) {
  font-style: italic;
  color: var(--sm-color-text-secondary);
}

.markdown-body :deep(a) {
  color: var(--sm-color-accent-hover);
  text-decoration: none;
}

.markdown-body :deep(a:hover) {
  text-decoration: underline;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 140ms ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
