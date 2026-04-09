<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import MarkdownIt from 'markdown-it'
import texmath from 'markdown-it-texmath'
import katex from 'katex'
import { usePaperReaderStore } from '@renderer/stores/paperReaderStore'
import type { PaperTocItem } from '@renderer/stores/paperReaderStore'
import type {
  PaperTranslationCache,
  PaperTranslationEntry,
  PaperTranslationStatus
} from '@shared/types/paper'
import { parsePaperTranslationSegments } from '@shared/utils/paperTranslation'
import 'katex/dist/katex.min.css'
import 'markdown-it-texmath/css/texmath.css'

interface RenderedSegment {
  id: string
  originalHtml: string
  translationHtml: string | null
  translationStatus: PaperTranslationStatus | 'idle'
  showTranslation: boolean
}

const props = defineProps<{
  content: string
  loading: boolean
  paperId: string
  basePath?: string
  translationVisible: boolean
  translationCache?: PaperTranslationCache | null
}>()

const paperReaderStore = usePaperReaderStore()

/** 渲染后的分段内容 */
const renderedSegments = ref<RenderedSegment[]>([])
/** 解析错误信息 */
const parseError = ref<string | null>(null)

const markdownRenderer = new MarkdownIt({
  html: true,
  breaks: true,
  linkify: true
}).use(texmath, {
  engine: katex,
  delimiters: ['dollars', 'beg_end'],
  katexOptions: {
    throwOnError: false,
    strict: 'ignore',
    output: 'htmlAndMathml'
  }
})

function normalizeInlineMath(content: string): string {
  return content.replace(/\$([^\n$]+?)\$/g, (_match, expression: string) => {
    return `$${expression.trim()}$`
  })
}

