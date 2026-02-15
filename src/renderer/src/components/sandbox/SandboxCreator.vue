<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useSandboxStore } from '@renderer/stores'
import type { ComposeOptions, ContainerState } from '@shared/types/sandbox'

// ==================== Props & Emits ====================

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'create-from-compose', content: string, options?: ComposeOptions): void
  (e: 'create-from-dockerfile', dockerfile: string, context: string): void
  (e: 'select-container', containerId: string): void
}>()

// ==================== Store ====================

const sandboxStore = useSandboxStore()
const { containers, isLoading: storeLoading } = storeToRefs(sandboxStore)

// ==================== State ====================

type CreateType = 'compose' | 'dockerfile' | 'existing'

const createType = ref<CreateType>('compose')

// Docker Compose 表单
const composeContent = ref('')
const composeProjectName = ref('')

// Dockerfile 表单
const dockerfileContent = ref('')
const dockerfileContext = ref('')

// 容器浏览器状态
const containerSearchQuery = ref('')
const containerFilter = ref<'all' | 'running' | 'stopped'>('all')
const selectedContainerId = ref<string | null>(null)

// 预设 Compose 示例
const composeExample = `version: '3.8'

services:
  app:
    image: node:18-alpine
    working_dir: /app
    volumes:
      - ./:/app
    command: sh -c "npm install && npm start"
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
`

// 预设 Dockerfile 示例
const dockerfileExample = `FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
`

// ==================== Computed ====================

const canCreate = computed(() => {
  switch (createType.value) {
    case 'compose':
      return composeContent.value.trim().length > 0
    case 'dockerfile':
      return dockerfileContent.value.trim().length > 0
    case 'existing':
      return selectedContainerId.value !== null
    default:
      return false
  }
})

const filteredContainers = computed(() => {
  let result = containers.value

  if (containerFilter.value !== 'all') {
    if (containerFilter.value === 'running') {
      result = result.filter((c) => c.state === 'running')
    } else if (containerFilter.value === 'stopped') {
      result = result.filter((c) => c.state === 'exited' || c.state === 'dead')
    }
  }

  if (containerSearchQuery.value.trim()) {
    const query = containerSearchQuery.value.toLowerCase()
    result = result.filter(
      (c) =>
        c.names.some((n) => n.toLowerCase().includes(query)) ||
        c.image.toLowerCase().includes(query)
    )
  }

  return result
})

const runningCount = computed(() => containers.value.filter((c) => c.state === 'running').length)
const stoppedCount = computed(
  () => containers.value.filter((c) => c.state === 'exited' || c.state === 'dead').length
)

// ==================== Watch ====================

watch(
  () => props.visible,
  async (visible) => {
    if (visible) {
      createType.value = 'compose'
      composeContent.value = composeExample
      dockerfileContent.value = dockerfileExample
      selectedContainerId.value = null
      containerSearchQuery.value = ''
      containerFilter.value = 'all'
      await sandboxStore.loadContainers()
    }
  }
)

watch(createType, async (newType) => {
  if (newType === 'existing' && containers.value.length === 0) {
    await sandboxStore.loadContainers()
  }
})

// ==================== Methods ====================

function close(): void {
  emit('close')
}

function handleCreate(): void {
  switch (createType.value) {
    case 'compose':
      emit('create-from-compose', composeContent.value, {
        projectName: composeProjectName.value || undefined
      })
      break
    case 'dockerfile':
      emit('create-from-dockerfile', dockerfileContent.value, dockerfileContext.value)
      break
    case 'existing':
      if (selectedContainerId.value) {
        emit('select-container', selectedContainerId.value)
      }
      break
  }
}

function useExample(type: 'compose' | 'dockerfile'): void {
  if (type === 'compose') {
    composeContent.value = composeExample
  } else {
    dockerfileContent.value = dockerfileExample
  }
}

function getStateLabel(state: ContainerState): string {
  const labels: Record<ContainerState, string> = {
    created: '已创建',
    running: '运行中',
    paused: '已暂停',
    restarting: '重启中',
    removing: '删除中',
    exited: '已停止',
    dead: '已终止'
  }
  return labels[state] || state
}

function getStateClass(state: ContainerState): string {
  return `state-${state}`
}

function formatCreated(timestamp: number): string {
  const date = new Date(timestamp * 1000)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days < 30) return `${days}天前`
  return date.toLocaleDateString('zh-CN')
}

function selectContainer(containerId: string): void {
  selectedContainerId.value = selectedContainerId.value === containerId ? null : containerId
}

async function refreshContainers(): Promise<void> {
  await sandboxStore.loadContainers()
}
</script>

