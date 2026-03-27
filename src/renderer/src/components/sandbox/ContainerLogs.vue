<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'

// ==================== Props & Emits ====================

const props = defineProps<{
  containerId: string
  containerName: string
  logs: string
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'refresh'): void
  (e: 'export'): void
}>()

// ==================== State ====================

const logsContainerRef = ref<HTMLDivElement | null>(null)
const autoScroll = ref(true)
const searchQuery = ref('')
const tailLines = ref(100)

// ==================== Computed ====================

const allLines = computed(() => {
  if (!props.logs) {
    return [] as string[]
  }

  return props.logs.split('\n')
})

const matchedLines = computed(() => {
  if (!searchQuery.value.trim()) {
    return allLines.value
  }

  const query = searchQuery.value.toLowerCase()
  return allLines.value.filter((line) => line.toLowerCase().includes(query))
})

const filteredLogs = computed(() => {
  return matchedLines.value.slice(-tailLines.value).join('\n')
})

const lineCount = computed(() => {
  return allLines.value.filter((line) => line.trim()).length
})

const matchedLineCount = computed(() => {
  return matchedLines.value.filter((line) => line.trim()).length
})

// ==================== Watch ====================

watch(
  () => props.logs,
  async () => {
    if (autoScroll.value) {
      await nextTick()
      scrollToBottom()
    }
  },
  { immediate: true }
)

// ==================== Methods ====================

function scrollToBottom(): void {
  if (logsContainerRef.value) {
    logsContainerRef.value.scrollTop = logsContainerRef.value.scrollHeight
  }
}

function handleRefresh(): void {
  emit('refresh')
}

function handleExport(): void {
  emit('export')
}

function handleClearSearch(): void {
  searchQuery.value = ''
}
</script>

<template>
  <div class="container-logs">
    <div class="logs-header">
      <div class="logs-header__copy">
        <span class="logs-header__eyebrow">容器日志</span>
        <div class="logs-header__headline">
          <h2>{{ containerName }}</h2>
          <span class="sm-badge logs-meta">{{ containerId.substring(0, 12) }}</span>
          <span class="sm-badge logs-meta">{{ lineCount }} 行</span>
        </div>
        <p>检索容器输出，定位最近的服务状态和运行异常。</p>
      </div>
      <div class="header-actions">
        <label class="toggle-label">
          <input v-model="autoScroll" type="checkbox" />
          <span>自动滚动</span>
        </label>
        <button class="sm-button sm-button--secondary sm-button--small" @click="handleRefresh">
          刷新
        </button>
        <button class="sm-button sm-button--secondary sm-button--small" @click="handleExport">
          导出
        </button>
      </div>
    </div>

    <div class="logs-toolbar">
      <input
        v-model="searchQuery"
        type="text"
        class="input search-input"
        placeholder="搜索日志内容"
      />
      <div class="toolbar-tail">
        <label for="tail-lines">显示最近</label>
        <select id="tail-lines" v-model="tailLines" class="select-sm">
          <option :value="50">50 行</option>
          <option :value="100">100 行</option>
          <option :value="200">200 行</option>
          <option :value="500">500 行</option>
          <option :value="1000">1000 行</option>
        </select>
      </div>
      <button
        v-if="searchQuery"
        class="sm-button sm-button--secondary sm-button--small sm-container-logs__clear-button"
        @click="handleClearSearch"
      >
        清除
      </button>
    </div>

    <div ref="logsContainerRef" class="logs-content">
      <div v-if="loading" class="loading-state">
        <div class="loading-spinner"></div>
        <p>加载日志中...</p>
      </div>

      <div v-else-if="!logs" class="empty-state">
        <p>暂无日志</p>
        <button class="sm-button sm-button--secondary sm-button--small" @click="handleRefresh">
          刷新
        </button>
      </div>

      <div v-else-if="filteredLogs" class="logs-text">
        <pre>{{ filteredLogs }}</pre>
      </div>

      <div v-else class="no-results">
        <p>未找到匹配 "{{ searchQuery }}" 的日志</p>
        <button class="sm-button sm-button--secondary sm-button--small" @click="handleClearSearch">
          清除搜索
        </button>
      </div>
    </div>

    <div class="logs-footer">
      <div class="footer-meta">
        <span>当前展示 {{ Math.min(matchedLineCount, tailLines) }} / {{ matchedLineCount }} 行</span>
        <span v-if="searchQuery">关键字 "{{ searchQuery }}"</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.container-logs {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--sm-color-surface-2);
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-lg);
  overflow: hidden;
}

