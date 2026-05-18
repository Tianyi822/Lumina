<script setup lang="ts">
import { ref, watch } from 'vue'
import { useZustandStore } from '@renderer/composables/useZustandStore'
import { useDockerConfigStore } from '@renderer/stores'
import type {
  DockerfileConfigMeta,
  ComposeConfigMeta,
  DockerfileConfig,
  ComposeConfig
} from '@renderer/types/lab'
import styles from './DockerConfigManager.module.css'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'select-dockerfile', config: DockerfileConfig): void
  (e: 'select-compose', config: ComposeConfig): void
}>()

const configStore = useZustandStore(useDockerConfigStore)

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
  <div v-if="visible" :class="styles['config-manager-overlay']" @click.self="close">
    <div :class="styles['config-manager']">
      <div :class="styles['manager-header']">
        <h2>Docker 配置管理</h2>
        <button :class="styles['close-btn']" @click="close">×</button>
      </div>

      <div :class="styles['manager-tabs']">
        <button
          :class="[styles['tab-btn'], { [styles['active']]: activeTab === 'dockerfile' }]"
          @click="
            activeTab = 'dockerfile'
            viewingConfig = null
          "
        >
          Dockerfile ({{ configStore.dockerfileConfigs.length }})
        </button>
        <button
          :class="[styles['tab-btn'], { [styles['active']]: activeTab === 'compose' }]"
          @click="
            activeTab = 'compose'
            viewingConfig = null
          "
        >
          Docker Compose ({{ configStore.composeConfigs.length }})
        </button>
      </div>

      <div :class="styles['manager-content']">
        <div v-if="configStore.configsLoading" :class="styles['loading-state']">
          <div :class="styles['loading-spinner']"></div>
          <p>加载中...</p>
        </div>

        <template v-else-if="!viewingConfig">
          <!-- Dockerfile 列表 -->
          <div v-if="activeTab === 'dockerfile'" :class="styles['config-list']">
            <div v-if="configStore.dockerfileConfigs.length === 0" :class="styles['empty-state']">
              <p :class="styles['empty-title']">暂无 Dockerfile 配置</p>
              <p :class="styles['empty-desc']">在创建实验室时保存的 Dockerfile 配置会显示在这里</p>
            </div>
            <div
              v-for="config in configStore.dockerfileConfigs"
              :key="config.id"
              :class="styles['config-card']"
            >
              <div :class="styles['config-info']">
                <div :class="styles['config-name']">{{ config.name }}</div>
                <div :class="styles['config-meta']">
                  <span>创建于 {{ formatDate(config.createdAt) }}</span>
                  <span>更新于 {{ formatDate(config.updatedAt) }}</span>
                </div>
              </div>
              <div :class="styles['config-actions']">
                <button :class="styles['btn-small']" @click="viewDockerfile(config)">查看</button>
                <button
                  :class="[styles['btn-small'], styles['danger']]"
                  @click="confirmDelete(config.id, config.name)"
                >
                  删除
                </button>
              </div>
            </div>
          </div>

          <!-- Compose 列表 -->
          <div v-else :class="styles['config-list']">
            <div v-if="configStore.composeConfigs.length === 0" :class="styles['empty-state']">
              <p :class="styles['empty-title']">暂无 Compose 配置</p>
              <p :class="styles['empty-desc']">在创建实验室时保存的 Compose 配置会显示在这里</p>
            </div>
            <div
              v-for="config in configStore.composeConfigs"
              :key="config.id"
              :class="styles['config-card']"
            >
              <div :class="styles['config-info']">
                <div :class="styles['config-name']">{{ config.name }}</div>
                <div :class="styles['config-meta']">
                  <span>创建于 {{ formatDate(config.createdAt) }}</span>
                  <span>更新于 {{ formatDate(config.updatedAt) }}</span>
                </div>
              </div>
              <div :class="styles['config-actions']">
                <button :class="styles['btn-small']" @click="viewCompose(config)">查看</button>
                <button
                  :class="[styles['btn-small'], styles['danger']]"
                  @click="confirmDelete(config.id, config.name)"
                >
                  删除
                </button>
              </div>
            </div>
          </div>
        </template>

        <!-- 配置详情查看 -->
        <div v-else :class="styles['config-viewer']">
          <div :class="styles['viewer-header']">
            <button :class="styles['back-btn']" @click="closeViewer">← 返回列表</button>
            <h4>{{ viewingConfig.name }}</h4>
          </div>
          <div :class="styles['viewer-meta']">
            <span>创建于 {{ formatDate(viewingConfig.createdAt) }}</span>
            <span>更新于 {{ formatDate(viewingConfig.updatedAt) }}</span>
          </div>
          <textarea
            :value="viewingConfig.content"
            :class="styles['code-viewer']"
            readonly
            spellcheck="false"
          ></textarea>
          <div :class="styles['viewer-footer']">
            <button :class="styles['btn']" @click="closeViewer">关闭</button>
            <button :class="styles['btn-primary']" @click="useConfig">使用此配置</button>
          </div>
        </div>
      </div>

      <!-- 删除确认对话框 -->
      <div
        v-if="showDeleteConfirm"
        :class="styles['confirm-dialog-overlay']"
        @click.self="cancelDelete"
      >
        <div :class="styles['confirm-dialog']">
          <h4>确认删除</h4>
          <p>确定要删除配置「{{ deletingConfigName }}」吗？此操作不可恢复。</p>
          <div :class="styles['confirm-actions']">
            <button :class="styles['btn']" @click="cancelDelete">取消</button>
            <button :class="styles['btn-danger']" @click="handleDelete">删除</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
