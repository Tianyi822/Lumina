<script setup lang="ts">
import { ref, watch } from 'vue'
import { useZustandStore } from '@renderer/composables/useZustandStore'
import { useDockerConfigStore, useLabCreatorStore, useComposeConfigStore } from '@renderer/stores'
import styles from './ComposeEditor.module.css'

type ComposeTemplateType = 'image' | 'build' | 'mixed'

const configStore = useZustandStore(useDockerConfigStore)
const creatorStore = useZustandStore(useLabCreatorStore)
const composeConfigStore = useZustandStore(useComposeConfigStore)

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
  const config = await configStore.loadComposeConfig(selectedComposeId.value)
  if (config) {
    localContent.value = config.content
    localProjectName.value = config.name
  }
}

function useTemplate(templateType: ComposeTemplateType): void {
  localContent.value = creatorStore.getComposeTemplate(templateType)
}

function handleInsertServiceConfig(): void {
  // 使用 composeConfigStore 中的插入逻辑（支持服务替换）
  composeConfigStore.composeContent = localContent.value
  creatorStore.insertServiceConfig()
  localContent.value = composeConfigStore.composeContent
}

function handleSaveConfig(): void {
  emit('save-config')
}

function clearContent(): void {
  localContent.value = "version: '3.8'\n\nservices:\n"
}
</script>

