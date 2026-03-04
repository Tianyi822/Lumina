<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import MCPToolsPanel from './MCPToolsPanel.vue'
import KnowledgeBasePanel from './KnowledgeBasePanel.vue'
import SandboxToolsToggle from './sandbox/SandboxToolsToggle.vue'
import UserInteractionOptions from './UserInteractionOptions.vue'
import type { AppConfig, MCPTool, KnowledgeBase, AttachmentFile } from '@renderer/types'
import { useUIStateStore, useChatStreamStore } from '@renderer/stores'

const props = defineProps<{
  isSending?: boolean
  inputMessage?: string
  selectedModel?: string
  selectedMCPTools?: MCPTool[]
  selectedKnowledgeBases?: KnowledgeBase[]
  enableSandboxTools?: boolean
}>()

const emit = defineEmits<{
  (
    e: 'send',
    message: string,
    model: string,
    selectedMCPTools: MCPTool[],
    selectedKnowledgeBases: KnowledgeBase[],
    enableSandboxTools: boolean
  ): void
  (e: 'stop'): void
  (e: 'update:inputMessage', value: string): void
  (e: 'update:selectedModel', value: string): void
  (e: 'update:selectedMCPTools', value: MCPTool[]): void
  (e: 'update:selectedKnowledgeBases', value: KnowledgeBase[]): void
  (e: 'update:enableSandboxTools', value: boolean): void
}>()

// 本地输入状态 - 确保与会话独立
const localInputMessage = ref(props.inputMessage ?? '')
const localSelectedModel = ref(props.selectedModel ?? '')
const localSelectedTools = ref<MCPTool[]>(props.selectedMCPTools ?? [])
const localSelectedKnowledgeBases = ref<KnowledgeBase[]>(props.selectedKnowledgeBases ?? [])
const localEnableSandboxTools = ref(props.enableSandboxTools ?? false)

// 附件列表
const attachments = ref<AttachmentFile[]>([])

// 同步 props 到本地状态
watch(
  () => props.inputMessage,
  (newVal) => {
    if (newVal !== undefined && newVal !== localInputMessage.value) {
      localInputMessage.value = newVal
    }
  },
  { immediate: true }
)

// 当本地输入变化时，同步到父组件
watch(localInputMessage, (newVal) => {
  if (newVal !== props.inputMessage) {
    emit('update:inputMessage', newVal)
  }
})

watch(
  () => props.selectedModel,
  (newVal) => {
    if (newVal !== undefined && newVal !== localSelectedModel.value) {
      localSelectedModel.value = newVal
    }
  },
  { immediate: true }
)

watch(
  () => props.selectedMCPTools,
  (newVal) => {
    if (newVal !== undefined && newVal !== localSelectedTools.value) {
      localSelectedTools.value = newVal
    }
  },
  { immediate: true, deep: true }
)

watch(
  () => props.selectedKnowledgeBases,
  (newVal) => {
    if (newVal !== undefined && newVal !== localSelectedKnowledgeBases.value) {
      localSelectedKnowledgeBases.value = newVal
    }
  },
  { immediate: true, deep: true }
)

watch(
  () => props.enableSandboxTools,
  (newVal) => {
    if (newVal !== undefined && newVal !== localEnableSandboxTools.value) {
      localEnableSandboxTools.value = newVal
    }
  },
  { immediate: true }
)

function updateSelectedModel(value: string): void {
  localSelectedModel.value = value
  emit('update:selectedModel', value)
}

function updateSelectedTools(tools: MCPTool[]): void {
  localSelectedTools.value = tools
  emit('update:selectedMCPTools', tools)
}

function updateSelectedKnowledgeBases(kbs: KnowledgeBase[]): void {
  localSelectedKnowledgeBases.value = kbs
  emit('update:selectedKnowledgeBases', kbs)
}

function updateEnableSandboxTools(enabled: boolean): void {
  localEnableSandboxTools.value = enabled
  emit('update:enableSandboxTools', enabled)
  window.api.logger.debug('[MessageInput] 沙箱工具开关状态变更', { enabled })
}

