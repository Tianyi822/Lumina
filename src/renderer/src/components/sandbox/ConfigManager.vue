<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useDockerConfigStore } from '@renderer/stores'

type ConfigType = 'dockerfile' | 'compose'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const configStore = useDockerConfigStore()
const { dockerfileConfigs, composeConfigs, configsLoading } = storeToRefs(configStore)

const activeTab = ref<ConfigType>('dockerfile')
const selectedId = ref<string | null>(null)
const editingContent = ref('')
const editingName = ref('')
const isEditing = ref(false)
const deleteConfirmId = ref<string | null>(null)

const currentConfigs = computed(() => {
  return activeTab.value === 'dockerfile' ? dockerfileConfigs.value : composeConfigs.value
})

const selectedConfig = computed(() => {
  if (!selectedId.value) return null
  return currentConfigs.value.find((c) => c.id === selectedId.value) ?? null
})

watch(
  () => props.visible,
  async (visible) => {
    if (visible) {
      await configStore.loadAllConfigs()
      selectedId.value = null
      editingContent.value = ''
      editingName.value = ''
      isEditing.value = false
    }
  }
)

watch(activeTab, () => {
  selectedId.value = null
  editingContent.value = ''
  editingName.value = ''
  isEditing.value = false
  deleteConfirmId.value = null
})

async function selectConfig(id: string): Promise<void> {
  selectedId.value = id
  isEditing.value = false
  deleteConfirmId.value = null

  if (activeTab.value === 'dockerfile') {
    const config = await configStore.loadDockerfileConfig(id)
    if (config) {
      editingContent.value = config.content
      editingName.value = config.name
    }
  } else {
    const config = await configStore.loadComposeConfig(id)
    if (config) {
      editingContent.value = config.content
      editingName.value = config.name
    }
  }
}

function startEditing(): void {
  isEditing.value = true
}

function cancelEditing(): void {
  isEditing.value = false
  if (selectedConfig.value) {
    editingName.value = selectedConfig.value.name
  }
}

async function saveChanges(): Promise<void> {
  if (!selectedId.value || !editingName.value.trim()) return

  const trimmedName = editingName.value.trim()

  if (activeTab.value === 'dockerfile') {
    await configStore.saveDockerfileConfig({
      id: selectedId.value,
      name: trimmedName,
      content: editingContent.value
    })
  } else {
    await configStore.saveComposeConfig({
      id: selectedId.value,
      name: trimmedName,
      content: editingContent.value
    })
  }

  isEditing.value = false
}

function confirmDelete(id: string): void {
  deleteConfirmId.value = id
}

function cancelDelete(): void {
  deleteConfirmId.value = null
}

async function deleteConfig(id: string): Promise<void> {
  if (activeTab.value === 'dockerfile') {
    await configStore.deleteDockerfileConfig(id)
  } else {
    await configStore.deleteComposeConfig(id)
  }

  if (selectedId.value === id) {
    selectedId.value = null
    editingContent.value = ''
    editingName.value = ''
    isEditing.value = false
  }
  deleteConfirmId.value = null
}

function close(): void {
  emit('close')
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}
</script>

<template>
  <div v-if="visible" class="config-manager-overlay" @click.self="close">
    <div class="config-manager">
      <div class="manager-header">
        <h2>配置管理</h2>
        <button class="close-btn" @click="close">×</button>
      </div>

      <div class="manager-tabs">
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'dockerfile' }"
          @click="activeTab = 'dockerfile'"
        >
          Dockerfile
        </button>
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'compose' }"
          @click="activeTab = 'compose'"
        >
          Docker Compose
        </button>
      </div>

      <div class="manager-body">
        <div class="config-list">
          <div class="list-header">
            <span>配置列表</span>
            <span class="count">{{ currentConfigs.length }}</span>
          </div>
          <div v-if="configsLoading" class="list-loading">加载中...</div>
          <div v-else-if="currentConfigs.length === 0" class="list-empty">
            暂无{{ activeTab === 'dockerfile' ? 'Dockerfile' : 'Compose' }}配置
          </div>
          <div v-else class="list-items">
            <div
              v-for="config in currentConfigs"
              :key="config.id"
              class="list-item"
              :class="{ selected: selectedId === config.id }"
              @click="selectConfig(config.id)"
            >
              <div class="item-name">{{ config.name }}</div>
              <div class="item-date">{{ formatDate(config.updatedAt) }}</div>
            </div>
          </div>
        </div>

        <div class="config-detail">
          <template v-if="selectedConfig">
            <div class="detail-header">
              <template v-if="isEditing">
                <input
                  v-model="editingName"
                  type="text"
                  class="name-input"
                  placeholder="配置名称"
                />
              </template>
              <template v-else>
                <h3 class="detail-title">{{ selectedConfig.name }}</h3>
                <button class="btn-icon" title="编辑" @click="startEditing">✎</button>
              </template>
            </div>

            <div class="detail-meta">
              <span>创建: {{ formatDate(selectedConfig.createdAt) }}</span>
              <span>更新: {{ formatDate(selectedConfig.updatedAt) }}</span>
            </div>

            <div class="detail-content">
              <label class="content-label">
                {{ activeTab === 'dockerfile' ? 'Dockerfile' : 'docker-compose.yaml' }}
              </label>
              <textarea
                v-model="editingContent"
                class="code-editor"
                :readonly="!isEditing"
                spellcheck="false"
              ></textarea>
            </div>

            <div class="detail-actions">
              <template v-if="isEditing">
                <button class="btn" @click="cancelEditing">取消</button>
                <button class="btn-primary" :disabled="!editingName.trim()" @click="saveChanges">
                  保存更改
                </button>
              </template>
              <template v-else>
                <template v-if="deleteConfirmId === selectedConfig.id">
                  <span class="delete-hint">确定删除？</span>
                  <button class="btn" @click="cancelDelete">取消</button>
                  <button class="btn-danger" @click="deleteConfig(selectedConfig.id)">
                    确认删除
                  </button>
                </template>
                <template v-else>
                  <button class="btn-danger" @click="confirmDelete(selectedConfig.id)">
                    删除配置
                  </button>
                </template>
              </template>
            </div>
          </template>
          <template v-else>
            <div class="detail-empty">
              <p>选择左侧配置查看详情</p>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.config-manager-overlay {
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

.config-manager {
  background-color: var(--theme-bg);
  border: 1px solid var(--theme-border);
  border-radius: 8px;
  width: 90%;
  max-width: 1000px;
  height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.manager-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--theme-border);
}

