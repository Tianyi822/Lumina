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

const filteredLogs = computed(() => {
  if (!searchQuery.value.trim()) {
    return props.logs
  }
  const lines = props.logs.split('\n')
  const query = searchQuery.value.toLowerCase()
  return lines.filter((line) => line.toLowerCase().includes(query)).join('\n')
})

const lineCount = computed(() => {
  return props.logs.split('\n').filter((line) => line.trim()).length
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
    <!-- 头部工具栏 -->
    <div class="logs-header">
      <div class="header-info">
        <span class="container-name">日志: {{ containerName }}</span>
        <span class="logs-meta">{{ lineCount }} 行</span>
      </div>
      <div class="header-actions">
        <label class="toggle-label">
          <input v-model="autoScroll" type="checkbox" />
          <span>自动滚动</span>
        </label>
        <button class="btn-sm" @click="handleRefresh">刷新</button>
        <button class="btn-sm" @click="handleExport">导出</button>
      </div>
    </div>

    <!-- 搜索栏 -->
    <div class="logs-search">
      <input
        v-model="searchQuery"
        type="text"
        class="input search-input"
        placeholder="搜索日志内容..."
      />
      <button v-if="searchQuery" class="btn-clear" @click="handleClearSearch">×</button>
    </div>

    <!-- 日志内容 -->
    <div ref="logsContainerRef" class="logs-content">
      <div v-if="loading" class="loading-state">
        <div class="loading-spinner"></div>
        <p>加载日志中...</p>
      </div>

      <div v-else-if="!logs" class="empty-state">
        <p>暂无日志</p>
        <button class="btn-sm" @click="handleRefresh">刷新</button>
      </div>

      <div v-else-if="filteredLogs" class="logs-text">
        <pre>{{ filteredLogs }}</pre>
      </div>

      <div v-else class="no-results">
        <p>未找到匹配 "{{ searchQuery }}" 的日志</p>
        <button class="btn-sm" @click="handleClearSearch">清除搜索</button>
      </div>
    </div>

    <!-- 底部工具栏 -->
    <div class="logs-footer">
      <div class="tail-selector">
        <label>显示最后:</label>
        <select v-model="tailLines" class="select-sm">
          <option :value="50">50 行</option>
          <option :value="100">100 行</option>
          <option :value="200">200 行</option>
          <option :value="500">500 行</option>
          <option :value="1000">1000 行</option>
        </select>
      </div>
      <div v-if="searchQuery" class="search-info">搜索: "{{ searchQuery }}"</div>
    </div>
  </div>
</template>

<style scoped>
.container-logs {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: #0d1117;
  border: 1px solid var(--theme-border);
  border-radius: 8px;
  overflow: hidden;
}

/* 头部 */
.logs-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background-color: var(--theme-bg);
  border-bottom: 1px solid var(--theme-border);
}

.header-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.container-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--theme-text);
}

.logs-meta {
  font-size: 12px;
  color: var(--theme-text-secondary);
  padding: 2px 8px;
  background-color: var(--theme-bg-secondary);
  border-radius: 10px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.toggle-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--theme-text-secondary);
  cursor: pointer;
}

.toggle-label input {
  margin: 0;
}

.btn-sm {
  padding: 4px 10px;
  font-size: 12px;
  font-family: var(--theme-font);
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 4px;
  color: var(--theme-text);
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-sm:hover {
  border-color: var(--theme-accent);
  color: var(--theme-accent);
}

/* 搜索栏 */
.logs-search {
  position: relative;
  padding: 8px 16px;
  background-color: var(--theme-bg);
  border-bottom: 1px solid var(--theme-border);
}

.search-input {
  width: 100%;
  padding-right: 32px;
}

.btn-clear {
  position: absolute;
  right: 20px;
  top: 50%;
  transform: translateY(-50%);
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--theme-border);
  border: none;
  border-radius: 50%;
  color: var(--theme-text-secondary);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-clear:hover {
  background-color: var(--theme-danger);
  color: white;
}

/* 日志内容 */
.logs-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  font-family: var(--theme-font);
  font-size: 13px;
  line-height: 1.5;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px;
  color: var(--theme-text-secondary);
  gap: 16px;
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--theme-border);
  border-top-color: var(--theme-accent);
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
  color: var(--theme-text-secondary);
  text-align: center;
  gap: 12px;
}

.logs-text pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  color: #c9d1d9;
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
  color: var(--theme-text-secondary);
  text-align: center;
  gap: 12px;
}

/* 底部工具栏 */
.logs-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background-color: var(--theme-bg);
  border-top: 1px solid var(--theme-border);
}

.tail-selector {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--theme-text-secondary);
}

.select-sm {
  padding: 4px 8px;
  font-size: 12px;
  font-family: var(--theme-font);
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 4px;
  color: var(--theme-text);
  cursor: pointer;
}

.search-info {
  font-size: 12px;
  color: var(--theme-accent);
}
</style>
