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
  <div v-if="visible" class="sm-modal__overlay config-manager-overlay" @click.self="close">
    <div class="sm-modal__surface config-manager">
      <div class="sm-pane-header manager-header">
        <div class="manager-heading">

          <div class="manager-title-row">
            <h2>Docker 模板资产</h2>
            <span class="sm-badge">{{ currentConfigs.length }}</span>
          </div>
          <p>统一维护 Dockerfile 与 Compose 模板，供实验室创建流程复用。</p>
        </div>
        <button class="sm-button sm-button--secondary sm-button--small" @click="close">关闭</button>
      </div>

      <div class="manager-tabs">
        <button
          class="sm-tab manager-tab"
          :class="{ 'is-active': activeTab === 'dockerfile' }"
          @click="activeTab = 'dockerfile'"
        >
          Dockerfile
        </button>
        <button
          class="sm-tab manager-tab"
          :class="{ 'is-active': activeTab === 'compose' }"
          @click="activeTab = 'compose'"
        >
          Docker Compose
        </button>
      </div>

      <div class="manager-body">
        <div class="config-list">
          <div class="list-header">
            <div class="list-heading">
              <span class="list-eyebrow">模板列表</span>
              <strong>{{ activeTab === 'dockerfile' ? 'Dockerfile 模板' : 'Compose 模板' }}</strong>
            </div>
            <span class="sm-badge count">{{ currentConfigs.length }}</span>
          </div>
          <div v-if="configsLoading" class="sm-empty list-state">加载配置中...</div>
          <div v-else-if="currentConfigs.length === 0" class="sm-empty list-state">
            暂无{{ activeTab === 'dockerfile' ? 'Dockerfile' : 'Compose' }}配置
          </div>
          <div v-else class="list-items">
            <button
              v-for="config in currentConfigs"
              :key="config.id"
              class="list-item"
              :class="{ selected: selectedId === config.id }"
              type="button"
              @click="selectConfig(config.id)"
            >
              <div class="item-name">{{ config.name }}</div>
              <div class="item-date">更新于 {{ formatDate(config.updatedAt) }}</div>
            </button>
          </div>
        </div>

        <div class="config-detail">
          <template v-if="selectedConfig">
            <div class="detail-header">
              <template v-if="isEditing">
                <input
                  v-model="editingName"
                  type="text"
                  class="name-input sm-input"
                  placeholder="配置名称"
                />
              </template>
              <template v-else>
                <h3 class="detail-title">{{ selectedConfig.name }}</h3>
                <button
                  class="sm-button sm-button--secondary sm-button--small"
                  @click="startEditing"
                >
                  编辑
                </button>
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
                <button class="sm-button sm-button--secondary" @click="cancelEditing">取消</button>
                <button
                  class="sm-button sm-button--primary"
                  :disabled="!editingName.trim()"
                  @click="saveChanges"
                >
                  保存更改
                </button>
              </template>
              <template v-else>
                <template v-if="deleteConfirmId === selectedConfig.id">
                  <span class="delete-hint">确定删除？</span>
                  <button class="sm-button sm-button--secondary" @click="cancelDelete">取消</button>
                  <button
                    class="sm-button sm-button--danger"
                    @click="deleteConfig(selectedConfig.id)"
                  >
                    确认删除
                  </button>
                </template>
                <template v-else>
                  <button
                    class="sm-button sm-button--danger"
                    @click="confirmDelete(selectedConfig.id)"
                  >
                    删除配置
                  </button>
                </template>
              </template>
            </div>
          </template>
          <template v-else>
            <div class="sm-empty detail-empty">
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
  z-index: 1100;
}

.config-manager {
  width: min(1120px, calc(100vw - 72px));
  height: min(820px, calc(100vh - 104px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  -webkit-app-region: no-drag;
}

.manager-heading {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-2);
}

.manager-eyebrow,
.list-eyebrow {
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--sm-color-text-tertiary);
}

.manager-title-row {
  display: flex;
  align-items: center;
  gap: var(--sm-space-3);
}

.manager-header {
  flex-shrink: 0;
}

.manager-header h2 {
  margin: 0;
  font-size: 18px;
  color: var(--sm-color-text-primary);
}

