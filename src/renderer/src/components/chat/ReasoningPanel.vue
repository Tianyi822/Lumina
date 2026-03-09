<script setup lang="ts">
import { ref, computed } from 'vue'
import MarkdownIt from 'markdown-it'
import { estimateTokenCount } from '@renderer/utils/tokenEstimate'

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
 * 计算思考内容的行数
 */
const contentLines = computed(() => {
  return props.content.split('\n').length
})

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
    return `${props.reasoningTokens} tokens`
  }

  return `约 ${contentTokens.value} tokens`
})
</script>

<template>
  <div class="reasoning-panel" :class="{ expanded: isActuallyExpanded }">
    <!-- 头部（始终显示） -->
    <div class="panel-header" @click="toggle">
      <div class="header-left">
        <div class="header-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        </div>
        <div class="header-text">
          <span class="header-label">思考过程</span>
          <span v-if="!isActuallyExpanded" class="header-meta">
            {{ contentLines }} 行 · {{ contentTokenLabel }}
          </span>
        </div>
      </div>
      <div class="header-right">
        <div class="expand-arrow" :class="{ rotated: isActuallyExpanded }">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </div>
    </div>

    <!-- 内容区域（可展开/收起） -->
    <div class="panel-content-wrapper" :class="{ expanded: isActuallyExpanded }">
      <div class="panel-content">
        <div class="reasoning-text markdown-body" v-html="renderMarkdown(content)"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.reasoning-panel {
  width: 100%;
  border-radius: var(--theme-radius);
  overflow: hidden;
  background:
    linear-gradient(
      135deg,
      var(--glass-white-027, rgba(255, 255, 255, 0.027)) 0%,
      var(--glass-white-013, rgba(255, 255, 255, 0.013)) 100%
    ),
    var(--theme-bg-tertiary);
  backdrop-filter: blur(8px) saturate(150%);
  -webkit-backdrop-filter: blur(8px) saturate(150%);
  border: 1px solid var(--glass-white-1, rgba(255, 255, 255, 0.1));
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.reasoning-panel:hover {
  border-color: var(--glass-white-15, rgba(255, 255, 255, 0.15));
}

.reasoning-panel.expanded {
  background:
    linear-gradient(
      135deg,
      var(--glass-white-02, rgba(255, 255, 255, 0.02)) 0%,
      var(--glass-white-01, rgba(255, 255, 255, 0.01)) 100%
    ),
    var(--theme-bg-tertiary);
  backdrop-filter: blur(12px) saturate(150%);
  -webkit-backdrop-filter: blur(12px) saturate(150%);
}

/* 头部样式 */
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--theme-spacing);
  padding: 10px 14px;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.panel-header:hover {
  background: var(--glass-white-03, rgba(255, 255, 255, 0.03));
}

.reasoning-panel.expanded .panel-header {
  background: var(--thinking-bg, rgba(99, 102, 241, 0.08));
  border-bottom: 1px solid var(--thinking-border, rgba(99, 102, 241, 0.2));
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
  color: var(--thinking-accent, var(--theme-accent-secondary));
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.reasoning-panel.expanded .header-icon {
  transform: scale(1.05);
}

.header-icon svg {
  width: 20px;
  height: 20px;
}

.header-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.header-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--theme-text-secondary);
  transition: color 0.2s ease;
}

.reasoning-panel.expanded .header-label {
  font-weight: 600;
  color: var(--thinking-accent, var(--theme-accent-secondary));
}

.header-meta {
  font-size: 11px;
  color: var(--theme-text-tertiary);
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
  color: var(--theme-text-tertiary);
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.expand-arrow svg {
  width: 16px;
  height: 16px;
}

.expand-arrow.rotated {
  transform: rotate(180deg);
}

.panel-header:hover .expand-arrow {
  color: var(--theme-text-secondary);
}

/* 内容区域 - 平滑高度过渡 */
.panel-content-wrapper {
  max-height: 0;
  overflow: hidden;
  opacity: 0;
  transition:
    max-height 0.3s cubic-bezier(0.16, 1, 0.3, 1),
    opacity 0.25s ease-out;
}

.panel-content-wrapper.expanded {
  max-height: 500px;
  opacity: 1;
}

.panel-content {
  padding: 14px;
  overflow-y: auto;
  max-height: 480px;
}

.panel-content::-webkit-scrollbar {
  width: 4px;
}

.panel-content::-webkit-scrollbar-track {
  background: transparent;
}

.panel-content::-webkit-scrollbar-thumb {
  background: var(--glass-white-15, rgba(255, 255, 255, 0.15));
  border-radius: 2px;
}

.reasoning-text {
  font-family: var(--theme-font-mono, 'JetBrains Mono', monospace);
  font-size: 13px;
  line-height: 1.42;
  color: var(--theme-text-secondary);
  white-space: normal;
  animation: contentFadeIn 0.3s ease-out;
}

@keyframes contentFadeIn {
  0% {
    opacity: 0;
    transform: translateY(-8px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Markdown 样式 */
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
  color: var(--theme-text);
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
  background: var(--glass-white-08, rgba(255, 255, 255, 0.08));
  padding: 0.2em 0.4em;
  border-radius: 4px;
  font-family: var(--theme-font-mono, 'JetBrains Mono', monospace);
  font-size: 0.9em;
  color: var(--theme-accent);
}

.markdown-body :deep(pre) {
  background:
    linear-gradient(
      135deg,
      var(--glass-white-03, rgba(255, 255, 255, 0.03)) 0%,
      var(--glass-white-017, rgba(255, 255, 255, 0.017)) 100%
    ),
    var(--theme-bg);
  padding: 12px 16px;
  border-radius: var(--theme-radius);
  overflow-x: auto;
  margin: 0.4em 0;
  border: 1px solid var(--glass-white-08, rgba(255, 255, 255, 0.08));
}

.markdown-body :deep(pre code) {
  background: none;
  padding: 0;
  font-size: 0.85em;
  line-height: 1.4;
  color: var(--theme-text-secondary);
}

.markdown-body :deep(blockquote) {
  margin: 0.4em 0;
  padding: 0.4em 0.9em;
  border-left: 3px solid var(--theme-accent);
  background: var(--thinking-bg, rgba(99, 102, 241, 0.08));
  border-radius: 0 var(--theme-radius-sm) var(--theme-radius-sm) 0;
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
  color: var(--theme-text);
}

.markdown-body :deep(em) {
  font-style: italic;
  color: var(--theme-text-secondary);
}

.markdown-body :deep(a) {
  color: var(--theme-accent);
  text-decoration: none;
}

.markdown-body :deep(a:hover) {
  text-decoration: underline;
}

/* 淡入淡出过渡 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