<template>
  <div v-if="visible" class="sandbox-creator-overlay" @click.self="close">
    <div class="sandbox-creator">
      <!-- 头部 -->
      <div class="creator-header">
        <h2>创建新沙箱</h2>
        <button class="close-btn" @click="close">×</button>
      </div>

      <!-- 创建方式选择 -->
      <div class="creator-type-selection">
        <label class="type-option" :class="{ active: createType === 'existing' }">
          <input v-model="createType" type="radio" value="existing" />
          <span class="option-label">选择已有容器</span>
        </label>
        <label class="type-option" :class="{ active: createType === 'compose' }">
          <input v-model="createType" type="radio" value="compose" />
          <span class="option-label">Docker Compose</span>
        </label>
        <label class="type-option" :class="{ active: createType === 'dockerfile' }">
          <input v-model="createType" type="radio" value="dockerfile" />
          <span class="option-label">Dockerfile</span>
        </label>
      </div>

      <!-- 选择已有容器 -->
      <div v-if="createType === 'existing'" class="creator-section container-browser-section">
        <div class="browser-header">
          <div class="search-section">
            <input
              v-model="containerSearchQuery"
              type="text"
              class="input search-input"
              placeholder="搜索容器..."
            />
            <button class="btn refresh-btn" :disabled="storeLoading" @click="refreshContainers">
              刷新
            </button>
          </div>

          <div class="filter-section">
            <button
              class="filter-btn"
              :class="{ active: containerFilter === 'all' }"
              @click="containerFilter = 'all'"
            >
              全部 ({{ containers.length }})
            </button>
            <button
              class="filter-btn"
              :class="{ active: containerFilter === 'running' }"
              @click="containerFilter = 'running'"
            >
              运行中 ({{ runningCount }})
            </button>
            <button
              class="filter-btn"
              :class="{ active: containerFilter === 'stopped' }"
              @click="containerFilter = 'stopped'"
            >
              已停止 ({{ stoppedCount }})
            </button>
          </div>
        </div>

        <div class="container-list">
          <div v-if="storeLoading" class="loading-state">
            <div class="loading-spinner"></div>
            <p>加载容器中...</p>
          </div>

          <div v-else-if="filteredContainers.length === 0" class="empty-state">
            <p class="empty-title">暂无容器</p>
            <p class="empty-desc">Docker 中没有发现容器，请使用其他方式创建沙箱</p>
          </div>

          <div
            v-for="container in filteredContainers"
            :key="container.id"
            class="container-card"
            :class="{
              active: container.id === selectedContainerId,
              running: container.state === 'running'
            }"
            @click="selectContainer(container.id)"
          >
            <div class="container-header">
              <div class="container-title">
                <span class="state-indicator" :class="getStateClass(container.state)"></span>
                <span class="container-name">{{
                  container.names[0]?.replace(/^\//, '') || '未命名'
                }}</span>
              </div>
              <span class="container-state" :class="getStateClass(container.state)">
                {{ getStateLabel(container.state) }}
              </span>
            </div>

            <div class="container-info">
              <div class="info-row">
                <span class="info-label">镜像</span>
                <span class="info-value" :title="container.image">{{ container.image }}</span>
              </div>
              <div class="info-row">
                <span class="info-label">创建时间</span>
                <span class="info-value">{{ formatCreated(container.created) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Docker Compose 编辑 -->
      <div v-else-if="createType === 'compose'" class="creator-section">
        <h3>Docker Compose 配置</h3>
        <div class="form-field">
          <label>项目名称（可选）</label>
          <input v-model="composeProjectName" type="text" class="input" placeholder="my-project" />
        </div>
        <div class="form-field">
          <label>
            docker-compose.yaml
            <button class="btn-link" @click="useExample('compose')">使用示例</button>
          </label>
          <textarea
            v-model="composeContent"
            class="code-editor"
            placeholder="输入 Docker Compose 配置..."
            spellcheck="false"
          ></textarea>
        </div>
      </div>

      <!-- Dockerfile 编辑 -->
      <div v-else-if="createType === 'dockerfile'" class="creator-section">
        <h3>Dockerfile 配置</h3>
        <div class="form-field">
          <label>构建上下文路径（可选）</label>
          <input v-model="dockerfileContext" type="text" class="input" placeholder="./my-app" />
        </div>
        <div class="form-field">
          <label>
            Dockerfile
            <button class="btn-link" @click="useExample('dockerfile')">使用示例</button>
          </label>
          <textarea
            v-model="dockerfileContent"
            class="code-editor"
            placeholder="输入 Dockerfile 内容..."
            spellcheck="false"
          ></textarea>
        </div>
      </div>

      <!-- 底部按钮 -->
      <div class="creator-footer">
        <button class="btn" @click="close">取消</button>
        <button class="btn-primary" :disabled="!canCreate" @click="handleCreate">
          {{ createType === 'existing' ? '选择并使用' : '创建并运行' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sandbox-creator-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.sandbox-creator {
  background-color: var(--theme-bg);
  border: 1px solid var(--theme-border);
  border-radius: 8px;
  width: 90%;
  max-width: 900px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 头部 */
.creator-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--theme-border);
}

.creator-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.close-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  border-radius: 4px;
  color: var(--theme-text-secondary);
  font-size: 24px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.close-btn:hover {
  background-color: var(--theme-bg-secondary);
  color: var(--theme-text);
}

/* 创建方式选择 */
.creator-type-selection {
  display: flex;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--theme-border);
  background-color: var(--theme-bg-secondary);
}

.type-option {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 8px;
  background-color: var(--theme-bg);
  border: 2px solid var(--theme-border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.type-option input {
  display: none;
}

.type-option:hover {
  border-color: var(--theme-text-secondary);
}

.type-option.active {
  border-color: var(--theme-accent);
  background-color: rgba(63, 185, 80, 0.05);
}

.option-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--theme-text);
}

/* 内容区域 */
.creator-section {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.creator-section h3 {
  margin: 0 0 16px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--theme-text);
}

/* 容器浏览器区域 */
.container-browser-section {
  display: flex;
  flex-direction: column;
  padding: 0;
}

.browser-header {
  padding: 16px;
  border-bottom: 1px solid var(--theme-border);
  background-color: var(--theme-bg);
}

.search-section {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.search-input {
  flex: 1;
}

.refresh-btn {
  padding: 8px 12px;
  font-size: 14px;
}

.filter-section {
  display: flex;
  gap: 8px;
}

.filter-btn {
  padding: 6px 12px;
  font-size: 13px;
  font-family: var(--theme-font);
  background-color: transparent;
  border: 1px solid var(--theme-border);
  border-radius: 4px;
  color: var(--theme-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.filter-btn:hover {
  border-color: var(--theme-text-secondary);
  color: var(--theme-text);
}

.filter-btn.active {
  background-color: var(--theme-accent);
  border-color: var(--theme-accent);
  color: var(--theme-bg);
}

.container-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 400px;
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
}

.empty-title {
  font-size: 16px;
  font-weight: 500;
  color: var(--theme-text);
  margin: 0 0 8px 0;
}

.empty-desc {
  font-size: 14px;
  margin: 0;
}

/* 容器卡片样式 */
.container-card {
  background-color: var(--theme-bg-secondary);
  border: 2px solid var(--theme-border);
  border-radius: 8px;
  padding: 12px 16px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.container-card:hover {
  border-color: var(--theme-text-secondary);
}

.container-card.active {
  border-color: var(--theme-accent);
  background-color: rgba(63, 185, 80, 0.1);
}

.container-card.running {
  border-left: 3px solid var(--theme-success);
}

.container-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.container-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.state-indicator {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.container-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--theme-text);
}

.container-state {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
  font-weight: 500;
}

.state-created {
  background-color: rgba(88, 166, 255, 0.2);
  color: var(--theme-info);
}

.state-created.state-indicator {
  background-color: var(--theme-info);
}

.state-running {
  background-color: rgba(63, 185, 80, 0.2);
  color: var(--theme-success);
}

.state-running.state-indicator {
  background-color: var(--theme-success);
}

.state-paused {
  background-color: rgba(210, 153, 34, 0.2);
  color: var(--theme-warning);
}

.state-paused.state-indicator {
  background-color: var(--theme-warning);
}

.state-restarting {
  background-color: rgba(88, 166, 255, 0.2);
  color: var(--theme-info);
}

.state-restarting.state-indicator {
  background-color: var(--theme-info);
}

.state-removing {
  background-color: rgba(139, 148, 158, 0.2);
  color: var(--theme-text-secondary);
}

.state-removing.state-indicator {
  background-color: var(--theme-text-secondary);
}

.state-exited,
.state-dead {
  background-color: rgba(248, 81, 73, 0.2);
  color: var(--theme-danger);
}

.state-exited.state-indicator,
.state-dead.state-indicator {
  background-color: var(--theme-danger);
}

.container-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.info-label {
  color: var(--theme-text-secondary);
  min-width: 60px;
  flex-shrink: 0;
}

.info-value {
  color: var(--theme-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 表单字段 */
.form-field {
  margin-bottom: 16px;
}

.form-field label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: var(--theme-text-secondary);
  margin-bottom: 8px;
}

.btn-link {
  background: none;
  border: none;
  color: var(--theme-accent);
  font-size: 12px;
  cursor: pointer;
  text-decoration: underline;
}

.code-editor {
  width: 100%;
  min-height: 300px;
  padding: 12px;
  font-family: var(--theme-font);
  font-size: 13px;
  line-height: 1.5;
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 6px;
  color: var(--theme-text);
  resize: vertical;
  white-space: pre;
  tab-size: 2;
}

.code-editor:focus {
  outline: none;
  border-color: var(--theme-accent);
}

/* 底部按钮 */
.creator-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--theme-border);
  background-color: var(--theme-bg-secondary);
}
</style>
