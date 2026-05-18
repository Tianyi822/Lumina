<script setup lang="ts">
import { useKnowledgeSearch } from './composables/useKnowledgeSearch'
import type { KnowledgeBase } from '@renderer/types'
import { computed } from 'vue'
import styles from './SearchPanel.module.css'

const props = defineProps<{
  currentKB?: KnowledgeBase
}>()

const kbComputed = computed(() => props.currentKB)

const { searchQuery, searchResults, searching, searchPerformed, handleSearch, closeSearchResults } =
  useKnowledgeSearch(kbComputed)

/**
 * 高亮文本中的搜索关键词
 */
function highlightText(text: string, query: string): string {
  if (!query.trim()) return escapeHtml(text)

  const escapedQuery = escapeRegex(query.trim())
  const regex = new RegExp(`(${escapedQuery})`, 'gi')
  return escapeHtml(text).replace(regex, '<mark class="search-highlight">$1</mark>')
}

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
</script>

<template>
  <section :class="styles['search-section']">
    <div :class="styles['search-header']">
      <div>
        <h3>搜索测试</h3>
      </div>
      <span :class="styles['search-hint']">验证当前知识库的召回质量与片段命中情况。</span>
    </div>

    <div :class="styles['search-input-row']">
      <input
        v-model="searchQuery"
        type="text"
        :class="['sm-input', styles['search-input']]"
        placeholder="输入测试查询..."
        @keyup.enter="handleSearch"
        @keyup.esc="closeSearchResults"
      />
      <button
        :class="['sm-button', 'sm-button--primary', styles['search-btn']]"
        :disabled="searching || !searchQuery.trim()"
        @click="handleSearch"
      >
        <span v-if="searching" class="sm-spinner"></span>
        <span v-else>搜索</span>
      </button>
    </div>

    <div v-if="searchPerformed" :class="styles['search-results']">
      <div :class="styles['search-results__header']">
        <span :class="styles['search-results__title']">结果</span>
        <span :class="styles['search-results__count']">{{ searchResults.length }} 条</span>
      </div>

      <div v-if="searchResults.length === 0" :class="['sm-empty', styles['search-empty']]">
        未找到相关结果
      </div>

      <div v-else :class="styles['search-results-list']">
        <div
          v-for="result in searchResults"
          :key="result.chunkId"
          :class="styles['search-result-item']"
        >
          <div :class="styles['result-header']">
            <span :class="styles['result-file']">{{ result.fileName }}</span>
            <span :class="styles['result-similarity']"
              >{{ (result.similarity * 100).toFixed(1) }}%</span
            >
          </div>
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div
            :class="styles['result-content']"
            v-html="highlightText(result.content, searchQuery)"
          ></div>
          <div :class="styles['result-meta']">
            块 {{ result.chunkIndex }} / {{ result.totalChunks }}
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
