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

const {
  showSaveDialog,
  saveDialogType,
  showSuccessToast,
  successMessage,
  isCreating,
  createError,
  createPhase,
  portMappings,
  createType,
  composeContent,
  composeProjectName,
  dockerfileContent,
  dockerfileContext,
  dockerfileProjectName
} = storeToRefs(creatorStore)

const containerSelectorRef = ref<InstanceType<typeof ContainerSelector> | null>(null)

const canCreate = computed(() => {
  switch (createType.value) {
    case 'compose':
      return composeContent.value.trim().length > 0 && composeProjectName.value.trim().length > 0
    case 'dockerfile':
      return (
        dockerfileContent.value.trim().length > 0 && dockerfileProjectName.value.trim().length > 0
      )
    case 'existing': {
      const selected = containerSelectorRef.value?.selectedContainer
      // 只有运行中的容器才能选择使用
      return selected != null && selected.state === 'running'
    }
    default:
      return false
  }
})

/** 选择容器时的提示信息 */
const containerSelectHint = computed(() => {
  if (createType.value !== 'existing') return ''

  const selected = containerSelectorRef.value?.selectedContainer
  if (!selected) return ''

  if (selected.state !== 'running') {
    return '只有运行中的容器才能选择使用，请先启动容器'
  }
  return ''
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
      dockerfileProjectName.value = ''
      containerSelectorRef.value?.reset()
      // 清除之前的创建状态
      clearError()
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
  // 如果正在创建，不允许关闭
  if (isCreating.value) return
  emit('close')
}

/** 获取创建阶段显示文本 */
const createPhaseText = computed(() => {
  switch (createPhase.value) {
    case 'metadata':
      return '创建沙箱元数据...'
    case 'building':
      return '构建容器镜像...'
    case 'starting':
      return '启动容器中...'
    case 'done':
      return '创建完成'
    default:
      return ''
  }
})

/** 获取创建进度百分比 */
const createProgress = computed(() => {
  switch (createPhase.value) {
    case 'metadata':
      return 20
    case 'building':
      return 60
    case 'starting':
      return 90
    case 'done':
      return 100
    default:
      return 0
  }
})

/** 清除错误信息 */
function clearError(): void {
  creatorStore.clearCreateError()
}

function handleCreate(): void {
  switch (createType.value) {
    case 'compose':
      // 同步名字到 store
      creatorStore.composeProjectName = composeProjectName.value
      emit('create-from-compose', composeContent.value, {
        projectName: composeProjectName.value || undefined
      })
      break
    case 'dockerfile':
      // 同步名字到 store
      creatorStore.dockerfileProjectName = dockerfileProjectName.value
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
        <label class="type-option" :class="{ active: createType === 'compose' }">
          <input v-model="createType" type="radio" value="compose" />
          <span class="option-label">Docker Compose</span>
        </label>
        <label class="type-option" :class="{ active: createType === 'dockerfile' }">
          <input v-model="createType" type="radio" value="dockerfile" />
          <span class="option-label">Dockerfile</span>
        </label>
        <label class="type-option" :class="{ active: createType === 'existing' }">
          <input v-model="createType" type="radio" value="existing" />
          <span class="option-label">选择已有容器</span>
        </label>
      </div>

      <ContainerSelector
        v-if="createType === 'existing'"
        ref="containerSelectorRef"
        class="creator-section"
        @select="handleContainerSelect"
      />

      <div v-if="containerSelectHint" class="container-hint">
        {{ containerSelectHint }}
      </div>

      <!-- 创建进度显示 -->
      <div v-if="isCreating" class="create-progress">
        <div class="progress-header">
          <span class="progress-text">{{ createPhaseText }}</span>
          <span class="progress-percent">{{ createProgress }}%</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: createProgress + '%' }"></div>
        </div>
      </div>

      <!-- 错误信息显示 -->
      <div v-if="createError && !isCreating" class="create-error">
        <div class="error-header">
          <span class="error-icon">⚠</span>
          <span class="error-title">创建失败</span>
          <button class="error-close" @click="clearError">×</button>
        </div>
        <div class="error-message">{{ createError }}</div>
      </div>

      <ComposeEditor
        v-else-if="createType === 'compose'"
        v-model="composeContent"
        v-model:project-name="composeProjectName"
        class="creator-section"
        @save-config="handleSaveComposeConfig"
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
          @save-config="handleSaveDockerfileConfig"
        />
      </template>

      <!-- 端口映射配置（仅 Compose 和 Dockerfile 类型显示） -->
      <div
        v-if="createType === 'compose' || createType === 'dockerfile'"
        class="port-mapping-section"
      >
        <div class="port-mapping-header">
          <h3 class="port-mapping-title">
            端口映射
            <span v-if="portMappings.length > 0" class="port-count"
              >({{ portMappings.length }})</span
            >
          </h3>
          <div class="port-mapping-actions">
            <button class="btn-small" @click="creatorStore.refreshPorts()">重新解析</button>
            <button class="btn-small" @click="creatorStore.addPortMapping()">+ 添加</button>
          </div>
        </div>
        <p class="port-mapping-hint">
          已从{{
            createType === 'compose' ? 'docker-compose.yaml' : 'Dockerfile EXPOSE 指令'
          }}自动解析端口映射，您可以手动修改
        </p>

        <div v-if="portMappings.length === 0" class="port-mapping-empty">
          未检测到端口映射，点击"添加"手动配置
        </div>

        <div v-else class="port-mapping-list">
          <div v-for="(mapping, index) in portMappings" :key="index" class="port-mapping-item">
            <div class="port-field host-port">
              <label>主机端口</label>
              <input
                type="number"
                :value="mapping.hostPort ?? ''"
                placeholder="自动"
                min="1"
                max="65535"
                @input="
                  creatorStore.updatePortMapping(index, {
                    hostPort: ($event.target as HTMLInputElement).value
                      ? parseInt(($event.target as HTMLInputElement).value, 10)
                      : null
                  })
                "
              />
            </div>
            <span class="port-arrow">→</span>
            <div class="port-field container-port">
              <label>容器端口</label>
              <input
                type="number"
                :value="mapping.containerPort"
                min="1"
                max="65535"
                @input="
                  creatorStore.updatePortMapping(index, {
                    containerPort: parseInt(($event.target as HTMLInputElement).value, 10)
                  })
                "
              />
            </div>
            <div class="port-field protocol">
              <label>协议</label>
              <select
                :value="mapping.protocol"
                @change="
                  creatorStore.updatePortMapping(index, {
                    protocol: ($event.target as HTMLSelectElement).value as 'tcp' | 'udp'
                  })
                "
              >
                <option value="tcp">TCP</option>
                <option value="udp">UDP</option>
              </select>
            </div>
            <button
              class="btn-remove"
              title="删除此端口映射"
              @click="creatorStore.removePortMapping(index)"
            >
              ×
            </button>
          </div>
        </div>
      </div>

      <div class="creator-footer">
        <button class="btn" :disabled="isCreating" @click="close">取消</button>
        <button class="btn-primary" :disabled="!canCreate || isCreating" @click="handleCreate">
          {{
            isCreating ? createPhaseText : createType === 'existing' ? '选择并使用' : '创建并运行'
          }}
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

.project-name-section {
  padding: 16px 20px;
  border-bottom: 1px solid var(--theme-border);
  background-color: var(--theme-bg);
}

.project-name-section .form-label {
  display: block;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--theme-text);
}

.project-name-section .form-label .required {
  color: #e74c3c;
}

.project-name-section .form-input {
  width: 100%;
  padding: 8px 12px;
  font-size: 14px;
  font-family: var(--theme-font);
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 4px;
  color: var(--theme-text);
  outline: none;
  transition: border-color 0.15s ease;
}

.project-name-section .form-input:focus {
  border-color: var(--theme-accent);
}

.project-name-section .form-input::placeholder {
  color: var(--theme-text-secondary);
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

.container-hint {
  padding: 12px 16px;
  margin: 0 20px 16px 20px;
  background-color: rgba(248, 81, 73, 0.1);
  border: 1px solid var(--theme-danger);
  border-radius: 6px;
  font-size: 13px;
  color: var(--theme-danger);
}

/* 创建进度显示 */
.create-progress {
  padding: 16px 20px;
  margin: 0 20px 16px 20px;
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 8px;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.progress-text {
  font-size: 13px;
  font-weight: 500;
  color: var(--theme-text);
}

.progress-percent {
  font-size: 12px;
  font-weight: 600;
  color: var(--theme-accent);
}

.progress-bar {
  height: 4px;
  background-color: var(--theme-bg);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background-color: var(--theme-accent);
  border-radius: 2px;
  transition: width 0.3s ease;
}

/* 错误信息显示 */
.create-error {
  padding: 12px 16px;
  margin: 0 20px 16px 20px;
  background-color: rgba(248, 81, 73, 0.1);
  border: 1px solid var(--theme-danger);
  border-radius: 8px;
}

.error-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.error-icon {
  font-size: 16px;
}

.error-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--theme-danger);
  flex: 1;
}

.error-close {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  border-radius: 4px;
  color: var(--theme-danger);
  font-size: 18px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.error-close:hover {
  background-color: rgba(248, 81, 73, 0.15);
}

.error-message {
  font-size: 12px;
  color: var(--theme-danger);
  line-height: 1.5;
  word-break: break-word;
}

/* 端口映射配置 */
.port-mapping-section {
  padding: 16px 20px;
  border-top: 1px solid var(--theme-border);
  background-color: var(--theme-bg);
}

.port-mapping-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.port-mapping-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--theme-text);
  display: flex;
  align-items: center;
  gap: 6px;
}

