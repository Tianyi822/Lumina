<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useContainerStore, useDockerConfigStore, useSandboxCreatorStore } from '@renderer/stores'
import type { ComposeOptions } from '@shared/types/sandbox'
import ContainerSelector from './ContainerSelector.vue'
import ComposeEditor from './ComposeEditor.vue'
import DockerfileEditor from './DockerfileEditor.vue'
import SaveConfigDialog from './SaveConfigDialog.vue'
import SuccessToast from './SuccessToast.vue'

type CreateType = 'compose' | 'dockerfile' | 'existing'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'create-from-compose', content: string, options?: ComposeOptions): void
  (e: 'create-from-dockerfile', dockerfile: string, context: string): void
  (e: 'select-container', containerId: string): void
}>()

const containerStore = useContainerStore()
const configStore = useDockerConfigStore()
const creatorStore = useSandboxCreatorStore()

const { showSaveDialog, saveDialogType, showSuccessToast, successMessage } =
  storeToRefs(creatorStore)

const createType = ref<CreateType>('compose')

const composeContent = ref('')
const composeProjectName = ref('')

const dockerfileContent = ref('')
const dockerfileContext = ref('')

const containerSelectorRef = ref<InstanceType<typeof ContainerSelector> | null>(null)

const canCreate = computed(() => {
  switch (createType.value) {
    case 'compose':
      return composeContent.value.trim().length > 0
    case 'dockerfile':
      return dockerfileContent.value.trim().length > 0
    case 'existing':
      return containerSelectorRef.value?.selectedContainerId !== null
    default:
      return false
  }
})

watch(
  () => props.visible,
  async (visible) => {
    if (visible) {
      createType.value = 'compose'
      composeContent.value = creatorStore.getComposeTemplate('mixed')
      dockerfileContent.value = `FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
`
      dockerfileContext.value = ''
      composeProjectName.value = ''
      containerSelectorRef.value?.reset()
      await containerStore.loadContainers()
      await configStore.loadDockerfileConfigs()
      await configStore.loadComposeConfigs()
    }
  }
)

watch(createType, async (newType) => {
  if (newType === 'existing' && containerStore.containers.length === 0) {
    await containerStore.loadContainers()
  }
})

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
    case 'existing': {
      const containerId = containerSelectorRef.value?.selectedContainerId
      if (containerId) {
        emit('select-container', containerId)
      }
      break
    }
  }
}

function handleContainerSelect(containerId: string): void {
  emit('select-container', containerId)
}

async function handleSaveConfig(name: string): Promise<void> {
  const content =
    saveDialogType.value === 'dockerfile' ? dockerfileContent.value : composeContent.value
  const trimmedName = name.trim()

  if (!trimmedName) return

  if (saveDialogType.value === 'dockerfile') {
    await configStore.saveDockerfileConfig({
      name: trimmedName,
      content: content
    })
  } else {
    await configStore.saveComposeConfig({
      name: trimmedName,
      content: content
    })
  }

  creatorStore.showSaveDialog = false
  creatorStore.showSuccessToast = true
  creatorStore.successMessage = `配置「${trimmedName}」保存成功`
  setTimeout(() => {
    creatorStore.showSuccessToast = false
  }, 3000)
}

function handleSaveComposeConfig(): void {
  creatorStore.openSaveDialog('compose')
}

function handleSaveDockerfileConfig(): void {
  creatorStore.openSaveDialog('dockerfile')
}
</script>

<template>
  <div v-if="visible" class="sandbox-creator-overlay" @click.self="close">
    <div class="sandbox-creator">
      <div class="creator-header">
        <h2>创建新沙箱</h2>
        <button class="close-btn" @click="close">×</button>
      </div>

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

      <ContainerSelector
        v-if="createType === 'existing'"
        ref="containerSelectorRef"
        class="creator-section"
        @select="handleContainerSelect"
      />

      <ComposeEditor
        v-else-if="createType === 'compose'"
        v-model="composeContent"
        v-model:project-name="composeProjectName"
        class="creator-section"
        @save-config="handleSaveComposeConfig"
      />

      <DockerfileEditor
        v-else-if="createType === 'dockerfile'"
        v-model="dockerfileContent"
        v-model:context="dockerfileContext"
        class="creator-section"
        @save-config="handleSaveDockerfileConfig"
      />

      <div class="creator-footer">
        <button class="btn" @click="close">取消</button>
        <button class="btn-primary" :disabled="!canCreate" @click="handleCreate">
          {{ createType === 'existing' ? '选择并使用' : '创建并运行' }}
        </button>
      </div>

      <SaveConfigDialog
        :visible="showSaveDialog"
        :config-type="saveDialogType"
        @close="creatorStore.closeSaveDialog()"
        @save="handleSaveConfig"
      />
    </div>

    <SuccessToast
      :visible="showSuccessToast"
      :message="successMessage"
      @close="creatorStore.closeSuccessToast()"
    />
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
  position: relative;
}

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

.creator-section {
  flex: 1;
  overflow-y: auto;
}

.creator-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--theme-border);
  background-color: var(--theme-bg-secondary);
}

.btn {
  padding: 6px 12px;
  font-size: 13px;
  font-family: var(--theme-font);
  background-color: var(--theme-bg-secondary);
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

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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
</style>
