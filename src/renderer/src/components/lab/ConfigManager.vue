<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useZustandStore } from '@renderer/composables/useZustandStore'
import { useDockerConfigStore } from '@renderer/stores'
import styles from './ConfigManager.module.css'

type ConfigType = 'dockerfile' | 'compose'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const configStore = useZustandStore(useDockerConfigStore)

const activeTab = ref<ConfigType>('dockerfile')
const selectedId = ref<string | null>(null)
const editingContent = ref('')
const editingName = ref('')
const isEditing = ref(false)
const deleteConfirmId = ref<string | null>(null)

const currentConfigs = computed(() => {
  return activeTab.value === 'dockerfile'
    ? configStore.dockerfileConfigs
    : configStore.composeConfigs
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
  <div v-if="visible" :class="[styles['config-manager-overlay']]" @click.self="close">
    <div :class="['sm-modal__surface', styles['config-manager']]">
      <div :class="['sm-pane-header', styles['manager-header']]">
        <div :class="styles['manager-heading']">
          <div :class="styles['manager-title-row']">
            <h2>Docker 模板资产</h2>
          </div>
          <p>统一维护 Dockerfile 与 Compose 模板，供实验室创建流程复用。</p>
        </div>
        <button class="sm-button sm-button--secondary sm-button--small" @click="close">关闭</button>
      </div>

      <div :class="styles['manager-tabs']">
        <button
          :class="['sm-tab', styles['manager-tab'], { 'is-active': activeTab === 'dockerfile' }]"
          @click="activeTab = 'dockerfile'"
        >
          Dockerfile
        </button>
        <button
          :class="['sm-tab', styles['manager-tab'], { 'is-active': activeTab === 'compose' }]"
          @click="activeTab = 'compose'"
        >
          Docker Compose
        </button>
      </div>

      <div :class="styles['manager-body']">
        <div :class="styles['config-list']">
          <div :class="styles['list-header']">
            <div :class="styles['list-heading']">
              <span :class="styles['list-eyebrow']">模板列表</span>
              <strong>{{ activeTab === 'dockerfile' ? 'Dockerfile 模板' : 'Compose 模板' }}</strong>
            </div>
          </div>
          <div v-if="configStore.configsLoading" :class="['sm-empty', styles['list-state']]">
            加载配置中...
          </div>
          <div v-else-if="currentConfigs.length === 0" :class="['sm-empty', styles['list-state']]">
            暂无{{ activeTab === 'dockerfile' ? 'Dockerfile' : 'Compose' }}配置
          </div>
          <div v-else :class="styles['list-items']">
            <button
              v-for="config in currentConfigs"
              :key="config.id"
              :class="[styles['list-item'], { [styles['selected']]: selectedId === config.id }]"
              type="button"
              @click="selectConfig(config.id)"
            >
              <div :class="styles['item-name']">{{ config.name }}</div>
              <div :class="styles['item-date']">更新于 {{ formatDate(config.updatedAt) }}</div>
            </button>
          </div>
        </div>

        <div :class="styles['config-detail']">
          <template v-if="selectedConfig">
            <div :class="styles['detail-header']">
              <template v-if="isEditing">
                <input
                  v-model="editingName"
                  type="text"
                  :class="[styles['name-input'], 'sm-input']"
                  placeholder="配置名称"
                />
              </template>
              <template v-else>
                <h3 :class="styles['detail-title']">{{ selectedConfig.name }}</h3>
                <button
                  class="sm-button sm-button--secondary sm-button--small"
                  @click="startEditing"
                >
                  编辑
                </button>
              </template>
            </div>

            <div :class="styles['detail-meta']">
              <span>创建: {{ formatDate(selectedConfig.createdAt) }}</span>
              <span>更新: {{ formatDate(selectedConfig.updatedAt) }}</span>
            </div>

            <div :class="styles['detail-content']">
              <label :class="styles['content-label']">
                {{ activeTab === 'dockerfile' ? 'Dockerfile' : 'docker-compose.yaml' }}
              </label>
              <textarea
                v-model="editingContent"
                :class="styles['code-editor']"
                :readonly="!isEditing"
                spellcheck="false"
              ></textarea>
            </div>

            <div :class="styles['detail-actions']">
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
                  <span :class="styles['delete-hint']">确定删除？</span>
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
            <div :class="['sm-empty', styles['detail-empty']]">
              <p>选择左侧配置查看详情</p>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
