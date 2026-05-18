<script setup lang="ts">
import { ref, watch } from 'vue'
import { useZustandStore } from '@renderer/composables/useZustandStore'
import { useDockerConfigStore } from '@renderer/stores'

const configStore = useZustandStore(useDockerConfigStore)

const props = defineProps<{
  modelValue: string
  context?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'update:context', value: string): void
  (e: 'save-config'): void
}>()

const selectedDockerfileId = ref<string | null>(null)
const localContent = ref(props.modelValue)
const localContext = ref(props.context || '')

const dockerfileExample = `FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
`

watch(
  () => props.modelValue,
  (value) => {
    localContent.value = value
  }
)

watch(
  () => props.context,
  (value) => {
    localContext.value = value || ''
  }
)

watch(localContent, (value) => {
  emit('update:modelValue', value)
})

watch(localContext, (value) => {
  emit('update:context', value)
})

async function loadSelectedDockerfile(): Promise<void> {
  if (!selectedDockerfileId.value) return
  const config = await configStore.loadDockerfileConfig(selectedDockerfileId.value)
  if (config) {
    localContent.value = config.content
  }
}

function useExample(): void {
  localContent.value = dockerfileExample
}

function handleSaveConfig(): void {
  emit('save-config')
}
</script>

<template>
  <div class="dockerfile-editor">
    <h3>Dockerfile 配置</h3>
    <div class="form-field">
      <label>构建上下文路径（可选）</label>
      <input v-model="localContext" type="text" class="input" placeholder="./my-app" />
    </div>

    <div class="form-field">
      <label>
        已保存配置
        <button class="btn-link" @click="handleSaveConfig">另存为</button>
      </label>
      <div class="config-selector">
        <select v-model="selectedDockerfileId" class="select" @change="loadSelectedDockerfile">
          <option :value="null">选择已保存的配置...</option>
          <option
            v-for="config in configStore.dockerfileConfigs"
            :key="config.id"
            :value="config.id"
          >
            {{ config.name }}
          </option>
        </select>
      </div>
    </div>

    <div class="form-field">
      <label>
        Dockerfile
        <button class="btn-link" @click="useExample">使用示例</button>
      </label>
      <textarea
        v-model="localContent"
        class="code-editor"
        placeholder="输入 Dockerfile 内容..."
        spellcheck="false"
      ></textarea>
    </div>
  </div>
</template>

<style scoped>
.dockerfile-editor {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.dockerfile-editor h3 {
  margin: 0 0 16px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
}

.form-field {
  margin-bottom: 16px;
}

.form-field label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: var(--sm-color-text-secondary);
  margin-bottom: 8px;
}

.btn-link {
  background: none;
  border: none;
  color: var(--sm-color-accent);
  font-size: 12px;
  cursor: pointer;
  text-decoration: underline;
}

.input {
  width: 100%;
  padding: 8px 12px;
  font-family: var(--sm-font-sans);
  font-size: 13px;
  background-color: var(--sm-color-surface-1);
  border: 1px solid var(--sm-color-border-default);
  border-radius: 4px;
  color: var(--sm-color-text-primary);
}

.input:focus {
  outline: none;
  border-color: var(--sm-color-accent);
}

.config-selector {
  display: flex;
  gap: 8px;
}

.select {
  flex: 1;
  padding: 8px 12px;
  font-family: var(--sm-font-sans);
  font-size: 13px;
  background-color: var(--sm-color-surface-1);
  border: 1px solid var(--sm-color-border-default);
  border-radius: 4px;
  color: var(--sm-color-text-primary);
  cursor: pointer;
}

.select:focus {
  outline: none;
  border-color: var(--sm-color-accent);
}

.code-editor {
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

.code-editor:focus {
  outline: none;
  border-color: var(--sm-color-accent);
}
</style>
