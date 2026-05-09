<script setup lang="ts">
import { ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useContainerStore, useDockerConfigStore, useLabCreatorStore } from '@renderer/stores'
import { useNotification } from '@renderer/composables/useNotification'
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
const creatorStore = useLabCreatorStore()
const notify = useNotification()

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
  dockerfileProjectName,
  sshConfig
} = storeToRefs(creatorStore)

const containerSelectorRef = ref<InstanceType<typeof ContainerSelector> | null>(null)
const isTestingSsh = ref(false)

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
    creatorStore.resetSshConfig()
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

async function testSshConnection(): Promise<void> {
  const ssh = sshConfig.value
  if (!ssh.host.trim() || !ssh.username.trim()) {
    notify.warning('请填写必填项', '主机地址和用户名不能为空', { source: 'lab' })
    return
  }

  isTestingSsh.value = true
  try {
    const result = await window.api.ssh.config.test({
      id: '',
      name: 'test',
      host: ssh.host,
      port: ssh.port,
      username: ssh.username,
      authType: ssh.authType,
      password: ssh.authType === 'password' ? ssh.password : undefined,
      keyPath: ssh.authType === 'key' ? ssh.keyPath : undefined,
      passphrase: ssh.passphrase || undefined
    })

    if (result.success) {
      const detail = result.systemInfo
        ? `${result.systemInfo.hostname} (${result.systemInfo.platform})`
        : 'SSH 连接测试成功'
      notify.success('连接成功', detail, { source: 'lab' })
    } else {
      notify.error('连接失败', result.error || '未知错误', { source: 'lab' })
    }
  } finally {
    isTestingSsh.value = false
  }
}

async function selectKeyFile(): Promise<void> {
  const files = await window.api.file.selectFiles()
  if (files?.length) {
    creatorStore.updateSshConfig({ keyPath: files[0].path })
  }
}
</script>

<template>
  <div v-if="visible" class="lab-creator-overlay" @click.self="close">
    <div class="lab-creator">
      <div class="creator-header">
        <h2>创建新实验室</h2>
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
          <label class="form-label">实验室名称 <span class="required">*</span></label>
          <input
            v-model="dockerfileProjectName"
            type="text"
            class="form-input"
            placeholder="请输入实验室名称"
          />
        </div>
        <DockerfileEditor
          v-model="dockerfileContent"
          v-model:context="dockerfileContext"
          class="creator-section"
          @save-config="creatorStore.openSaveDialog('dockerfile')"
        />
      </template>

      <div v-else-if="createType === 'ssh'" class="creator-section ssh-form">
        <div class="ssh-form__field">
          <label class="form-label">主机地址 <span class="required">*</span></label>
          <input
            v-model="sshConfig.host"
            type="text"
            class="form-input"
            placeholder="192.168.1.100"
          />
        </div>

        <div class="ssh-form__field ssh-form__field--inline">
          <div class="ssh-form__field-half">
            <label class="form-label">端口</label>
            <input
              v-model.number="sshConfig.port"
              type="number"
              class="form-input"
              placeholder="22"
            />
          </div>
          <div class="ssh-form__field-half">
            <label class="form-label">用户名 <span class="required">*</span></label>
            <input
              v-model="sshConfig.username"
              type="text"
              class="form-input"
              placeholder="root"
            />
          </div>
        </div>

        <div class="ssh-form__field">
          <label class="form-label">认证方式</label>
          <div class="ssh-form__toggle">
            <button
              class="ssh-form__toggle-btn"
              :class="{ active: sshConfig.authType === 'password' }"
              @click="creatorStore.updateSshConfig({ authType: 'password' })"
            >
              密码
            </button>
            <button
              class="ssh-form__toggle-btn"
              :class="{ active: sshConfig.authType === 'key' }"
              @click="creatorStore.updateSshConfig({ authType: 'key' })"
            >
              密钥
            </button>
          </div>
        </div>

        <div v-if="sshConfig.authType === 'password'" class="ssh-form__field">
          <label class="form-label">密码</label>
          <input
            v-model="sshConfig.password"
            type="password"
            class="form-input"
            placeholder="输入 SSH 密码"
          />
        </div>

        <template v-else>
          <div class="ssh-form__field">
            <label class="form-label">密钥文件路径</label>
            <div class="ssh-form__input-row">
              <input
                v-model="sshConfig.keyPath"
                type="text"
                class="form-input"
                placeholder="~/.ssh/id_rsa"
              />
              <button class="btn" @click="selectKeyFile">浏览</button>
            </div>
          </div>
          <div class="ssh-form__field">
            <label class="form-label">密钥密码短语（可选）</label>
            <input
              v-model="sshConfig.passphrase"
              type="password"
              class="form-input"
              placeholder="留空表示无密码短语"
            />
          </div>
        </template>

        <div class="ssh-form__field ssh-form__checkbox">
          <label>
            <input v-model="sshConfig.saveConfig" type="checkbox" />
            保存此服务器配置（密码将加密存储于本地）
          </label>
        </div>

        <button
          class="btn ssh-form__test-btn"
          :disabled="isTestingSsh"
          @click="testSshConnection"
        >
          {{ isTestingSsh ? '测试连接中...' : '测试连接' }}
        </button>
      </div>

      <PortMappingSection
        v-if="createType !== 'ssh'"
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
@import './creator/lab-creator.css';

.ssh-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
}

.ssh-form__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ssh-form__field--inline {
  flex-direction: row;
  gap: 12px;
}

.ssh-form__field-half {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ssh-form__toggle {
  display: flex;
  gap: 8px;
}

.ssh-form__toggle-btn {
  padding: 8px 16px;
  border: 1px solid var(--sm-color-border-default);
  border-radius: 6px;
  background-color: var(--sm-color-bg-app);
  color: var(--sm-color-text-primary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.ssh-form__toggle-btn.active {
  border-color: var(--sm-color-border-selected);
  background-color: var(--sm-color-surface-selected);
}

.ssh-form__toggle-btn:hover:not(.active) {
  border-color: var(--sm-color-text-secondary);
}

.ssh-form__input-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.ssh-form__input-row .form-input {
  flex: 1;
}

.ssh-form__checkbox {
  flex-direction: row;
  align-items: center;
}

.ssh-form__checkbox label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--sm-color-text-secondary);
  cursor: pointer;
}

.ssh-form__test-btn {
  align-self: flex-start;
}
</style>
