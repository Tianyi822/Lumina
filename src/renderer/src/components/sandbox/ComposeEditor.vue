<script setup lang="ts">
import { ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useSandboxStore } from '@renderer/stores'

type ComposeTemplateType = 'image' | 'build' | 'mixed'

const sandboxStore = useSandboxStore()
const { dockerfileConfigs, composeConfigs, creatorShowGenerator, creatorGeneratorForm } =
  storeToRefs(sandboxStore)

const props = defineProps<{
  modelValue: string
  projectName?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'update:projectName', value: string): void
  (e: 'save-config'): void
}>()

const selectedComposeId = ref<string | null>(null)
const localContent = ref(props.modelValue)
const localProjectName = ref(props.projectName || '')

watch(
  () => props.modelValue,
  (value) => {
    localContent.value = value
  }
)

watch(
  () => props.projectName,
  (value) => {
    localProjectName.value = value || ''
  }
)

watch(localContent, (value) => {
  emit('update:modelValue', value)
})

watch(localProjectName, (value) => {
  emit('update:projectName', value)
})

async function loadSelectedCompose(): Promise<void> {
  if (!selectedComposeId.value) return
  const config = await sandboxStore.loadComposeConfig(selectedComposeId.value)
  if (config) {
    localContent.value = config.content
    localProjectName.value = config.name
  }
}

function useTemplate(templateType: ComposeTemplateType): void {
  localContent.value = sandboxStore.getComposeTemplate(templateType)
}

function handleInsertServiceConfig(): void {
  const config = sandboxStore.creatorGenerateServiceConfig()
  const currentContent = localContent.value

  const servicesMatch = currentContent.match(/^(services:\s*\n)/m)
  if (servicesMatch) {
    const insertIndex = servicesMatch.index! + servicesMatch[0].length
    localContent.value =
      currentContent.slice(0, insertIndex) + config + '\n' + currentContent.slice(insertIndex)
  } else if (currentContent.includes('version:')) {
    localContent.value = currentContent + '\nservices:\n' + config + '\n'
  } else {
    localContent.value = "version: '3.8'\n\nservices:\n" + config + '\n'
  }

  sandboxStore.creatorShowGenerator = false
  sandboxStore.creatorResetGeneratorForm()
}

function handleSaveConfig(): void {
  emit('save-config')
}
</script>

<template>
  <div class="compose-editor">
    <h3>Docker Compose 配置</h3>
    <div class="form-field">
      <label>项目名称（可选）</label>
      <input v-model="localProjectName" type="text" class="input" placeholder="my-project" />
    </div>

    <div class="form-field">
      <label>
        已保存配置
        <button class="btn-link" @click="handleSaveConfig">另存为</button>
      </label>
      <div class="config-selector">
        <select v-model="selectedComposeId" class="select" @change="loadSelectedCompose">
          <option :value="null">选择已保存的配置...</option>
          <option v-for="config in composeConfigs" :key="config.id" :value="config.id">
            {{ config.name }}
          </option>
        </select>
      </div>
    </div>

    <div class="generator-section">
      <div
        class="generator-header"
        @click="sandboxStore.creatorShowGenerator = !sandboxStore.creatorShowGenerator"
      >
        <span class="generator-title">构建配置生成器</span>
        <span class="generator-toggle" :class="{ expanded: creatorShowGenerator }">▼</span>
      </div>

      <div v-if="creatorShowGenerator" class="generator-form">
        <div class="form-row">
          <div class="form-field-inline">
            <label>服务名称</label>
            <input
              v-model="creatorGeneratorForm.serviceName"
              type="text"
              class="input"
              placeholder="app"
            />
          </div>
          <div class="form-field-inline">
            <label>来源类型</label>
            <div class="radio-group">
              <label class="radio-option">
                <input v-model="creatorGeneratorForm.sourceType" type="radio" value="image" />
                <span>镜像</span>
              </label>
              <label class="radio-option">
                <input v-model="creatorGeneratorForm.sourceType" type="radio" value="build" />
                <span>构建</span>
              </label>
            </div>
          </div>
        </div>

        <div v-if="creatorGeneratorForm.sourceType === 'image'" class="form-field">
          <label>镜像名称</label>
          <input
            v-model="creatorGeneratorForm.image"
            type="text"
            class="input"
            placeholder="node:18-alpine"
          />
        </div>

        <template v-else>
          <div class="form-field">
            <label>
              使用已保存的 Dockerfile
              <button
                v-if="creatorGeneratorForm.useSavedDockerfile"
                class="btn-link"
                @click="sandboxStore.creatorClearSavedDockerfile()"
              >
                清除选择
              </button>
            </label>
            <select
              v-model="creatorGeneratorForm.savedDockerfileId"
              class="select"
              @change="sandboxStore.creatorOnSavedDockerfileSelect()"
            >
              <option :value="null">不使用已保存的 Dockerfile</option>
              <option v-for="config in dockerfileConfigs" :key="config.id" :value="config.id">
                {{ config.name }}
              </option>
            </select>
          </div>

          <div class="form-row">
            <div class="form-field-inline">
              <label>构建上下文</label>
              <input
                v-model="creatorGeneratorForm.context"
                type="text"
                class="input"
                placeholder="./app"
                :disabled="creatorGeneratorForm.useSavedDockerfile"
              />
            </div>
            <div class="form-field-inline">
              <label>Dockerfile 名称</label>
              <input
                v-model="creatorGeneratorForm.dockerfile"
                type="text"
                class="input"
                placeholder="Dockerfile"
                :disabled="creatorGeneratorForm.useSavedDockerfile"
              />
            </div>
          </div>
          <div class="form-field">
            <label>构建参数（可选，逗号分隔，格式：key=value）</label>
            <input
              v-model="creatorGeneratorForm.buildArgs"
              type="text"
              class="input"
              placeholder="NODE_VERSION=18,API_KEY=xxx"
            />
          </div>
        </template>

        <div class="form-row">
          <div class="form-field-inline">
            <label>端口映射（可选，逗号分隔）</label>
            <input
              v-model="creatorGeneratorForm.ports"
              type="text"
              class="input"
              placeholder="3000:3000,8080:8080"
            />
          </div>
          <div class="form-field-inline">
            <label>环境变量（可选，逗号分隔）</label>
            <input
              v-model="creatorGeneratorForm.environment"
              type="text"
              class="input"
              placeholder="NODE_ENV=development,DEBUG=true"
            />
          </div>
        </div>

        <div class="generator-actions">
          <button class="btn-secondary" @click="sandboxStore.creatorResetGeneratorForm()">
            重置
          </button>
          <button class="btn-primary" @click="handleInsertServiceConfig">插入配置</button>
        </div>
      </div>
    </div>

    <div class="form-field">
      <label>
        docker-compose.yaml
        <div class="template-buttons">
          <button class="btn-template" @click="useTemplate('image')">镜像模板</button>
          <button class="btn-template" @click="useTemplate('build')">Dockerfile 模板</button>
          <button class="btn-template" @click="useTemplate('mixed')">混合模板</button>
        </div>
      </label>
      <textarea
        v-model="localContent"
        class="code-editor"
        placeholder="输入 Docker Compose 配置..."
        spellcheck="false"
      ></textarea>
    </div>
  </div>