.manager-header h2 {
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

.manager-tabs {
  display: flex;
  gap: 0;
  padding: 0 20px;
  border-bottom: 1px solid var(--theme-border);
  background-color: var(--theme-bg-secondary);
}

.tab-btn {
  padding: 12px 20px;
  font-size: 13px;
  font-family: var(--theme-font);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--theme-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.tab-btn:hover {
  color: var(--theme-text);
}

.tab-btn.active {
  color: var(--theme-accent);
  border-bottom-color: var(--theme-accent);
}

.manager-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.config-list {
  width: 280px;
  border-right: 1px solid var(--theme-border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  font-size: 13px;
  font-weight: 500;
  color: var(--theme-text-secondary);
  border-bottom: 1px solid var(--theme-border);
}

.count {
  background-color: var(--theme-bg-secondary);
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
}

.list-loading,
.list-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--theme-text-secondary);
  font-size: 13px;
}

.list-items {
  flex: 1;
  overflow-y: auto;
}

.list-item {
  padding: 12px 16px;
  border-bottom: 1px solid var(--theme-border);
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.list-item:hover {
  background-color: var(--theme-bg-secondary);
}

.list-item.selected {
  background-color: rgba(63, 185, 80, 0.1);
  border-left: 3px solid var(--theme-accent);
  padding-left: 13px;
}

.item-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--theme-text);
  margin-bottom: 4px;
}

.item-date {
  font-size: 11px;
  color: var(--theme-text-secondary);
}

.config-detail {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.detail-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--theme-border);
}

.detail-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  flex: 1;
}

.name-input {
  flex: 1;
  padding: 8px 12px;
  font-size: 14px;
  font-family: var(--theme-font);
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 4px;
  color: var(--theme-text);
}

.name-input:focus {
  outline: none;
  border-color: var(--theme-accent);
}

.btn-icon {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: 1px solid var(--theme-border);
  border-radius: 4px;
  color: var(--theme-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-icon:hover {
  background-color: var(--theme-bg-secondary);
  color: var(--theme-text);
  border-color: var(--theme-text-secondary);
}

.detail-meta {
  display: flex;
  gap: 16px;
  padding: 8px 20px;
  font-size: 12px;
  color: var(--theme-text-secondary);
  background-color: var(--theme-bg-secondary);
}

.detail-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px 20px;
  overflow: hidden;
}

.content-label {
  font-size: 12px;
  color: var(--theme-text-secondary);
  margin-bottom: 8px;
}

.code-editor {
  flex: 1;
  padding: 12px;
  font-family: var(--theme-font);
  font-size: 13px;
  line-height: 1.5;
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 6px;
  color: var(--theme-text);
  resize: none;
  white-space: pre;
  tab-size: 2;
}

.code-editor:focus {
  outline: none;
  border-color: var(--theme-accent);
}

.code-editor:read-only {
  background-color: var(--theme-bg);
  cursor: default;
}

.detail-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--theme-border);
  background-color: var(--theme-bg-secondary);
}

.delete-hint {
  font-size: 13px;
  color: var(--theme-danger);
  margin-right: auto;
}

.detail-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--theme-text-secondary);
}

.btn {
  padding: 6px 12px;
  font-size: 13px;
  font-family: var(--theme-font);
  background-color: var(--theme-bg);
  border: 1px solid var(--theme-border);
  border-radius: 4px;
  color: var(--theme-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn:hover {
  border-color: var(--theme-text-secondary);
  color: var(--theme-text);
}

.btn-primary {
  padding: 6px 12px;
  font-size: 13px;
  font-family: var(--theme-font);
  background-color: var(--theme-accent);
  border: 1px solid var(--theme-accent);
  border-radius: 4px;
  color: var(--theme-bg);
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-danger {
  padding: 6px 12px;
  font-size: 13px;
  font-family: var(--theme-font);
  background-color: var(--theme-danger);
  border: 1px solid var(--theme-danger);
  border-radius: 4px;
  color: #fff;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-danger:hover {
  opacity: 0.9;
}
</style>