.manager-header p {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--sm-color-text-secondary);
}

.manager-tabs {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: var(--sm-space-2);
  padding: var(--sm-space-3) var(--sm-space-5);
  border-bottom: 1px solid var(--sm-color-border-subtle);
  -webkit-app-region: no-drag;
}

.manager-tab {
  position: relative;
  z-index: 1;
  -webkit-app-region: no-drag;
}

.manager-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  overflow: hidden;
}

.config-list {
  min-height: 0;
  border-right: 1px solid var(--sm-color-border-subtle);
  display: flex;
  flex-direction: column;
  background: var(--sm-color-surface-1);
}

.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sm-space-3);
  padding: var(--sm-space-4);
  border-bottom: 1px solid var(--sm-color-border-subtle);
}

.list-heading {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.list-heading strong {
  font-size: 14px;
  color: var(--sm-color-text-primary);
}

.list-state {
  flex: 1;
  margin: var(--sm-space-4);
  background: var(--sm-color-surface-2);
}

.list-items {
  flex: 1;
  overflow-y: auto;
  padding: var(--sm-space-3);
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-2);
}

.list-item {
  width: 100%;
  text-align: left;
  font: inherit;
  color: inherit;
  padding: 12px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--sm-radius-md);
  cursor: pointer;
  transition:
    background-color var(--sm-transition-fast),
    border-color var(--sm-transition-fast);
}

.list-item:hover {
  background: var(--sm-color-surface-2);
  border-color: var(--sm-color-border-default);
}

.list-item.selected {
  background: var(--sm-color-surface-selected);
  border-color: var(--sm-color-border-selected);
}

.item-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
  margin-bottom: 4px;
}

.item-date {
  font-size: 11px;
  color: var(--sm-color-text-secondary);
}

.config-detail {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--sm-color-surface-2);
}

.detail-header {
  display: flex;
  align-items: center;
  gap: var(--sm-space-3);
  padding: var(--sm-space-5);
  border-bottom: 1px solid var(--sm-color-border-subtle);
}

.detail-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  flex: 1;
  color: var(--sm-color-text-primary);
}

.name-input {
  flex: 1;
}

.detail-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sm-space-3);
  padding: 0 var(--sm-space-5) var(--sm-space-4);
  font-size: 12px;
  color: var(--sm-color-text-secondary);
}

.detail-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-3);
  padding: 0 var(--sm-space-5) var(--sm-space-5);
  overflow: hidden;
}

.content-label {
  font-size: 12px;
  color: var(--sm-color-text-secondary);
}

.code-editor {
  flex: 1;
  min-height: 0;
  padding: 16px;
  font-family: var(--sm-font-mono);
  font-size: 12px;
  line-height: 1.6;
  background: var(--sm-color-bg-embedded);
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-md);
  color: var(--sm-color-text-primary);
  resize: none;
  white-space: pre;
  tab-size: 2;
}

.code-editor:focus {
  outline: none;
  border-color: var(--sm-color-border-accent);
}

.code-editor:read-only {
  background: rgba(11, 11, 12, 0.72);
  cursor: default;
}

.detail-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--sm-space-2);
  padding: var(--sm-space-4) var(--sm-space-5);
  border-top: 1px solid var(--sm-color-border-subtle);
  background: var(--sm-color-surface-1);
}

.delete-hint {
  font-size: 13px;
  color: #c77878;
  margin-right: auto;
}

.detail-empty {
  flex: 1;
  margin: var(--sm-space-5);
  background: var(--sm-color-surface-1);
}

@media (max-width: 900px) {
  .manager-body {
    grid-template-columns: 1fr;
  }

  .config-list {
    border-right: none;
    border-bottom: 1px solid var(--sm-color-border-subtle);
  }
}

@media (max-width: 720px) {
  .config-manager {
    width: calc(100vw - 32px);
    height: calc(100vh - 72px);
  }

  .manager-tabs,
  .detail-header,
  .detail-meta,
  .detail-content,
  .detail-actions {
    padding-left: var(--sm-space-4);
    padding-right: var(--sm-space-4);
  }

  .manager-tabs {
    padding: var(--sm-space-2) var(--sm-space-4);
  }
}
</style>