</template>

<style scoped>
.compose-editor {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.compose-editor h3 {
  margin: 0 0 16px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--theme-text);
}

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

.input {
  width: 100%;
  padding: 8px 12px;
  font-family: var(--theme-font);
  font-size: 13px;
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 4px;
  color: var(--theme-text);
}

.input:focus {
  outline: none;
  border-color: var(--theme-accent);
}

.config-selector {
  display: flex;
  gap: 8px;
}

.select {
  flex: 1;
  padding: 8px 12px;
  font-family: var(--theme-font);
  font-size: 13px;
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 4px;
  color: var(--theme-text);
  cursor: pointer;
}

.select:focus {
  outline: none;
  border-color: var(--theme-accent);
}

.generator-section {
  margin-bottom: 16px;
  border: 1px solid var(--theme-border);
  border-radius: 6px;
  overflow: hidden;
}

.generator-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background-color: var(--theme-bg-secondary);
  cursor: pointer;
  user-select: none;
}

.generator-header:hover {
  background-color: rgba(63, 185, 80, 0.05);
}

.generator-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--theme-text);
}

.generator-toggle {
  font-size: 10px;
  color: var(--theme-text-secondary);
  transition: transform 0.2s ease;
}

.generator-toggle.expanded {
  transform: rotate(180deg);
}

.generator-form {
  padding: 16px;
  background-color: var(--theme-bg);
  border-top: 1px solid var(--theme-border);
}

.generator-form .input:disabled,
.generator-form .select:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  background-color: var(--theme-bg);
}

.form-row {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
}

.form-field-inline {
  flex: 1;
}

.form-field-inline label {
  display: block;
  font-size: 12px;
  color: var(--theme-text-secondary);
  margin-bottom: 4px;
}

.radio-group {
  display: flex;
  gap: 12px;
  margin-top: 4px;
}

.radio-option {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--theme-text);
  cursor: pointer;
}

.radio-option input {
  margin: 0;
}

.generator-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--theme-border);
}

.btn-secondary {
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

.btn-secondary:hover {
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

.btn-primary:hover {
  opacity: 0.9;
}

.template-buttons {
  display: flex;
  gap: 6px;
}

.btn-template {
  padding: 4px 8px;
  font-size: 11px;
  font-family: var(--theme-font);
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 4px;
  color: var(--theme-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-template:hover {
  border-color: var(--theme-accent);
  color: var(--theme-accent);
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
</style>
