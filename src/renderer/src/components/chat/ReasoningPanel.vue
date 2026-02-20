<script setup lang="ts">
import { ref, computed } from 'vue'
import MarkdownIt from 'markdown-it'

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
 * 计算思考内容的字符数
 */
const contentChars = computed(() => {
  return props.content.length
})
</script>

<template>
  <div class="reasoning-panel" :class="{ expanded: isActuallyExpanded }">
    <!-- 折叠状态：显示摘要 -->
    <button v-if="!isActuallyExpanded" class="reasoning-collapsed" type="button" @click="toggle">
      <div class="collapsed-content">
        <div class="collapsed-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        </div>
        <div class="collapsed-text">
          <span class="collapsed-label">思考过程</span>
          <span class="collapsed-meta">{{ contentLines }} 行 · {{ contentChars }} 字符</span>
        </div>
      </div>
      <div class="collapsed-arrow">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
    </button>

    <!-- 展开状态：显示完整内容 -->
    <div v-else class="reasoning-expanded">
      <div class="expanded-header">
        <div class="expanded-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <span>思考过程</span>
        </div>
        <button class="collapse-btn" type="button" @click="toggle">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="18 15 12 9 6 15" />
          </svg>
          <span>收起</span>
        </button>
      </div>

      <div class="expanded-content">
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
  transition: all 0.2s ease;
}

/* 折叠状态 */
.reasoning-collapsed {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--theme-spacing);
  padding: 10px 14px;
  background-color: var(--theme-bg-tertiary);
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius);
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
}

.reasoning-collapsed:hover {
  background-color: var(--theme-bg-hover);
  border-color: var(--theme-border-hover);
}

.collapsed-content {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.collapsed-icon {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--thinking-accent, var(--theme-warning));
}

.collapsed-icon svg {
  width: 20px;
  height: 20px;
}

.collapsed-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.collapsed-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--theme-text-secondary);
}

.collapsed-meta {
  font-size: 11px;
  color: var(--theme-text-tertiary);
}

.collapsed-arrow {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--theme-text-tertiary);
  transition: transform 0.2s ease;
}

.collapsed-arrow svg {
  width: 16px;
  height: 16px;
}

.reasoning-collapsed:hover .collapsed-arrow {
  color: var(--theme-text-secondary);
  transform: translateY(2px);
}

/* 展开状态 */
.reasoning-expanded {
  background-color: var(--theme-bg-tertiary);
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius);
  overflow: hidden;
}

.expanded-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background-color: var(--thinking-bg, rgba(0, 0, 0, 0.2));
  border-bottom: 1px solid var(--thinking-border, var(--theme-border));
}

.expanded-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--thinking-accent, var(--theme-warning));
}

.expanded-title svg {
  width: 18px;
  height: 18px;
}

.collapse-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius-sm);
  color: var(--theme-text-tertiary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.collapse-btn:hover {
  background-color: var(--theme-bg-hover);
  border-color: var(--theme-border-hover);
  color: var(--theme-text-secondary);
}

.collapse-btn svg {
  width: 14px;
  height: 14px;
}

.expanded-content {
  padding: 14px;
  max-height: 500px;
  overflow-y: auto;
}

/* 滚动条样式 */
.expanded-content::-webkit-scrollbar {
  width: 6px;
}

.expanded-content::-webkit-scrollbar-track {
  background: transparent;
}

.expanded-content::-webkit-scrollbar-thumb {
  background: var(--theme-border);
  border-radius: 3px;
}

.expanded-content::-webkit-scrollbar-thumb:hover {
  background: var(--theme-border-hover);
}

.reasoning-text {
  font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.7;
  color: var(--theme-text-secondary);
  white-space: pre-wrap;
}

/* Markdown 样式（针对思考内容） */
.markdown-body :deep(p) {
  margin: 0 0 0.75em 0;
}

.markdown-body :deep(p:last-child) {
  margin-bottom: 0;
}

.markdown-body :deep(code) {
  background-color: var(--theme-bg-hover, rgba(0, 0, 0, 0.3));
  padding: 0.2em 0.4em;
  border-radius: 4px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.9em;
  color: var(--theme-accent-tertiary);
}

.markdown-body :deep(pre) {
  background-color: var(--theme-bg-hover, rgba(0, 0, 0, 0.4));
  padding: 12px 16px;
  border-radius: var(--theme-radius);
  overflow-x: auto;
  margin: 0.75em 0;
  border: 1px solid var(--theme-border);
}

.markdown-body :deep(pre code) {
  background: none;
  padding: 0;
  font-size: 0.85em;
  line-height: 1.5;
  color: var(--theme-text-secondary);
}

.markdown-body :deep(blockquote) {
  margin: 0.75em 0;
  padding: 0.5em 1em;
  border-left: 3px solid var(--theme-accent);
  background-color: var(--thinking-bg, rgba(74, 158, 255, 0.1));
  border-radius: 0 var(--theme-radius-sm) var(--theme-radius-sm) 0;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin: 0.5em 0;
  padding-left: 1.5em;
}

.markdown-body :deep(li) {
  margin: 0.25em 0;
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

/* 展开状态下的面板样式 */
.reasoning-panel.expanded {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}
</style>