function resolveImagePaths(html: string, basePath: string | undefined): string {
  if (!basePath) return html

  return html.replace(
    /src=(['"])(assets\/[^'"]+)\1/g,
    (_match, quote: string, relativePath: string) => {
      const normalizedBase = basePath.endsWith('/') ? basePath : basePath + '/'
      return `src=${quote}file://${normalizedBase}${relativePath}${quote}`
    }
  )
}

function slugifyHeadingText(text: string): string {
  const normalized = text
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  return normalized || 'section'
}

function postProcessRenderedHtml(html: string, headingId?: string): string {
  if (typeof DOMParser === 'undefined') {
    return html
  }

  const parser = new DOMParser()
  const document = parser.parseFromString(`<div>${html}</div>`, 'text/html')
  const root = document.body.firstElementChild
  if (!root) {
    return html
  }

  root.querySelectorAll('hr').forEach((separator) => {
    separator.remove()
  })

  if (headingId) {
    const heading = root.querySelector('h1, h2, h3')
    if (heading) {
      heading.id = headingId
    }
  }

  root.querySelectorAll('table').forEach((table) => {
    if (table.parentElement?.classList.contains('paper-markdown-view__table-wrap')) {
      return
    }

    const wrap = document.createElement('div')
    wrap.className = 'paper-markdown-view__table-wrap'
    table.parentNode?.insertBefore(wrap, table)
    wrap.appendChild(table)
  })

  return root.innerHTML
}

function renderMarkdownBlock(markdown: string, headingId?: string): string {
  const normalizedContent = normalizeInlineMath(markdown)
  const rawHtml = markdownRenderer.render(normalizedContent)
  const resolvedHtml = resolveImagePaths(rawHtml, props.basePath)
  return postProcessRenderedHtml(resolvedHtml, headingId)
}

function shouldRenderTranslationBlock(
  visible: boolean,
  status: PaperTranslationStatus | 'idle',
  translationHtml: string | null
): boolean {
  if (!visible || status === 'idle' || status === 'skipped') {
    return false
  }

  if (status === 'completed') {
    return !!translationHtml
  }

  return true
}

function buildTocAndRenderedSegments(): { tocItems: PaperTocItem[]; segments: RenderedSegment[] } {
  const segments = parsePaperTranslationSegments(props.content)
  const tocItems: PaperTocItem[] = []
  const rendered: RenderedSegment[] = []
  const headingCounts = new Map<string, number>()
  const translationMap = new Map<string, PaperTranslationEntry>()

  for (const entry of props.translationCache?.entries ?? []) {
    translationMap.set(entry.id, entry)
  }

  for (const segment of segments) {
    let headingId: string | undefined
    const headingMatch = segment.originalMarkdown.match(/^(#{1,3})\s+(.+)$/s)
    if (headingMatch) {
      const text = segment.originalText
      const level = Number(headingMatch[1].length) as PaperTocItem['level']
      const baseSlug = slugifyHeadingText(text)
      const count = (headingCounts.get(baseSlug) || 0) + 1
      headingCounts.set(baseSlug, count)

      headingId = count === 1 ? baseSlug : `${baseSlug}-${count}`
      tocItems.push({
        id: headingId,
        text,
        level
      })
    }

    const translationEntry = translationMap.get(segment.id)
    const translationStatus = translationEntry?.status ?? 'idle'
    const translationHtml =
      translationEntry &&
      translationEntry.status === 'completed' &&
      translationEntry.translatedMarkdown
        ? renderMarkdownBlock(translationEntry.translatedMarkdown)
        : null

    rendered.push({
      id: segment.id,
      originalHtml: renderMarkdownBlock(segment.originalMarkdown, headingId),
      translationHtml,
      translationStatus,
      showTranslation: shouldRenderTranslationBlock(
        props.translationVisible,
        translationStatus,
        translationHtml
      )
    })
  }

  return {
    tocItems,
    segments: rendered
  }
}

function renderContent(): void {
  parseError.value = null
  if (!props.content.trim()) {
    renderedSegments.value = []
    paperReaderStore.clearPaperToc()
    return
  }

  try {
    const result = buildTocAndRenderedSegments()
    renderedSegments.value = result.segments
    paperReaderStore.setPaperTocItems(result.tocItems)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    parseError.value = `Markdown 解析失败: ${message}`
    renderedSegments.value = []
    paperReaderStore.clearPaperToc()
  }
}

watch(
  () => [
    props.content,
    props.basePath,
    props.translationVisible,
    props.translationCache?.updatedAt,
    props.translationCache?.completedSegments
  ],
  () => {
    renderContent()
  },
  { immediate: true }
)

const hasContent = computed(() => !!props.content.trim())

onBeforeUnmount(() => {
  paperReaderStore.clearPaperToc()
})
</script>

<template>
  <div class="paper-markdown-view">
    <div class="paper-markdown-view__scroll">
      <div v-if="loading" class="paper-markdown-view__loading">
        <p>正在加载内容...</p>
      </div>

      <div v-else-if="parseError" class="paper-markdown-view__error">
        <p>{{ parseError }}</p>
      </div>

      <div v-else-if="!hasContent" class="paper-markdown-view__empty">
        <p>暂无内容</p>
      </div>

      <article v-else class="paper-markdown-view__content">
        <section
          v-for="segment in renderedSegments"
          :key="segment.id"
          class="paper-markdown-view__segment"
        >
          <div class="paper-markdown-view__segment-original paper-markdown-view__markdown">
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div v-html="segment.originalHtml" />
          </div>

          <div
            v-if="segment.showTranslation"
            class="paper-markdown-view__segment-translation"
            :class="`is-${segment.translationStatus}`"
          >
            <div
              v-if="segment.translationHtml"
              class="paper-markdown-view__segment-translation-body paper-markdown-view__markdown"
            >
              <!-- eslint-disable-next-line vue/no-v-html -->
              <div v-html="segment.translationHtml" />
            </div>

            <div
              v-else-if="segment.translationStatus === 'failed'"
              class="paper-markdown-view__translation-error"
            >
              该段翻译暂时失败，再次点击翻译按钮时会继续补全剩余内容。
            </div>

            <div v-else class="paper-markdown-view__translation-placeholder" aria-hidden="true">
              <span class="paper-markdown-view__translation-placeholder-text">正在翻译...</span>
              <span class="paper-markdown-view__translation-placeholder-bar" />
              <span class="paper-markdown-view__translation-placeholder-bar" />
              <span class="paper-markdown-view__translation-placeholder-bar" />
            </div>
          </div>
        </section>
      </article>
    </div>
  </div>
</template>

<style scoped>
.paper-markdown-view {
  flex: 1;
  width: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.paper-markdown-view__scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: var(--sm-space-3) var(--sm-space-4) var(--sm-space-6);
}

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

.paper-markdown-view__content {
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
}

.paper-markdown-view__segment + .paper-markdown-view__segment {
  margin-top: var(--sm-space-3);
}

.paper-markdown-view__segment-original,
.paper-markdown-view__segment-translation {
  box-sizing: border-box;
}

.paper-markdown-view__segment-translation {
  margin-top: var(--sm-space-2);
}

.paper-markdown-view__segment-translation.is-queued,
.paper-markdown-view__segment-translation.is-translating {
  opacity: 0.9;
}

.paper-markdown-view__translation-error {
  color: var(--sm-color-text-secondary);
  font-size: 13px;
  line-height: 1.7;
}

.paper-markdown-view__translation-placeholder {
  display: grid;
  gap: var(--sm-space-2);
  padding: var(--sm-space-1) 0;
}

.paper-markdown-view__translation-placeholder-text {
  display: block;
  font-size: 13px;
  color: var(--sm-color-text-tertiary);
  margin-bottom: var(--sm-space-1);
}

.paper-markdown-view__translation-placeholder-bar {
  display: block;
  width: 100%;
  height: 12px;
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--sm-color-border-subtle) 65%, transparent) 0%,
    color-mix(in srgb, var(--sm-color-text-tertiary) 16%, transparent) 50%,
    color-mix(in srgb, var(--sm-color-border-subtle) 65%, transparent) 100%
  );
  background-size: 180% 100%;
  animation: paper-translation-breathe 1.8s ease-in-out infinite;
}

.paper-markdown-view__translation-placeholder-bar:nth-child(2) {
  width: 92%;
  animation-delay: 0.12s;
}

.paper-markdown-view__translation-placeholder-bar:nth-child(3) {
  width: 78%;
  animation-delay: 0.24s;
}

.paper-markdown-view__markdown {
  width: 100%;
  font-size: 15px;
  line-height: 1.75;
  color: var(--sm-color-text-primary);
  user-select: text;
  box-sizing: border-box;
  overflow-x: hidden;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.paper-markdown-view__segment-translation-body {
  width: 100%;
}

.paper-markdown-view__markdown > :first-child {
  margin-top: 0;
}

.paper-markdown-view__markdown > :last-child {
  margin-bottom: 0;
}

.paper-markdown-view__markdown :where(h1) {
  font-size: 24px;
  font-weight: 700;
  line-height: 1.3;
  margin: 1.2em 0 0.6em;
  color: var(--sm-color-text-primary);
}

.paper-markdown-view__markdown :where(h2) {
  font-size: 20px;
  font-weight: 600;
  line-height: 1.35;
  margin: 1.1em 0 0.55em;
  color: var(--sm-color-text-primary);
}

.paper-markdown-view__markdown :where(h3) {
  font-size: 17px;
  font-weight: 600;
  line-height: 1.4;
  margin: 1em 0 0.5em;
  color: var(--sm-color-text-primary);
}

.paper-markdown-view__markdown :where(p) {
  margin: 0.8em 0;
}

.paper-markdown-view__markdown :where(a) {
  color: var(--sm-color-accent-default, #6366f1);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.paper-markdown-view__markdown :where(a:hover) {
  opacity: 0.85;
}

.paper-markdown-view__markdown :where(eq) {
  display: inline-block;
  vertical-align: baseline;
}

.paper-markdown-view__markdown :where(eqn) {
  display: block;
}

.paper-markdown-view__markdown :where(.katex) {
  font-size: 1em;
}

.paper-markdown-view__markdown :where(.katex-display) {
  margin: 1.25em 0;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 0.2em 0;
}

.paper-markdown-view__markdown :where(.katex-display > .katex) {
  display: inline-block;
  min-width: min-content;
}

.paper-markdown-view__markdown :where(pre) {
  margin: 1em 0;
  padding: var(--sm-space-4);
  border-radius: var(--sm-radius-sm);
  background: var(--sm-color-surface-1);
  font-family: var(--sm-font-mono);
  font-size: 13px;
  line-height: 1.6;
  overflow-x: auto;
}

.paper-markdown-view__markdown :where(code) {
  font-family: var(--sm-font-mono);
  font-size: 0.9em;
}

.paper-markdown-view__markdown :where(:not(pre) > code) {
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--sm-color-surface-hover);
  font-size: 0.88em;
}

.paper-markdown-view__markdown :where(img) {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
  margin: 16px auto;
  display: block;
}

.paper-markdown-view__markdown :where(.paper-markdown-view__table-wrap) {
  display: block;
  width: 100%;
  max-width: 100%;
  margin: 1em 0;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  scrollbar-gutter: stable both-edges;
}

.paper-markdown-view__markdown :where(.paper-markdown-view__table-wrap > table) {
  width: max-content;
  min-width: 100%;
  margin: 0;
  border-collapse: collapse;
  border-spacing: 0;
  table-layout: auto;
  font-size: 14px;
}

.paper-markdown-view__markdown :where(th),
.paper-markdown-view__markdown :where(td) {
  padding: var(--sm-space-2) var(--sm-space-3);
  border: 1px solid var(--sm-color-border-subtle);
  text-align: left;
  vertical-align: top;
}

.paper-markdown-view__markdown :where(th) {
  font-weight: 600;
  background: var(--sm-color-surface-1);
}

.paper-markdown-view__markdown :where(blockquote) {
  margin: 1em 0;
  padding: var(--sm-space-3) var(--sm-space-4);
  border-left: 3px solid var(--sm-color-border-strong);
  border-radius: 0 var(--sm-radius-sm) var(--sm-radius-sm) 0;
  background: var(--sm-color-surface-1);
  color: var(--sm-color-text-secondary);
}

.paper-markdown-view__markdown :where(blockquote p) {
  margin: 0.4em 0;
}

.paper-markdown-view__markdown :where(ul),
.paper-markdown-view__markdown :where(ol) {
  margin: 0.6em 0;
  padding-left: 1.5em;
}

.paper-markdown-view__markdown :where(li) {
  margin: 0.25em 0;
}

.paper-markdown-view__markdown :where(li > ul),
.paper-markdown-view__markdown :where(li > ol) {
  margin: 0.25em 0;
}

@keyframes paper-translation-breathe {
  0% {
    opacity: 0.48;
    background-position: 100% 50%;
  }

  50% {
    opacity: 1;
    background-position: 0% 50%;
  }

  100% {
    opacity: 0.48;
    background-position: 100% 50%;
  }
}
</style>
