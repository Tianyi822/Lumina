<script setup lang="ts">
import { ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useDockerConfigStore } from '@renderer/stores'
import type {
  DockerfileConfigMeta,
  ComposeConfigMeta,
  DockerfileConfig,
  ComposeConfig
} from '@shared/types/sandbox'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'select-dockerfile', config: DockerfileConfig): void
  (e: 'select-compose', config: ComposeConfig): void
}>()

const configStore = useDockerConfigStore()
const { dockerfileConfigs, composeConfigs, configsLoading } = storeToRefs(configStore)

type ConfigType = 'dockerfile' | 'compose'

const activeTab = ref<ConfigType>('dockerfile')
const viewingConfig = ref<DockerfileConfig | ComposeConfig | null>(null)
const showDeleteConfirm = ref(false)
const deletingConfigId = ref<string | null>(null)
const deletingConfigName = ref('')

watch(
  () => props.visible,
  async (visible) => {
    if (visible) {
      activeTab.value = 'dockerfile'
      viewingConfig.value = null
      await configStore.loadDockerfileConfigs()
      await configStore.loadComposeConfigs()
    }
  }
)

function close(): void {
  emit('close')
}

async function viewDockerfile(config: DockerfileConfigMeta): Promise<void> {
  const fullConfig = await configStore.loadDockerfileConfig(config.id)
  if (fullConfig) {
    viewingConfig.value = fullConfig
  }
}

async function viewCompose(config: ComposeConfigMeta): Promise<void> {
  const fullConfig = await configStore.loadComposeConfig(config.id)
  if (fullConfig) {
    viewingConfig.value = fullConfig
  }
}

function closeViewer(): void {
  viewingConfig.value = null
}

function confirmDelete(id: string, name: string): void {
  deletingConfigId.value = id
  deletingConfigName.value = name
  showDeleteConfirm.value = true
}

function cancelDelete(): void {
  showDeleteConfirm.value = false
  deletingConfigId.value = null
  deletingConfigName.value = ''
}

async function handleDelete(): Promise<void> {
  if (!deletingConfigId.value) return

  if (activeTab.value === 'dockerfile') {
    await configStore.deleteDockerfileConfig(deletingConfigId.value)
  } else {
    await configStore.deleteComposeConfig(deletingConfigId.value)
  }

  if (viewingConfig.value?.id === deletingConfigId.value) {
    viewingConfig.value = null
  }

  cancelDelete()
}

async function useConfig(): Promise<void> {
  if (!viewingConfig.value) return

  if (activeTab.value === 'dockerfile') {
    emit('select-dockerfile', viewingConfig.value as DockerfileConfig)
  } else {
    emit('select-compose', viewingConfig.value as ComposeConfig)
  }

  close()
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
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
        <h2>Docker 配置管理</h2>
        <button class="close-btn" @click="close">×</button>
      </div>

      <div class="manager-tabs">
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'dockerfile' }"
          @click="
            activeTab = 'dockerfile'
            viewingConfig = null
          "
        >
          Dockerfile ({{ dockerfileConfigs.length }})
        </button>
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'compose' }"
          @click="
            activeTab = 'compose'
            viewingConfig = null
          "
        >
          Docker Compose ({{ composeConfigs.length }})
        </button>
      </div>

      <div class="manager-content">
        <div v-if="configsLoading" class="loading-state">
          <div class="loading-spinner"></div>
          <p>加载中...</p>
        </div>

        <template v-else-if="!viewingConfig">
          <!-- Dockerfile 列表 -->
          <div v-if="activeTab === 'dockerfile'" class="config-list">
            <div v-if="dockerfileConfigs.length === 0" class="empty-state">
              <p class="empty-title">暂无 Dockerfile 配置</p>
              <p class="empty-desc">在创建实验室时保存的 Dockerfile 配置会显示在这里</p>
            </div>
            <div v-for="config in dockerfileConfigs" :key="config.id" class="config-card">
              <div class="config-info">
                <div class="config-name">{{ config.name }}</div>
                <div class="config-meta">
                  <span>创建于 {{ formatDate(config.createdAt) }}</span>
                  <span>更新于 {{ formatDate(config.updatedAt) }}</span>
                </div>
              </div>
              <div class="config-actions">
                <button class="btn-small" @click="viewDockerfile(config)">查看</button>
                <button class="btn-small danger" @click="confirmDelete(config.id, config.name)">
                  删除
                </button>
              </div>
            </div>
          </div>

          <!-- Compose 列表 -->
          <div v-else class="config-list">
            <div v-if="composeConfigs.length === 0" class="empty-state">
              <p class="empty-title">暂无 Compose 配置</p>
              <p class="empty-desc">在创建实验室时保存的 Compose 配置会显示在这里</p>
            </div>
            <div v-for="config in composeConfigs" :key="config.id" class="config-card">
              <div class="config-info">
                <div class="config-name">{{ config.name }}</div>
                <div class="config-meta">
                  <span>创建于 {{ formatDate(config.createdAt) }}</span>
                  <span>更新于 {{ formatDate(config.updatedAt) }}</span>
                </div>
              </div>
              <div class="config-actions">
                <button class="btn-small" @click="viewCompose(config)">查看</button>
                <button class="btn-small danger" @click="confirmDelete(config.id, config.name)">
                  删除
                </button>
              </div>
            </div>
          </div>
        </template>

        <!-- 配置详情查看 -->
        <div v-else class="config-viewer">
          <div class="viewer-header">
            <button class="back-btn" @click="closeViewer">← 返回列表</button>
            <h4>{{ viewingConfig.name }}</h4>
          </div>
          <div class="viewer-meta">
            <span>创建于 {{ formatDate(viewingConfig.createdAt) }}</span>
            <span>更新于 {{ formatDate(viewingConfig.updatedAt) }}</span>
          </div>
          <textarea
            :value="viewingConfig.content"
            class="code-viewer"
            readonly
            spellcheck="false"
          ></textarea>
          <div class="viewer-footer">
            <button class="btn" @click="closeViewer">关闭</button>
            <button class="btn-primary" @click="useConfig">使用此配置</button>
          </div>
        </div>
      </div>

      <!-- 删除确认对话框 -->
      <div v-if="showDeleteConfirm" class="confirm-dialog-overlay" @click.self="cancelDelete">
        <div class="confirm-dialog">
          <h4>确认删除</h4>
          <p>确定要删除配置「{{ deletingConfigName }}」吗？此操作不可恢复。</p>
          <div class="confirm-actions">
            <button class="btn" @click="cancelDelete">取消</button>
            <button class="btn-danger" @click="handleDelete">删除</button>
          </div>
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
  background-color: var(--sm-color-bg-app);
  border: 1px solid var(--sm-color-border-default);
  border-radius: 8px;
  width: 90%;
  max-width: 800px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.manager-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--sm-color-border-default);
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
  color: var(--sm-color-text-secondary);
  font-size: 24px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.close-btn:hover {
  background-color: var(--sm-color-surface-1);
  color: var(--sm-color-text-primary);
}

