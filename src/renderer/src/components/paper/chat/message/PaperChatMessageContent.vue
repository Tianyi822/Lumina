<script setup lang="ts">
import { computed } from 'vue'
import MarkdownIt from 'markdown-it'
import texmath from 'markdown-it-texmath'
import katex from 'katex'
import { normalizePaperInlineMathForRender } from '@shared/utils/paperMarkdown'
import 'katex/dist/katex.min.css'
import 'markdown-it-texmath/css/texmath.css'
import styles from './PaperChatMessageContent.module.css'

const props = defineProps<{
  content: string
  isStreaming?: boolean
  role: 'system' | 'user' | 'assistant' | 'tool'
}>()

// 初始化 markdown-it 实例
const md = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: true,
  typographer: true
}).use(texmath, {
  engine: katex,
  delimiters: ['dollars', 'beg_end'],
  katexOptions: {
    throwOnError: false,
    strict: 'ignore',
    output: 'htmlAndMathml'
  }
})

/**
 * 渲染 Markdown 内容
 */
function renderMarkdown(content: string): string {
  if (!content) return ''
  return md.render(normalizePaperInlineMathForRender(content, 'paragraph'))
}

const renderedMarkdown = computed(() => renderMarkdown(props.content))

/**
 * 是否有实际内容可显示
 */
const hasContent = computed(() => !!props.content?.trim())
</script>

<template>
  <div v-if="role === 'user' && hasContent" :class="styles['message-text']">
    {{ content }}
  </div>
  <template v-else-if="role !== 'user' && hasContent">
    <!-- markdown-it 已禁用原生 HTML，这里仅渲染受控 Markdown -->
    <!-- eslint-disable vue/no-v-html -->
    <div
      class="markdown-body"
      :class="{ [styles['streaming-content']]: isStreaming }"
      v-html="renderedMarkdown"
    ></div>
    <!-- eslint-enable vue/no-v-html -->
  </template>
</template>
