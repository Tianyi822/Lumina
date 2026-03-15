<script setup lang="ts">
import { useKnowledgeSearch } from './composables/useKnowledgeSearch'
import type { KnowledgeBase } from '@renderer/types'
import { computed } from 'vue'

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
  <div class="search-section">
    <div class="search-header">
      <h3>搜索测试</h3>
      <span class="search-hint">验证知识库的检索效果</span>
    </div>
    <div class="search-input-row">
      <input
        v-model="searchQuery"
        type="text"
        class="input search-input"
        placeholder="输入测试查询..."
        @keyup.enter="handleSearch"
        @keyup.esc="closeSearchResults"
      />
      <button
        class="btn-primary search-btn"
        :disabled="searching || !searchQuery.trim()"
        @click="handleSearch"
      >
        <span v-if="searching" class="spinner-tiny"></span>
        <span v-else>搜索</span>
      </button>
    </div>

    <!-- 搜索结果 -->
    <div v-if="searchPerformed" class="search-results">
      <div v-if="searchResults.length === 0" class="search-empty">未找到相关结果</div>
      <div v-else class="search-results-list">
        <div v-for="result in searchResults" :key="result.chunkId" class="search-result-item">
          <div class="result-header">
            <span class="result-file">{{ result.fileName }}</span>
            <span class="result-similarity"
              >相似度: {{ (result.similarity * 100).toFixed(1) }}%</span
            >
          </div>
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div class="result-content" v-html="highlightText(result.content, searchQuery)"></div>
          <div class="result-meta">块 {{ result.chunkIndex }} / {{ result.totalChunks }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 搜索测试区域 */
.search-section {
  padding: 16px 24px;
  border-bottom: 1px solid var(--theme-border);
  flex-shrink: 0;
}

.search-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.search-header h3 {
  font-size: 14px;
  font-weight: 600;
  color: var(--theme-text);
  margin: 0;
}

.search-hint {
  font-size: 12px;
  color: var(--theme-text-secondary);
}

.search-input-row {
  display: flex;
  gap: 8px;
}

.search-input {
  flex: 1;
}

.search-btn {
  padding: 0 16px;
  height: 32px;
  display: flex;
  align-items: center;
  gap: 6px;
}

/* 搜索结果 */
.search-results {
  margin-top: 12px;
  max-height: 250px;
  overflow-y: auto;
}

.search-empty {
  padding: 20px;
  text-align: center;
  color: var(--theme-text-secondary);
  font-size: 13px;
}

.search-results-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.search-result-item {
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 8px;
  padding: 12px;
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.result-file {
  font-size: 12px;
  font-weight: 500;
  color: var(--theme-accent);
}

.result-similarity {
  font-size: 11px;
  color: var(--theme-text-secondary);
  font-family: var(--font-mono);
}

.result-content {
  font-size: 13px;
  color: var(--theme-text);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-bottom: 6px;
}

/* 搜索关键词高亮样式 */
.search-highlight {
  background-color: rgba(255, 193, 7, 0.4);
  color: var(--theme-text);
  padding: 1px 2px;
  border-radius: 3px;
  font-weight: 600;
}

.result-meta {
  font-size: 11px;
  color: var(--theme-text-secondary);
}

.search-results::-webkit-scrollbar {
  width: 6px;
}

.search-results::-webkit-scrollbar-track {
  background: transparent;
}

.search-results::-webkit-scrollbar-thumb {
  background-color: var(--theme-border);
  border-radius: 3px;
}

.spinner-tiny {
  width: 12px;
  height: 12px;
  border: 2px solid var(--theme-border);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  display: inline-block;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
