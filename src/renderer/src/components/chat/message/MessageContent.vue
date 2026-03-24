<script setup lang="ts">
import { computed } from 'vue'
import MarkdownIt from 'markdown-it'

const props = defineProps<{
  content: string
  isStreaming?: boolean
  role: 'user' | 'assistant' | 'tool'
}>()

// 初始化 markdown-it 实例
const md = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: true,
  typographer: true
})

/**
 * 渲染 Markdown 内容
 */
function renderMarkdown(content: string): string {
  if (!content) return ''
  return md.render(content)
}

const renderedMarkdown = computed(() => renderMarkdown(props.content))

/**
 * 是否有实际内容可显示
 */
const hasContent = computed(() => !!props.content?.trim())
</script>

<template>
  <div v-if="role === 'user' && hasContent" class="message-text">
    {{ content }}
  </div>
  <template v-else-if="role !== 'user' && hasContent">
    <!-- markdown-it 已禁用原生 HTML，这里仅渲染受控 Markdown -->
    <!-- eslint-disable vue/no-v-html -->
    <div
      class="markdown-body"
      :class="{ 'streaming-content': isStreaming }"
      v-html="renderedMarkdown"
    ></div>
    <!-- eslint-enable vue/no-v-html -->
  </template>
</template>

<style scoped>
/* 用户消息文本 */
.message-text {
  white-space: pre-wrap;
}

/* Markdown 内容样式 */
.markdown-body {
  color: inherit;
  max-width: 100%;
  overflow-wrap: break-word;
  min-width: 0;
}

.markdown-body :deep(p) {
  margin: 0 0 0.75em 0;
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
  margin: 1em 0 0.5em 0;
  font-weight: 600;
  line-height: 1.3;
}

.markdown-body :deep(h1:first-child),
.markdown-body :deep(h2:first-child),
.markdown-body :deep(h3:first-child) {
  margin-top: 0;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin: 0.5em 0;
  padding-left: 1.5em;
}

.markdown-body :deep(li) {
  margin: 0.25em 0;
}

.markdown-body :deep(code) {
  background-color: var(--glass-white-08, rgba(255, 255, 255, 0.08));
  padding: 0.2em 0.4em;
  border-radius: 4px;
  font-family: var(--theme-font-mono, 'JetBrains Mono', 'Fira Code', monospace);
  font-size: 0.9em;
}

.markdown-body :deep(pre) {
  background:
    linear-gradient(
      135deg,
      var(--glass-white-03, rgba(255, 255, 255, 0.03)) 0%,
      var(--glass-white-017, rgba(255, 255, 255, 0.017)) 100%
    ),
    var(--theme-bg);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  padding: 12px 16px;
  border-radius: var(--theme-radius);
  overflow-x: auto;
  margin: 0.75em 0;
  border: 1px solid var(--glass-white-08, rgba(255, 255, 255, 0.08));
}

.markdown-body :deep(pre code) {
  background: none;
  padding: 0;
  font-size: 0.85em;
  line-height: 1.5;
}

.markdown-body :deep(blockquote) {
  margin: 0.75em 0;
  padding: 0.5em 1em;
  border-left: 3px solid var(--theme-accent);
  background: var(--thinking-bg, rgba(99, 102, 241, 0.08));
  border-radius: 0 var(--theme-radius-sm) var(--theme-radius-sm) 0;
}

.markdown-body :deep(a) {
  color: var(--theme-accent);
  text-decoration: none;
}

.markdown-body :deep(a:hover) {
  text-decoration: underline;
}

.markdown-body :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 0.75em 0;
  display: block;
  max-width: 100%;
  overflow-x: auto;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid var(--theme-border);
  padding: 8px 12px;
  text-align: left;
}

.markdown-body :deep(th) {
  background-color: var(--theme-bg-tertiary, rgba(0, 0, 0, 0.2));
  font-weight: 600;
}

.markdown-body :deep(hr) {
  border: none;
  border-top: 1px solid var(--theme-border);
  margin: 1em 0;
}

.markdown-body :deep(strong) {
  font-weight: 600;
}

.markdown-body :deep(em) {
  font-style: italic;
}

/* 流式内容平滑显示 */
.streaming-content {
  opacity: 0.98;
  transition: opacity 0.18s ease-out;
}
</style>
