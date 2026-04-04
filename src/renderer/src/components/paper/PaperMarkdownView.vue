<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { marked } from 'marked'

const props = defineProps<{
  content: string
  loading: boolean
  paperId: string
  basePath?: string
}>()

const emit = defineEmits<{
  back: []
  refresh: []
}>()

// ==================== 状态 ====================

/** 渲染后的 HTML */
const renderedHtml = ref('')
/** 解析错误信息 */
const parseError = ref<string | null>(null)

// ==================== 配置 marked ====================

marked.setOptions({
  breaks: true,
  gfm: true
})

// ==================== 渲染逻辑 ====================

/** 处理图片路径：将相对路径转为 file:// 绝对路径 */
function resolveImagePaths(html: string, basePath: string | undefined): string {
  // 匹配 src="assets/page-xxxx/crop-xxxx.png" 形式的相对路径
  if (!basePath) return html
  return html.replace(/src="(assets\/[^"]+)"/g, (_match, relativePath: string) => {
    const normalizedBase = basePath.endsWith('/') ? basePath : basePath + '/'
    return `src="file://${normalizedBase}${relativePath}"`
  })
}

/** 渲染 Markdown 内容 */
async function renderContent(): Promise<void> {
  parseError.value = null
  if (!props.content) {
    renderedHtml.value = ''
    return
  }

  try {
    const rawHtml = await marked(props.content)
    renderedHtml.value = resolveImagePaths(rawHtml, props.basePath)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    parseError.value = `Markdown 解析失败: ${message}`
    renderedHtml.value = ''
  }
}

// 监听内容变化自动重新渲染
watch(
  () => props.content,
  () => {
    renderContent()
  },
  { immediate: true }
)

// ==================== 计算属性 ====================

const hasContent = computed(() => !!props.content.trim())
</script>

<template>
  <div class="paper-markdown-view">
    <!-- 工具栏 -->
    <div class="paper-markdown-view__toolbar">
      <button class="sm-button sm-button--ghost" @click="emit('back')">返回列表</button>
      <span class="paper-markdown-view__toolbar-title">论文阅读</span>
      <button class="sm-button sm-button--ghost" :disabled="loading" @click="emit('refresh')">
        刷新
      </button>
    </div>

    <!-- 滚动内容区 -->
    <div class="paper-markdown-view__scroll">
      <!-- 加载状态 -->
      <div v-if="loading" class="paper-markdown-view__loading">
        <p>正在加载内容...</p>
      </div>

      <!-- 解析错误 -->
      <div v-else-if="parseError" class="paper-markdown-view__error">
        <p>{{ parseError }}</p>
      </div>

      <!-- 空内容 -->
      <div v-else-if="!hasContent" class="paper-markdown-view__empty">
        <p>暂无内容</p>
      </div>

      <!-- Markdown 渲染结果（内容来自本地文件，经 marked 解析） -->
      <!-- eslint-disable-next-line vue/no-v-html -->
      <article v-else class="paper-markdown-view__content" v-html="renderedHtml" />
    </div>
  </div>
</template>

<style scoped>
.paper-markdown-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* 工具栏 */
.paper-markdown-view__toolbar {
  display: flex;
  align-items: center;
  gap: var(--sm-space-3);
  padding: var(--sm-space-3) var(--sm-space-5);
  border-bottom: 1px solid var(--sm-color-border-default);
  background: var(--sm-color-surface-2);
  flex-shrink: 0;
}

.paper-markdown-view__toolbar-title {
  flex: 1;
  text-align: center;
  font-size: 14px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
}

/* 滚动区域 */
.paper-markdown-view__scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: var(--sm-space-6) var(--sm-space-4);
}

/* 加载/错误/空状态 */
.paper-markdown-view__loading,
.paper-markdown-view__error,
.paper-markdown-view__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  font-size: 14px;
  color: var(--sm-color-text-tertiary);
}

.paper-markdown-view__error {
  color: var(--sm-color-danger, #ef4444);
}

/* Markdown 内容区 */
.paper-markdown-view__content {
  max-width: 720px;
  margin: 0 auto;
  font-size: 15px;
  line-height: 1.75;
  color: var(--sm-color-text-primary);
  user-select: text;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

/* 使用 :where() 降低选择器特异性，方便用户自定义覆盖 */
.paper-markdown-view__content :where(h1) {
  font-size: 24px;
  font-weight: 700;
  line-height: 1.3;
  margin: 1.2em 0 0.6em;
  color: var(--sm-color-text-primary);
}

.paper-markdown-view__content :where(h2) {
  font-size: 20px;
  font-weight: 600;
  line-height: 1.35;
  margin: 1.1em 0 0.55em;
  color: var(--sm-color-text-primary);
}

.paper-markdown-view__content :where(h3) {
  font-size: 17px;
  font-weight: 600;
  line-height: 1.4;
  margin: 1em 0 0.5em;
  color: var(--sm-color-text-primary);
}

.paper-markdown-view__content :where(p) {
  margin: 0.8em 0;
}

.paper-markdown-view__content :where(a) {
  color: var(--sm-color-accent-default, #6366f1);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.paper-markdown-view__content :where(a:hover) {
  opacity: 0.85;
}

/* 代码块 */
.paper-markdown-view__content :where(pre) {
  margin: 1em 0;
  padding: var(--sm-space-4);
  border-radius: var(--sm-radius-sm);
  background: var(--sm-color-surface-1);
  font-family: var(--sm-font-mono);
  font-size: 13px;
  line-height: 1.6;
  overflow-x: auto;
}

.paper-markdown-view__content :where(code) {
  font-family: var(--sm-font-mono);
  font-size: 0.9em;
}

.paper-markdown-view__content :where(:not(pre) > code) {
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--sm-color-surface-hover);
  font-size: 0.88em;
}

/* 图片 */
.paper-markdown-view__content :where(img) {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
  margin: 16px 0;
  display: block;
}

/* 表格 */
.paper-markdown-view__content :where(table) {
  width: 100%;
  margin: 1em 0;
  border-collapse: collapse;
  border-spacing: 0;
  font-size: 14px;
}

.paper-markdown-view__content :where(th),
.paper-markdown-view__content :where(td) {
  padding: var(--sm-space-2) var(--sm-space-3);
  border: 1px solid var(--sm-color-border-subtle);
  text-align: left;
}

.paper-markdown-view__content :where(th) {
  font-weight: 600;
  background: var(--sm-color-surface-1);
}

/* 引用块 */
.paper-markdown-view__content :where(blockquote) {
  margin: 1em 0;
  padding: var(--sm-space-3) var(--sm-space-4);
  border-left: 3px solid var(--sm-color-border-strong);
  border-radius: 0 var(--sm-radius-sm) var(--sm-radius-sm) 0;
  background: var(--sm-color-surface-1);
  color: var(--sm-color-text-secondary);
}

.paper-markdown-view__content :where(blockquote p) {
  margin: 0.4em 0;
}

/* 分隔线（页间分隔符） */
.paper-markdown-view__content :where(hr) {
  margin: 1.5em 0;
  border: none;
  height: 1px;
  background: var(--sm-color-border-subtle);
}

/* 列表 */
.paper-markdown-view__content :where(ul),
.paper-markdown-view__content :where(ol) {
  margin: 0.6em 0;
  padding-left: 1.5em;
}

.paper-markdown-view__content :where(li) {
  margin: 0.25em 0;
}

.paper-markdown-view__content :where(li > ul),
.paper-markdown-view__content :where(li > ol) {
  margin: 0.25em 0;
}
</style>