.port-count {
  font-size: 12px;
  font-weight: 400;
  color: var(--theme-text-secondary);
}

.port-mapping-actions {
  display: flex;
  gap: 8px;
}

.btn-small {
  padding: 4px 10px;
  font-size: 12px;
  font-family: var(--theme-font);
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 4px;
  color: var(--theme-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-small:hover {
  border-color: var(--theme-text-secondary);
  color: var(--theme-text);
}

.port-mapping-hint {
  margin: 0 0 12px 0;
  font-size: 12px;
  color: var(--theme-text-secondary);
}

.port-mapping-empty {
  padding: 16px;
  text-align: center;
  background-color: var(--theme-bg-secondary);
  border: 1px dashed var(--theme-border);
  border-radius: 6px;
  font-size: 13px;
  color: var(--theme-text-secondary);
}

.port-mapping-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.port-mapping-item {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  padding: 12px;
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 6px;
}

.port-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.port-field label {
  font-size: 11px;
  color: var(--theme-text-secondary);
}

.port-field input,
.port-field select {
  padding: 6px 8px;
  font-size: 13px;
  font-family: var(--theme-font);
  background-color: var(--theme-bg);
  border: 1px solid var(--theme-border);
  border-radius: 4px;
  color: var(--theme-text);
  outline: none;
  transition: border-color 0.15s ease;
}

.port-field input:focus,
.port-field select:focus {
  border-color: var(--theme-accent);
}

.host-port {
  width: 100px;
}

.container-port {
  width: 100px;
}

.protocol {
  width: 80px;
}

.port-arrow {
  font-size: 16px;
  color: var(--theme-text-secondary);
  margin-bottom: 8px;
}

.btn-remove {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: 1px solid transparent;
  border-radius: 4px;
  color: var(--theme-text-secondary);
  font-size: 16px;
  cursor: pointer;
  margin-bottom: 4px;
  transition: all 0.15s ease;
}

.btn-remove:hover {
  background-color: rgba(248, 81, 73, 0.1);
  border-color: var(--theme-danger);
  color: var(--theme-danger);
}
</style>