/**
 * 格式化文件大小
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

/**
 * 打开文件选择对话框
 */
async function handleSelectFiles(): Promise<void> {
  try {
    const files = await window.api.file.selectFiles()
    if (files && files.length > 0) {
      // 过滤掉已存在的文件
      const existingPaths = new Set(attachments.value.map((f) => f.path))
      const newFiles = files.filter((f) => !existingPaths.has(f.path))
      attachments.value.push(...newFiles)
    }
  } catch (error) {
    window.api.logger.error('[MessageInput] 选择文件失败', { error })
  }
}

/**
 * 移除附件
 */
function removeAttachment(index: number): void {
  attachments.value.splice(index, 1)
}

// 从配置中加载的模型选项
const modelOptions = ref<string[]>([])

// 是否显示模型选择下拉
const showModelDropdown = ref(false)

// 模型选择器容器引用
const modelSelectorRef = ref<HTMLElement | null>(null)

// 从 Store 获取配置更新标志
const uiStateStore = useUIStateStore()
const { configUpdateKey } = storeToRefs(uiStateStore)

// 用户交互选项状态
const chatStreamStore = useChatStreamStore()
const { showUserInteraction, userInteractionInfo } = storeToRefs(chatStreamStore)

// 加载已配置的模型列表
async function loadConfiguredModels(): Promise<void> {
  try {
    const config = (await window.api.config.getConfig()) as AppConfig | null
    if (config?.llm_config?.models) {
      modelOptions.value = config.llm_config.models.map((m) => m.model_name)

      // 设置默认选中模型（只在当前没有选中模型时）
      if (!localSelectedModel.value || !modelOptions.value.includes(localSelectedModel.value)) {
        const defaultModel = config.llm_config.default_model
        if (defaultModel && modelOptions.value.includes(defaultModel)) {
          updateSelectedModel(defaultModel)
        } else if (modelOptions.value.length > 0) {
          updateSelectedModel(modelOptions.value[0])
        } else {
          updateSelectedModel('')
        }
      }
    } else {
      modelOptions.value = []
      if (localSelectedModel.value) {
        updateSelectedModel('')
      }
    }
  } catch (error) {
    console.error('加载模型配置失败:', error)
    modelOptions.value = []
    if (localSelectedModel.value) {
      updateSelectedModel('')
    }
  }
}

// 监听配置更新
watch(configUpdateKey, () => {
  loadConfiguredModels()
})

function handleSend(): void {
  const message = localInputMessage.value
  if (message.trim() && !props.isSending) {
    // 调试日志：确认发送时的工具选择状态
    window.api.logger.debug('[MessageInput] 发送消息，选中的工具', {
      count: localSelectedTools.value.length,
      sandboxToolsEnabled: localEnableSandboxTools.value
    })
    emit(
      'send',
      message.trim(),
      localSelectedModel.value,
      localSelectedTools.value,
      localSelectedKnowledgeBases.value,
      localEnableSandboxTools.value
    )
    localInputMessage.value = ''
    emit('update:inputMessage', '')
  }
}

// 处理 MCP 工具选择（多选）
function handleMCPToolsSelected(tools: MCPTool[]): void {
  window.api.logger.debug('[MessageInput] 接收到工具选择事件', {
    count: tools.length
  })
  updateSelectedTools(tools)
}

function handleStop(): void {
  emit('stop')
}

function handleUserInteractionSelect(_value: string, label: string): void {
  chatStreamStore.hideUserInteraction()
  const message = `我选择：${label}`
  emit(
    'send',
    message,
    localSelectedModel.value,
    localSelectedTools.value,
    localSelectedKnowledgeBases.value,
    localEnableSandboxTools.value
  )
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    handleSend()
  }
}

function selectModel(model: string): void {
  updateSelectedModel(model)
  showModelDropdown.value = false
}

