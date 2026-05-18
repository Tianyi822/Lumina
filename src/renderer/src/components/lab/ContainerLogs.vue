<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import styles from './ContainerLogs.module.css'

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
  <div :class="styles['container-logs']">
    <div :class="styles['logs-header']">
      <div :class="styles['logs-header__copy']">
        <span :class="styles['logs-header__eyebrow']">容器日志</span>
        <div :class="styles['logs-header__headline']">
          <h2>{{ containerName }}</h2>
          <span :class="[styles['logs-meta']]">{{ containerId.substring(0, 12) }}</span>
          <span :class="[styles['logs-meta']]">{{ lineCount }} 行</span>
        </div>
        <p>检索容器输出，定位最近的服务状态和运行异常。</p>
      </div>
      <div :class="styles['header-actions']">
        <label :class="styles['toggle-label']">
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

    <div :class="styles['logs-toolbar']">
      <input
        v-model="searchQuery"
        type="text"
        :class="[styles['search-input']]"
        placeholder="搜索日志内容"
      />
      <div :class="styles['toolbar-tail']">
        <label for="tail-lines">显示最近</label>
        <select id="tail-lines" v-model="tailLines" :class="styles['select-sm']">
          <option :value="50">50 行</option>
          <option :value="100">100 行</option>
          <option :value="200">200 行</option>
          <option :value="500">500 行</option>
          <option :value="1000">1000 行</option>
        </select>
      </div>
      <button
        v-if="searchQuery"
        :class="styles['sm-container-logs__clear-button']"
        @click="handleClearSearch"
      >
        清除
      </button>
    </div>

    <div ref="logsContainerRef" :class="styles['logs-content']">
      <div v-if="loading" :class="styles['loading-state']">
        <div :class="styles['loading-spinner']"></div>
        <p>加载日志中...</p>
      </div>

      <div v-else-if="!logs" :class="styles['empty-state']">
        <p>暂无日志</p>
        <button class="sm-button sm-button--secondary sm-button--small" @click="handleRefresh">
          刷新
        </button>
      </div>

      <div v-else-if="filteredLogs" :class="styles['logs-text']">
        <pre>{{ filteredLogs }}</pre>
      </div>

      <div v-else :class="styles['no-results']">
        <p>未找到匹配 "{{ searchQuery }}" 的日志</p>
        <button class="sm-button sm-button--secondary sm-button--small" @click="handleClearSearch">
          清除搜索
        </button>
      </div>
    </div>

    <div :class="styles['logs-footer']">
      <div :class="styles['footer-meta']">
        <span
          >当前展示 {{ Math.min(matchedLineCount, tailLines) }} / {{ matchedLineCount }} 行</span
        >
        <span v-if="searchQuery">关键字 "{{ searchQuery }}"</span>
      </div>
    </div>
  </div>
</template>
