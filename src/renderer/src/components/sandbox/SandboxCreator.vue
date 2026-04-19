<script setup lang="ts">
import { ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useContainerStore, useDockerConfigStore, useSandboxCreatorStore } from '@renderer/stores'
import ContainerSelector from './ContainerSelector.vue'
import ComposeEditor from './ComposeEditor.vue'
import DockerfileEditor from './DockerfileEditor.vue'
import SaveConfigDialog from './SaveConfigDialog.vue'
import { CreateActions, CreateTypeSelector, PortMappingSection } from './creator'
import { useCreateFlow } from './creator/composables/useCreateFlow'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const containerStore = useContainerStore()
const configStore = useDockerConfigStore()
const creatorStore = useSandboxCreatorStore()

const {
  showSaveDialog,
  saveDialogType,
  isCreating,
  createError,
  portMappings,
  createType,
  composeContent,
  composeProjectName,
  dockerfileContent,
  dockerfileContext,
  dockerfileProjectName
} = storeToRefs(creatorStore)

const containerSelectorRef = ref<InstanceType<typeof ContainerSelector> | null>(null)

const {
  canCreate,
  containerSelectHint,
  createPhaseText,
  createProgress,
  clearError,
  close,
  handleCreate
} = useCreateFlow({
  containerSelectorRef,
  closeDialog: () => emit('close')
})

watch(
  () => props.visible,
  async (visible) => {
    if (!visible) {
      return
    }

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
    dockerfileProjectName.value = ''
    containerSelectorRef.value?.reset()
    clearError()

    await Promise.all([
      containerStore.loadContainers(),
      configStore.loadDockerfileConfigs(),
      configStore.loadComposeConfigs()
    ])
  }
)

watch(createType, async (newType) => {
  if (newType === 'existing' && containerStore.containers.length === 0) {
    await containerStore.loadContainers()
  }
})

async function handleSaveConfig(name: string): Promise<void> {
  creatorStore.saveConfigName = name.trim()
  await creatorStore.handleSaveConfig()
}
</script>

<template>
  <div v-if="visible" class="sandbox-creator-overlay" @click.self="close">
    <div class="sandbox-creator">
      <div class="creator-header">
        <h2>创建新沙箱</h2>
        <button class="close-btn" @click="close">×</button>
      </div>

      <CreateTypeSelector v-model="createType" />

      <ContainerSelector
        v-if="createType === 'existing'"
        ref="containerSelectorRef"
        class="creator-section"
      />

      <div v-if="containerSelectHint" class="container-hint">
        {{ containerSelectHint }}
      </div>

      <div v-if="isCreating" class="create-progress">
        <div class="progress-header">
          <span class="progress-text">{{ createPhaseText }}</span>
          <span class="progress-percent">{{ createProgress }}%</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: `${createProgress}%` }"></div>
        </div>
      </div>

      <div v-if="createError && !isCreating" class="create-error">
        <div class="error-header">
          <span class="error-icon">⚠</span>
          <span class="error-title">创建失败</span>
          <button class="error-close" @click="clearError">×</button>
        </div>
        <div class="error-message">{{ createError }}</div>
      </div>

      <ComposeEditor
        v-if="createType === 'compose'"
        v-model="composeContent"
        v-model:project-name="composeProjectName"
        class="creator-section"
        @save-config="creatorStore.openSaveDialog('compose')"
      />

      <template v-else-if="createType === 'dockerfile'">
        <div class="project-name-section">
          <label class="form-label">沙箱名称 <span class="required">*</span></label>
          <input
            v-model="dockerfileProjectName"
            type="text"
            class="form-input"
            placeholder="请输入沙箱名称"
          />
        </div>
        <DockerfileEditor
          v-model="dockerfileContent"
          v-model:context="dockerfileContext"
          class="creator-section"
          @save-config="creatorStore.openSaveDialog('dockerfile')"
        />
      </template>

      <PortMappingSection
        :create-type="createType"
        :port-mappings="portMappings"
        @refresh="creatorStore.refreshPorts()"
        @add="creatorStore.addPortMapping()"
        @update="(index, patch) => creatorStore.updatePortMapping(index, patch)"
        @remove="creatorStore.removePortMapping"
      />

      <CreateActions
        :is-creating="isCreating"
        :can-create="canCreate"
        :create-type="createType"
        :create-phase-text="createPhaseText"
        @close="close"
        @create="handleCreate"
      />

      <SaveConfigDialog
        :visible="showSaveDialog"
        :config-type="saveDialogType"
        @close="creatorStore.closeSaveDialog()"
        @save="handleSaveConfig"
      />
    </div>
  </div>
</template>

<style scoped>
@import './creator/sandbox-creator.css';
</style>
