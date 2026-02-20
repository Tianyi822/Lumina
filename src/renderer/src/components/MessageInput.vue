<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import MCPToolsPanel from './MCPToolsPanel.vue'
import KnowledgeBasePanel from './KnowledgeBasePanel.vue'
import SandboxToolsToggle from './sandbox/SandboxToolsToggle.vue'
import UserInteractionOptions from './UserInteractionOptions.vue'
import type { AppConfig, MCPTool, KnowledgeBase } from '@renderer/types'
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

    <div class="input-wrapper">
      <textarea
        v-model="localInputMessage"
        class="input message-textarea"
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
          <span class="dropdown-arrow">&#9662;</span>
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
</template>

<style scoped>
.message-input-container {
  padding: 16px 24px 20px;
  background:
    linear-gradient(180deg,
      transparent 0%,
      var(--glass-white-013, rgba(255,255,255,0.013)) 100%),
    var(--theme-bg);
  border-top: 1px solid var(--glass-white-08, rgba(255,255,255,0.08));
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
    linear-gradient(135deg, var(--glass-white-02, rgba(255,255,255,0.02)) 0%, var(--glass-white-01, rgba(255,255,255,0.01)) 100%),
    var(--glass-black-017, rgba(0,0,0,0.017));
  backdrop-filter: blur(12px) saturate(150%);
  -webkit-backdrop-filter: blur(12px) saturate(150%);
  border: 1px solid var(--glass-white-1, rgba(255,255,255,0.1));
  border-radius: var(--theme-radius);
  color: var(--theme-text);
  padding: 12px 16px;
  font-size: 13px;
  transition: all 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.message-textarea:hover {
  border-color: var(--glass-white-15, rgba(255,255,255,0.15));
}

.message-textarea:focus {
  border-color: var(--theme-accent);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.12);
  background:
    linear-gradient(135deg, var(--glass-white-027, rgba(255,255,255,0.027)) 0%, var(--glass-white-017, rgba(255,255,255,0.017)) 100%),
    var(--glass-black-02, rgba(0,0,0,0.02));
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
  font-size: 12px;
}

.model-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.dropdown-arrow {
  font-size: 10px;
  color: var(--theme-text-tertiary);
}

.model-dropdown {
  position: absolute;
  bottom: 100%;
  left: 0;
  margin-bottom: 4px;
  min-width: 200px;
  background:
    linear-gradient(135deg, var(--glass-white-03, rgba(255,255,255,0.03)) 0%, var(--glass-white-017, rgba(255,255,255,0.017)) 100%),
    linear-gradient(225deg, var(--glass-white-023, rgba(255,255,255,0.023)) 0%, var(--glass-white-007, rgba(255,255,255,0.007)) 100%),
    var(--theme-bg-secondary);
  backdrop-filter: blur(28px) saturate(220%) brightness(1.12);
  -webkit-backdrop-filter: blur(28px) saturate(220%) brightness(1.12);
  border: 1px solid var(--glass-white-12, rgba(255,255,255,0.12));
  border-radius: var(--theme-radius);
  box-shadow:
    0 10px 36px rgba(0, 0, 0, 0.2),
    0 3px 10px rgba(0, 0, 0, 0.12),
    inset 0 1px 0 var(--glass-white-15, rgba(255,255,255,0.15));
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
  background: var(--glass-white-08, rgba(255,255,255,0.08));
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

.execute-btn {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

.stop-btn {
  margin-left: auto;
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
</style>