.manager-tabs {
  display: flex;
  gap: 8px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--sm-color-border-default);
  background-color: var(--sm-color-surface-1);
}

.tab-btn {
  padding: 8px 16px;
  font-size: 13px;
  font-family: var(--sm-font-sans);
  background-color: var(--sm-color-bg-app);
  border: 1px solid var(--sm-color-border-default);
  border-radius: 4px;
  color: var(--sm-color-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.tab-btn:hover {
  border-color: var(--sm-color-text-secondary);
  color: var(--sm-color-text-primary);
}

.tab-btn.active {
  background-color: var(--sm-color-surface-selected);
  border-color: var(--sm-color-border-selected);
  color: var(--sm-color-text-selected);
}

.manager-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
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
}

.empty-title {
  font-size: 16px;
  font-weight: 500;
  color: var(--sm-color-text-primary);
  margin: 0 0 8px 0;
}

.empty-desc {
  font-size: 14px;
  margin: 0;
}

.config-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.config-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background-color: var(--sm-color-surface-1);
  border: 1px solid var(--sm-color-border-default);
  border-radius: 6px;
}

.config-info {
  flex: 1;
  min-width: 0;
}

.config-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
  margin-bottom: 4px;
}

.config-meta {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--sm-color-text-secondary);
}

.config-actions {
  display: flex;
  gap: 8px;
}

.btn-small {
  padding: 4px 10px;
  font-size: 12px;
  font-family: var(--sm-font-sans);
  background-color: var(--sm-color-bg-app);
  border: 1px solid var(--sm-color-border-default);
  border-radius: 4px;
  color: var(--sm-color-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-small:hover {
  border-color: var(--sm-color-accent);
  color: var(--sm-color-accent);
}

.btn-small.danger:hover {
  border-color: var(--sm-color-status-danger);
  color: var(--sm-color-status-danger);
}

.config-viewer {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.viewer-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.back-btn {
  padding: 6px 12px;
  font-size: 13px;
  font-family: var(--sm-font-sans);
  background-color: var(--sm-color-surface-1);
  border: 1px solid var(--sm-color-border-default);
  border-radius: 4px;
  color: var(--sm-color-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.back-btn:hover {
  border-color: var(--sm-color-text-secondary);
  color: var(--sm-color-text-primary);
}

.viewer-header h4 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.viewer-meta {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--sm-color-text-secondary);
}

.code-viewer {
  width: 100%;
  min-height: 300px;
  padding: 12px;
  font-family: var(--sm-font-sans);
  font-size: 13px;
  line-height: 1.5;
  background-color: var(--sm-color-surface-1);
  border: 1px solid var(--sm-color-border-default);
  border-radius: 6px;
  color: var(--sm-color-text-primary);
  resize: vertical;
  white-space: pre;
  tab-size: 2;
}

.viewer-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.btn {
  padding: 6px 12px;
  font-size: 13px;
  font-family: var(--sm-font-sans);
  background-color: var(--sm-color-surface-1);
  border: 1px solid var(--sm-color-border-default);
  border-radius: 4px;
  color: var(--sm-color-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn:hover {
  border-color: var(--sm-color-text-secondary);
  color: var(--sm-color-text-primary);
}

.btn-primary {
  padding: 6px 12px;
  font-size: 13px;
  font-family: var(--sm-font-sans);
  background-color: var(--sm-color-accent);
  border: 1px solid var(--sm-color-accent);
  border-radius: 4px;
  color: var(--sm-color-bg-app);
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-primary:hover {
  opacity: 0.9;
}

.btn-danger {
  padding: 6px 12px;
  font-size: 13px;
  font-family: var(--sm-font-sans);
  background-color: var(--sm-color-status-danger);
  border: 1px solid var(--sm-color-status-danger);
  border-radius: 4px;
  color: white;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-danger:hover {
  opacity: 0.9;
}

.confirm-dialog-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

.confirm-dialog {
  background-color: var(--sm-color-bg-app);
  border: 1px solid var(--sm-color-border-default);
  border-radius: 8px;
  padding: 20px;
  width: 320px;
}

.confirm-dialog h4 {
  margin: 0 0 12px 0;
  font-size: 16px;
  font-weight: 600;
}

.confirm-dialog p {
  margin: 0 0 16px 0;
  font-size: 14px;
  color: var(--sm-color-text-secondary);
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
