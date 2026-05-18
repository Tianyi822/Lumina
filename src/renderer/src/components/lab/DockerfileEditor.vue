<script setup lang="ts">
import { ref, watch } from 'vue'
import { useZustandStore } from '@renderer/composables/useZustandStore'
import { useDockerConfigStore } from '@renderer/stores'
import styles from './DockerfileEditor.module.css'

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
  <div :class="styles['dockerfile-editor']">
    <h3>Dockerfile 配置</h3>
    <div :class="styles['form-field']">
      <label>构建上下文路径（可选）</label>
      <input v-model="localContext" type="text" :class="styles['input']" placeholder="./my-app" />
    </div>

    <div :class="styles['form-field']">
      <label>
        已保存配置
        <button :class="styles['btn-link']" @click="handleSaveConfig">另存为</button>
      </label>
      <div :class="styles['config-selector']">
        <select
          v-model="selectedDockerfileId"
          :class="styles['select']"
          @change="loadSelectedDockerfile"
        >
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

    <div :class="styles['form-field']">
      <label>
        Dockerfile
        <button :class="styles['btn-link']" @click="useExample">使用示例</button>
      </label>
      <textarea
        v-model="localContent"
        :class="styles['code-editor']"
        placeholder="输入 Dockerfile 内容..."
        spellcheck="false"
      ></textarea>
    </div>
  </div>
</template>