<template>
  <div :class="styles['compose-editor']">
    <h3>Docker Compose 配置</h3>
    <div :class="styles['form-field']">
      <label>项目名称（可选）</label>
      <input
        v-model="localProjectName"
        type="text"
        :class="styles['input']"
        placeholder="my-project"
      />
    </div>

    <div :class="styles['form-field']">
      <label>
        已保存配置
        <button :class="styles['btn-link']" @click="handleSaveConfig">另存为</button>
      </label>
      <div :class="styles['config-selector']">
        <select v-model="selectedComposeId" :class="styles['select']" @change="loadSelectedCompose">
          <option :value="null">选择已保存的配置...</option>
          <option v-for="config in configStore.composeConfigs" :key="config.id" :value="config.id">
            {{ config.name }}
          </option>
        </select>
      </div>
    </div>

    <div :class="styles['generator-section']">
      <div
        :class="styles['generator-header']"
        @click="composeConfigStore.showGenerator = !composeConfigStore.showGenerator"
      >
        <span :class="styles['generator-title']">构建配置生成器</span>
        <span
          :class="[
            styles['generator-toggle'],
            { [styles['expanded']]: composeConfigStore.showGenerator }
          ]"
          >▼</span
        >
      </div>

      <div v-if="composeConfigStore.showGenerator" :class="styles['generator-form']">
        <div :class="styles['form-row']">
          <div :class="styles['form-field-inline']">
            <label>服务名称</label>
            <input
              :value="composeConfigStore.generatorForm.serviceName"
              type="text"
              :class="styles['input']"
              placeholder="app"
              @input="
                creatorStore.updateGeneratorForm({
                  serviceName: ($event.target as HTMLInputElement).value
                })
              "
            />
          </div>
          <div :class="styles['form-field-inline']">
            <label>来源类型</label>
            <div :class="styles['radio-group']">
              <label :class="styles['radio-option']">
                <input
                  :checked="composeConfigStore.generatorForm.sourceType === 'image'"
                  type="radio"
                  value="image"
                  @change="creatorStore.updateGeneratorForm({ sourceType: 'image' })"
                />
                <span>镜像</span>
              </label>
              <label :class="styles['radio-option']">
                <input
                  :checked="composeConfigStore.generatorForm.sourceType === 'build'"
                  type="radio"
                  value="build"
                  @change="creatorStore.updateGeneratorForm({ sourceType: 'build' })"
                />
                <span>构建</span>
              </label>
            </div>
          </div>
        </div>

        <div
          v-if="composeConfigStore.generatorForm.sourceType === 'image'"
          :class="styles['form-field']"
        >
          <label>镜像名称</label>
          <input
            :value="composeConfigStore.generatorForm.image"
            type="text"
            :class="styles['input']"
            placeholder="node:18-alpine"
            @input="
              creatorStore.updateGeneratorForm({ image: ($event.target as HTMLInputElement).value })
            "
          />
        </div>

        <template v-else>
          <div :class="styles['form-field']">
            <label>
              使用已保存的 Dockerfile
              <button
                v-if="composeConfigStore.generatorForm.useSavedDockerfile"
                :class="styles['btn-link']"
                @click="creatorStore.clearSavedDockerfile()"
              >
                清除选择
              </button>
            </label>
            <select
              :value="composeConfigStore.generatorForm.savedDockerfileId"
              :class="styles['select']"
              @change="
                creatorStore.updateGeneratorForm({
                  savedDockerfileId: ($event.target as any)?.value || null
                });
                creatorStore.onSavedDockerfileSelect()
              "
            >
              <option :value="null">不使用已保存的 Dockerfile</option>
              <option
                v-for="config in configStore.dockerfileConfigs"
                :key="config.id"
                :value="config.id"
              >
                {{ config.name }}
              </option>
            </select>
          </div>

          <div :class="styles['form-row']">
            <div :class="styles['form-field-inline']">
              <label>构建上下文</label>
              <input
                :value="composeConfigStore.generatorForm.context"
                type="text"
                :class="styles['input']"
                placeholder="./app"
                :disabled="composeConfigStore.generatorForm.useSavedDockerfile"
                @input="
                  creatorStore.updateGeneratorForm({
                    context: ($event.target as HTMLInputElement).value
                  })
                "
              />
            </div>
            <div :class="styles['form-field-inline']">
              <label>Dockerfile 名称</label>
              <input
                :value="composeConfigStore.generatorForm.dockerfile"
                type="text"
                :class="styles['input']"
                placeholder="Dockerfile"
                :disabled="composeConfigStore.generatorForm.useSavedDockerfile"
                @input="
                  creatorStore.updateGeneratorForm({
                    dockerfile: ($event.target as HTMLInputElement).value
                  })
                "
              />
            </div>
          </div>
          <div :class="styles['form-field']">
            <label>构建参数（可选，逗号分隔，格式：key=value）</label>
            <input
              :value="composeConfigStore.generatorForm.buildArgs"
              type="text"
              :class="styles['input']"
              placeholder="NODE_VERSION=18,API_KEY=xxx"
              @input="
                creatorStore.updateGeneratorForm({
                  buildArgs: ($event.target as HTMLInputElement).value
                })
              "
            />
          </div>
        </template>

        <div :class="styles['form-row']">
          <div :class="styles['form-field-inline']">
            <label>端口映射（可选，逗号分隔）</label>
            <input
              :value="composeConfigStore.generatorForm.ports"
              type="text"
              :class="styles['input']"
              placeholder="3000:3000,8080:8080"
              @input="
                creatorStore.updateGeneratorForm({
                  ports: ($event.target as HTMLInputElement).value
                })
              "
            />
          </div>
          <div :class="styles['form-field-inline']">
            <label>环境变量（可选，逗号分隔）</label>
            <input
              :value="composeConfigStore.generatorForm.environment"
              type="text"
              :class="styles['input']"
              placeholder="NODE_ENV=development,DEBUG=true"
              @input="
                creatorStore.updateGeneratorForm({
                  environment: ($event.target as HTMLInputElement).value
                })
              "
            />
          </div>
        </div>

        <div :class="styles['generator-actions']">
          <button :class="styles['btn-secondary']" @click="creatorStore.resetGeneratorForm()">
            重置
          </button>
          <button :class="styles['btn-primary']" @click="handleInsertServiceConfig">
            插入配置
          </button>
        </div>
      </div>
    </div>

    <div :class="styles['form-field']">
      <label>
        docker-compose.yaml
        <div :class="styles['template-buttons']">
          <button :class="[styles['btn-template'], styles['btn-clear']]" @click="clearContent">
            清空
          </button>
          <button :class="styles['btn-template']" @click="useTemplate('image')">镜像模板</button>
          <button :class="styles['btn-template']" @click="useTemplate('build')">
            Dockerfile 模板
          </button>
          <button :class="styles['btn-template']" @click="useTemplate('mixed')">混合模板</button>
        </div>
      </label>
      <textarea
        v-model="localContent"
        :class="styles['code-editor']"
        placeholder="输入 Docker Compose 配置..."
        spellcheck="false"
      ></textarea>
    </div>
  </div>
</template>
