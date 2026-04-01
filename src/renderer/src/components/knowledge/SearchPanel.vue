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
  <section class="search-section">
    <div class="search-header">
      <div>
        <h3>搜索测试</h3>
      </div>
      <span class="search-hint">验证当前知识库的召回质量与片段命中情况。</span>
    </div>

    <div class="search-input-row">
      <input
        v-model="searchQuery"
        type="text"
        class="sm-input search-input"
        placeholder="输入测试查询..."
        @keyup.enter="handleSearch"
        @keyup.esc="closeSearchResults"
      />
      <button
        class="sm-button sm-button--primary search-btn"
        :disabled="searching || !searchQuery.trim()"
        @click="handleSearch"
      >
        <span v-if="searching" class="sm-spinner"></span>
        <span v-else>搜索</span>
      </button>
    </div>

    <div v-if="searchPerformed" class="search-results">
      <div class="search-results__header">
        <span class="search-results__title">结果</span>
        <span class="search-results__count">{{ searchResults.length }} 条</span>
      </div>

      <div v-if="searchResults.length === 0" class="search-empty sm-empty">未找到相关结果</div>

      <div v-else class="search-results-list">
        <div v-for="result in searchResults" :key="result.chunkId" class="search-result-item">
          <div class="result-header">
            <span class="result-file">{{ result.fileName }}</span>
            <span class="result-similarity">{{ (result.similarity * 100).toFixed(1) }}%</span>
          </div>
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div class="result-content" v-html="highlightText(result.content, searchQuery)"></div>
          <div class="result-meta">块 {{ result.chunkIndex }} / {{ result.totalChunks }}</div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.search-section {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-4);
  padding: var(--sm-space-5) var(--sm-space-6);
  border: 1px solid var(--sm-color-border-subtle);
  border-radius: var(--sm-radius-lg);
  background: var(--sm-color-surface-1);
  flex-shrink: 0;
}

.search-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sm-space-4);
}

.search-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
}

.search-hint {
  max-width: 320px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--sm-color-text-secondary);
  text-align: right;
}

.search-input-row {
  display: flex;
  gap: var(--sm-space-3);
}

.search-input {
  flex: 1;
}

.search-btn {
  min-width: 88px;
}

.search-results {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-3);
  min-height: 0;
  max-height: 268px;
}

.search-results__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sm-space-3);
}

.search-results__title {
  font-size: 12px;
  font-weight: 500;
  color: var(--sm-color-text-secondary);
}

.search-results__count {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 8px;
  border: 1px solid var(--sm-color-border-default);
  border-radius: 999px;
  font-size: 11px;
  color: var(--sm-color-text-secondary);
  background: rgba(255, 255, 255, 0.03);
}

.search-empty {
  min-height: 132px;
}

.search-results-list {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-3);
  overflow-y: auto;
}

.search-result-item {
  padding: var(--sm-space-4);
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-md);
  background: var(--sm-color-surface-2);
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--sm-space-3);
  margin-bottom: var(--sm-space-3);
}

.result-file {
  font-size: 12px;
  font-weight: 500;
  color: var(--sm-color-text-primary);
}

.result-similarity {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border: 1px solid rgba(142, 149, 217, 0.28);
  border-radius: 999px;
  background: rgba(142, 149, 217, 0.08);
  font-size: 11px;
  color: var(--sm-color-accent-hover);
  font-family: var(--sm-font-mono);
}

.result-content {
  font-size: 13px;
  color: var(--sm-color-text-primary);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-bottom: 6px;
}

.search-highlight {
  padding: 1px 4px;
  border-radius: 4px;
  background: rgba(142, 149, 217, 0.18);
  color: var(--sm-color-text-primary);
  font-weight: 600;
}

.result-meta {
  font-size: 11px;
  color: var(--sm-color-text-tertiary);
}

.search-results-list::-webkit-scrollbar {
  width: var(--sm-scrollbar-size);
}

.search-results-list::-webkit-scrollbar-track {
  background: transparent;
}

.search-results-list::-webkit-scrollbar-thumb {
  background-color: var(--sm-color-border-default);
  border-radius: 999px;
}

@media (max-width: 960px) {
  .search-section {
    padding: var(--sm-space-4);
  }

  .search-header,
  .search-input-row {
    flex-direction: column;
    align-items: stretch;
  }

  .search-hint {
    max-width: none;
    text-align: left;
  }
}
</style>