function toggleModelDropdown(): void {
  if (!props.isSending) {
    showModelDropdown.value = !showModelDropdown.value
  }
}

/**
 * 处理点击外部区域，关闭下拉菜单
 */
function handleClickOutside(event: MouseEvent): void {
  if (showModelDropdown.value && modelSelectorRef.value) {
    const target = event.target as Node
    if (!modelSelectorRef.value.contains(target)) {
      showModelDropdown.value = false
    }
  }
}

onMounted(() => {
  loadConfiguredModels()
  // 添加全局点击事件监听器
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  // 移除全局点击事件监听器
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div class="message-input-container">
    <!-- 用户交互选项 -->
    <UserInteractionOptions
      v-if="showUserInteraction && userInteractionInfo"
      :interaction-info="userInteractionInfo"
      @select="handleUserInteractionSelect"
    />

    <!-- 附件列表 -->
    <div v-if="attachments.length > 0" class="attachments-list">
      <div v-for="(file, index) in attachments" :key="file.path" class="attachment-item">
        <svg class="attachment-icon" width="16" height="16" viewBox="0 0 1024 1024">
          <path
            d="M538.5216 212.9408h289.64864c25.36448 0 48.88576 4.4544 70.58432 13.3632q33.13664 13.59872 60.59008 41.05216C995.62496 303.616 1013.76 347.3408 1013.76 398.53056v354.08896c0 51.16928-18.13504 94.88384-54.41536 131.1744-36.28032 36.27008-80.00512 54.40512-131.1744 54.40512H206.06976c-25.36448 0-48.88576-4.4544-70.58432-13.3632-22.09792-9.0624-42.2912-22.75328-60.59008-41.05216q-27.4432-27.4432-41.05216-60.57984C24.9344 801.4848 20.48 777.97376 20.48 752.60928V267.5712c0-25.41568 4.46464-48.98816 13.40416-70.71744 9.0624-22.05696 22.7328-42.22976 41.0112-60.5184 18.29888-18.28864 38.48192-31.97952 60.5696-41.05216C157.184 86.3744 180.70528 81.92 206.06976 81.92H317.2352c18.944 0 36.7616 3.05152 53.48352 9.15456 16.5888 6.05184 32.08192 15.11424 46.47936 27.1872l106.67008 89.344c4.23936 3.55328 9.1136 5.3248 14.6432 5.3248zM828.16 866.304c31.3344 0 58.112-11.1104 80.34304-33.3312 22.23104-22.2208 33.35168-49.00864 33.35168-80.35328l-0.12288-354.03776c0-15.54432-2.73408-29.98272-8.192-43.29472-5.56032-13.5168-13.93664-25.88672-25.1392-37.09952-11.2128-11.22304-23.59296-19.6096-37.14048-25.16992-13.28128-5.45792-27.68896-8.192-43.2128-8.192H538.37824a94.18752 94.18752 0 0 1-32.8192-5.65248 93.97248 93.97248 0 0 1-27.99616-16.4352l-106.60864-89.35424a82.42176 82.42176 0 0 0-24.09472-14.336 83.03616 83.03616 0 0 0-29.63456-5.2224H206.06976c-15.4624 0-29.82912 2.70336-43.06944 8.12032-13.58848 5.56032-26.0096 13.96736-37.2736 25.23136-22.23104 22.24128-33.35168 49.03936-33.35168 80.384v485.04832c0 31.3344 11.1104 58.12224 33.3312 80.34304 22.2208 22.23104 49.00864 33.35168 80.36352 33.35168h622.10048zM615.43424 394.24H828.416c26.10176 0 47.11424 16.05632 47.11424 35.84s-21.10464 35.84-47.11424 35.84H615.424c-26.0096 0-47.11424-16.05632-47.11424-35.84s21.10464-35.84 47.11424-35.84z"
            fill="currentColor"
          />
        </svg>
        <span class="attachment-name" :title="file.name">{{ file.name }}</span>
        <span class="attachment-size">{{ formatFileSize(file.size) }}</span>
        <button class="attachment-remove" title="移除" @click="removeAttachment(index)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path
              d="M6 18L18 6M6 6l12 12"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>

    <div class="input-wrapper">
      <textarea
        v-model="localInputMessage"
        class="input message-textarea"
        :class="{ 'has-attachments': attachments.length > 0 }"
        placeholder="输入命令或消息 ..."
        rows="3"
        :disabled="isSending"
        @keydown="handleKeydown"
      ></textarea>
    </div>
    <div class="input-actions">
      <!-- 模型选择器 -->
      <div ref="modelSelectorRef" class="model-selector">
        <button class="btn model-btn" :disabled="isSending" @click="toggleModelDropdown">
          <span>{{ localSelectedModel || '选择模型' }}</span>
          <span class="dropdown-arrow" :class="{ open: showModelDropdown }">▼</span>
        </button>
        <div v-if="showModelDropdown" class="model-dropdown">
          <div v-if="modelOptions.length === 0" class="model-option empty">暂无模型配置</div>
          <div
            v-for="model in modelOptions"
            :key="model"
            class="model-option"
            :class="{ active: model === localSelectedModel }"
            @click="selectModel(model)"
          >
            {{ model }}
          </div>
        </div>
      </div>

      <!-- MCP 工具选择器 -->
      <MCPToolsPanel
        :selected-tools="localSelectedTools"
        @tools-selected="handleMCPToolsSelected"
      />

      <!-- 知识库选择器 -->
      <KnowledgeBasePanel
        :selected-knowledge-bases="localSelectedKnowledgeBases"
        @selection-change="updateSelectedKnowledgeBases"
      />

      <!-- 沙箱工具开关 -->
      <SandboxToolsToggle
        v-model="localEnableSandboxTools"
        :disabled="isSending"
        @change="updateEnableSandboxTools"
      />

      <!-- 附件按钮和执行按钮组 -->
      <div class="action-buttons-group">
        <!-- 附件按钮 -->
        <button
          class="attachment-btn"
          :class="{ 'has-attachments': attachments.length > 0 }"
          :disabled="isSending"
          title="添加附件"
          @click="handleSelectFiles"
        >
          <svg width="18" height="18" viewBox="0 0 1024 1024">
            <path
              d="M538.5216 212.9408h289.64864c25.36448 0 48.88576 4.4544 70.58432 13.3632q33.13664 13.59872 60.59008 41.05216C995.62496 303.616 1013.76 347.3408 1013.76 398.53056v354.08896c0 51.16928-18.13504 94.88384-54.41536 131.1744-36.28032 36.27008-80.00512 54.40512-131.1744 54.40512H206.06976c-25.36448 0-48.88576-4.4544-70.58432-13.3632-22.09792-9.0624-42.2912-22.75328-60.59008-41.05216q-27.4432-27.4432-41.05216-60.57984C24.9344 801.4848 20.48 777.97376 20.48 752.60928V267.5712c0-25.41568 4.46464-48.98816 13.40416-70.71744 9.0624-22.05696 22.7328-42.22976 41.0112-60.5184 18.29888-18.28864 38.48192-31.97952 60.5696-41.05216C157.184 86.3744 180.70528 81.92 206.06976 81.92H317.2352c18.944 0 36.7616 3.05152 53.48352 9.15456 16.5888 6.05184 32.08192 15.11424 46.47936 27.1872l106.67008 89.344c4.23936 3.55328 9.1136 5.3248 14.6432 5.3248zM828.16 866.304c31.3344 0 58.112-11.1104 80.34304-33.3312 22.23104-22.2208 33.35168-49.00864 33.35168-80.35328l-0.12288-354.03776c0-15.54432-2.73408-29.98272-8.192-43.29472-5.56032-13.5168-13.93664-25.88672-25.1392-37.09952-11.2128-11.22304-23.59296-19.6096-37.14048-25.16992-13.28128-5.45792-27.68896-8.192-43.2128-8.192H538.37824a94.18752 94.18752 0 0 1-32.8192-5.65248 93.97248 93.97248 0 0 1-27.99616-16.4352l-106.60864-89.35424a82.42176 82.42176 0 0 0-24.09472-14.336 83.03616 83.03616 0 0 0-29.63456-5.2224H206.06976c-15.4624 0-29.82912 2.70336-43.06944 8.12032-13.58848 5.56032-26.0096 13.96736-37.2736 25.23136-22.23104 22.24128-33.35168 49.03936-33.35168 80.384v485.04832c0 31.3344 11.1104 58.12224 33.3312 80.34304 22.2208 22.23104 49.00864 33.35168 80.36352 33.35168h622.10048zM615.43424 394.24H828.416c26.10176 0 47.11424 16.05632 47.11424 35.84s-21.10464 35.84-47.11424 35.84H615.424c-26.0096 0-47.11424-16.05632-47.11424-35.84s21.10464-35.84 47.11424-35.84z"
              fill="currentColor"
            />
          </svg>
        </button>

        <!-- 执行/停止按钮 -->
        <button v-if="!isSending" class="btn-primary execute-btn" @click="handleSend">
          <span>执行</span>
          <span class="shortcut-hint">⌘↵</span>
        </button>
        <button v-else class="btn-danger stop-btn" @click="handleStop">
          <span>停止</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.message-input-container {
  padding: 16px 24px 20px;
  background:
    linear-gradient(
      180deg,
      transparent 0%,
      var(--glass-white-013, rgba(255, 255, 255, 0.013)) 100%
    ),
    var(--theme-bg);
  border-top: 1px solid var(--theme-border);
}

.input-wrapper {
  margin-bottom: 12px;
}

.message-textarea {
  width: 100%;
  min-height: 80px;
  resize: vertical;
  font-family: var(--theme-font);
  line-height: 1.5;
  background:
    linear-gradient(
      135deg,
      var(--glass-white-02, rgba(255, 255, 255, 0.02)) 0%,
      var(--glass-white-01, rgba(255, 255, 255, 0.01)) 100%
    ),
    var(--glass-black-017, rgba(0, 0, 0, 0.017));
  backdrop-filter: blur(12px) saturate(150%);
  -webkit-backdrop-filter: blur(12px) saturate(150%);
  border: 1px solid #46aa8f;
  border-radius: var(--theme-radius);
  color: var(--theme-text);
  padding: 12px 16px;
  font-size: 13px;
  transition: all 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.message-textarea:hover {
  border-color: #3d9980;
}

.message-textarea:focus {
  border-color: var(--theme-accent);
  box-shadow: 0 0 0 3px rgba(70, 170, 143, 0.15);
  background:
    linear-gradient(
      135deg,
      var(--glass-white-027, rgba(255, 255, 255, 0.027)) 0%,
      var(--glass-white-017, rgba(255, 255, 255, 0.017)) 100%
    ),
    var(--glass-black-02, rgba(0, 0, 0, 0.02));
  outline: none;
}

.message-textarea:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.input-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.model-selector {
  position: relative;
}

.model-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 12px;
  transition: all 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.model-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.dropdown-arrow {
  font-size: 10px;
  color: var(--theme-text-tertiary);
  transition: transform 0.2s ease;
}

.dropdown-arrow.open {
  transform: rotate(180deg);
}

.model-dropdown {
  position: absolute;
  bottom: 100%;
  left: 0;
  margin-bottom: 4px;
  min-width: 200px;
  background:
    linear-gradient(
      135deg,
      var(--glass-white-03, rgba(255, 255, 255, 0.03)) 0%,
      var(--glass-white-017, rgba(255, 255, 255, 0.017)) 100%
    ),
    linear-gradient(
      225deg,
      var(--glass-white-023, rgba(255, 255, 255, 0.023)) 0%,
      var(--glass-white-007, rgba(255, 255, 255, 0.007)) 100%
    ),
    var(--theme-bg-secondary);
  backdrop-filter: blur(28px) saturate(220%) brightness(1.12);
  -webkit-backdrop-filter: blur(28px) saturate(220%) brightness(1.12);
  border: 1px solid var(--glass-white-12, rgba(255, 255, 255, 0.12));
  border-radius: var(--theme-radius);
  box-shadow:
    0 10px 36px rgba(0, 0, 0, 0.2),
    0 3px 10px rgba(0, 0, 0, 0.12),
    inset 0 1px 0 var(--glass-white-15, rgba(255, 255, 255, 0.15));
  overflow: hidden;
  z-index: 100;
}

.model-option {
  padding: 9px 14px;
  font-size: 13px;
  color: var(--theme-text);
  cursor: pointer;
  transition: all 0.12s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  white-space: nowrap;
}

.model-option:hover {
  background: var(--glass-white-08, rgba(255, 255, 255, 0.08));
  color: var(--theme-text);
}

.model-option.active {
  color: var(--theme-accent);
}

.model-option.empty {
  color: var(--theme-text-tertiary);
  font-style: italic;
  cursor: default;
}

.model-option.empty:hover {
  background-color: transparent;
}

.action-buttons-group {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.execute-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #70d75c;
  border-color: rgba(112, 215, 92, 0.4);
}

.execute-btn:hover {
  background: #5fc34a;
}

.stop-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.4);
  color: var(--theme-danger);
}

.stop-btn:hover {
  background: rgba(239, 68, 68, 0.25);
  border-color: var(--theme-danger);
}

.shortcut-hint {
  font-size: 11px;
  opacity: 0.6;
}

/* ==================== 附件列表样式 ==================== */
.attachments-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.attachment-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: linear-gradient(
    135deg,
    var(--glass-white-03, rgba(255, 255, 255, 0.03)) 0%,
    var(--glass-white-017, rgba(255, 255, 255, 0.017)) 100%
  );
  border: 1px solid var(--glass-white-1, rgba(255, 255, 255, 0.1));
  border-radius: var(--theme-radius-sm, 6px);
  font-size: 12px;
  color: var(--theme-text);
  max-width: 280px;
  transition: all 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.attachment-item:hover {
  background: var(--glass-white-05, rgba(255, 255, 255, 0.05));
  border-color: var(--glass-white-15, rgba(255, 255, 255, 0.15));
}

.attachment-icon {
  flex-shrink: 0;
  color: var(--theme-accent);
  opacity: 0.8;
}

.attachment-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

.attachment-size {
  flex-shrink: 0;
  color: var(--theme-text-tertiary);
  font-size: 11px;
}

.attachment-remove {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--theme-text-tertiary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.attachment-remove:hover {
  background: var(--glass-white-1, rgba(255, 255, 255, 0.1));
  color: var(--theme-danger);
}

/* ==================== 附件按钮样式 ==================== */
.attachment-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  background: linear-gradient(
    135deg,
    var(--glass-white-05, rgba(255, 255, 255, 0.05)) 0%,
    var(--glass-white-027, rgba(255, 255, 255, 0.027)) 100%
  );
  border: 1px solid var(--glass-white-1, rgba(255, 255, 255, 0.1));
  border-radius: 50%;
  color: var(--theme-text-tertiary);
  cursor: pointer;
  transition: all 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  box-shadow:
    0 4px 16px rgba(0, 0, 0, 0.15),
    0 2px 6px rgba(0, 0, 0, 0.1),
    inset 0 1px 0 var(--glass-white-15, rgba(255, 255, 255, 0.15));
}

.attachment-btn:hover {
  background: var(--glass-white-08, rgba(255, 255, 255, 0.08));
  border-color: var(--glass-white-15, rgba(255, 255, 255, 0.15));
  color: var(--theme-text);
}

.attachment-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.attachment-btn.has-attachments {
  color: var(--theme-accent);
  border-color: rgba(70, 170, 143, 0.3);
  background: rgba(70, 170, 143, 0.1);
}
</style>