.logs-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sm-space-4);
  padding: var(--sm-space-5);
  border-bottom: 1px solid var(--sm-color-border-subtle);
}

.logs-header__copy {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-2);
}

.logs-header__eyebrow {
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--sm-color-text-tertiary);
}

.logs-header__headline {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--sm-space-2);
}

.logs-header__headline h2 {
  margin: 0;
  font-size: 18px;
  color: var(--sm-color-text-primary);
}

.logs-meta {
  font-family: var(--sm-font-mono);
}

.logs-header__copy p {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--sm-color-text-secondary);
}

.header-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sm-space-3);
}

.toggle-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--sm-color-text-secondary);
  cursor: pointer;
}

.toggle-label input {
  margin: 0;
  accent-color: var(--sm-color-accent);
}

.logs-toolbar {
  display: flex;
  align-items: center;
  gap: var(--sm-space-3);
  padding: var(--sm-space-4) var(--sm-space-5);
  border-bottom: 1px solid var(--sm-color-border-subtle);
  background: var(--sm-color-surface-1);
}

.search-input {
  flex: 1;
}

.toolbar-tail {
  display: flex;
  align-items: center;
  gap: var(--sm-space-2);
  font-size: 12px;
  color: var(--sm-color-text-secondary);
  white-space: nowrap;
}

.sm-container-logs__clear-button {
  min-height: 36px;
  padding: 0 12px;
  background: transparent;
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-sm);
  color: var(--sm-color-text-secondary);
  cursor: pointer;
  transition:
    background-color var(--sm-transition-fast),
    border-color var(--sm-transition-fast),
    color var(--sm-transition-fast);
}

.sm-container-logs__clear-button:hover {
  background: rgba(199, 120, 120, 0.08);
  border-color: rgba(199, 120, 120, 0.28);
  color: #c77878;
}

.logs-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--sm-space-5);
  font-family: var(--sm-font-mono);
  font-size: 13px;
  line-height: 1.6;
  background: var(--sm-color-bg-embedded);
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px;
  color: var(--sm-color-text-secondary);
  gap: 16px;
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--sm-color-border-default);
  border-top-color: var(--sm-color-accent);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px;
  color: var(--sm-color-text-secondary);
  text-align: center;
  gap: 12px;
}

.logs-text pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--sm-color-text-primary);
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
}

.no-results {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px;
  color: var(--sm-color-text-secondary);
  text-align: center;
  gap: 12px;
}

.logs-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sm-space-3);
  padding: var(--sm-space-4) var(--sm-space-5);
  background: var(--sm-color-surface-1);
  border-top: 1px solid var(--sm-color-border-subtle);
}

.footer-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--sm-space-3);
  font-size: 12px;
  color: var(--sm-color-text-secondary);
}

.select-sm {
  min-height: 36px;
  padding: 0 32px 0 12px;
  font-size: 12px;
  font-family: var(--sm-font-sans);
  background: var(--sm-color-surface-2);
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-sm);
  color: var(--sm-color-text-primary);
  cursor: pointer;
  appearance: none;
  background-image: var(--icon-arrow-down-svg);
  background-repeat: no-repeat;
  background-position: right 12px center;
}

@media (max-width: 920px) {
  .logs-header,
  .logs-toolbar,
  .logs-footer {
    flex-direction: column;
    align-items: stretch;
  }

  .header-actions {
    justify-content: flex-start;
  }
}
</style>
