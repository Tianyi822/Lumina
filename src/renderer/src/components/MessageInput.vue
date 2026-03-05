<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed, inject } from 'vue'
import { storeToRefs } from 'pinia'
import MCPToolsPanel from './MCPToolsPanel.vue'
import KnowledgeBasePanel from './KnowledgeBasePanel.vue'
import SandboxToolsToggle from './sandbox/SandboxToolsToggle.vue'
import UserInteractionOptions from './UserInteractionOptions.vue'
import type { AppConfig, MCPTool, KnowledgeBase } from '@renderer/types'
import { useUIStateStore, useChatStreamStore } from '@renderer/stores'
import { useDocumentUploadStore } from '../stores/documentUploadStore'
import type { AttachedDocument } from '@shared/types/chat'
import { getFileTypeIcon, getFileExtension } from '@renderer/utils/fileIcons'

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
    enableSandboxTools: boolean,
    attachedDocuments: AttachedDocument[]
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

// 文档上传 store
const documentStore = useDocumentUploadStore()

// 拖拽状态
const isDragging = ref(false)

// 会话 ID prop（需要父组件传入）
const sessionId = inject<string>('sessionId', '')

// 临时会话 ID，用于在没有实际会话时上传文档
const TEMP_SESSION_ID = 'temp'

// 获取有效的会话 ID（实际 sessionId 或临时 ID）
const effectiveSessionId = computed(() => sessionId || TEMP_SESSION_ID)

// 获取当前会话的待发送文档
const pendingDocs = computed(() => {
  return documentStore.getSessionDocuments(effectiveSessionId.value)
})

// 获取处理中的文件
const processingFiles = computed(() => {
  return documentStore.getSessionProcessingFiles(effectiveSessionId.value)
})

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
 * 处理拖拽进入
 */
function handleDragOver(event: DragEvent): void {
  event.preventDefault()
  if (!props.isSending) {
    isDragging.value = true
  }
}

/**
 * 处理拖拽离开
 */
function handleDragLeave(event: DragEvent): void {
  event.preventDefault()
  isDragging.value = false
}

/**
 * 处理文件放置
 */
async function handleDrop(event: DragEvent): Promise<void> {
  event.preventDefault()
  isDragging.value = false

  if (props.isSending) return

  const files = Array.from(event.dataTransfer?.files || [])
  await processDroppedFiles(files)
}

/**
 * 处理拖拽的文件列表
 */
async function processDroppedFiles(files: File[]): Promise<void> {
  const MAX_SIZE = 10 * 1024 * 1024 // 10MB
  const SUPPORTED_TYPES = ['.txt', '.md', '.pdf', '.doc', '.docx', '.csv', '.pptx']
  const validFiles: File[] = []

  for (const file of files) {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase()
    if (!SUPPORTED_TYPES.includes(ext)) {
      alert(`文件 "${file.name}" 格式不支持，仅支持 ${SUPPORTED_TYPES.join(', ')}`)
      continue
    }

    if (file.size > MAX_SIZE) {
      alert(`文件 "${file.name}" 过大（${formatFileSize(file.size)}），最大支持 10MB`)
      continue
    }

    validFiles.push(file)
  }

  for (const file of validFiles) {
    try {
      await documentStore.uploadDocument(effectiveSessionId.value, file)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      window.api.logger.error('[MessageInput] 拖拽上传文档失败', {
        fileName: file.name,
        error: errorMessage
      })
      alert(`上传文档 "${file.name}" 失败: ${errorMessage}`)
    }
  }
}

/**
 * 触发文档上传
 */
function triggerDocumentUpload(): void {
  if (props.isSending) return

  const input = document.createElement('input')
  input.type = 'file'
  input.multiple = true
  input.accept = '.txt,.md,.pdf,.doc,.docx,.csv,.pptx'

  input.onchange = async (e) => {
    const files = (e.target as HTMLInputElement).files
    if (!files || files.length === 0) return

    const MAX_SIZE = 10 * 1024 * 1024 // 10MB
    const validFiles: File[] = []

    for (const file of Array.from(files)) {
      if (file.size > MAX_SIZE) {
        window.api.logger.warn('[MessageInput] 文件过大', {
          fileName: file.name,
          size: file.size
        })
        alert(`文件 "${file.name}" 过大（${formatFileSize(file.size)}），最大支持 10MB`)
        continue
      }
      validFiles.push(file)
    }

    for (const file of validFiles) {
      try {
        await documentStore.uploadDocument(effectiveSessionId.value, file)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        window.api.logger.error('[MessageInput] 上传文档失败', {
          fileName: file.name,
          error: errorMessage
        })
        alert(`上传文档 "${file.name}" 失败: ${errorMessage}`)
      }
    }
  }

  input.click()
}

/**
 * 移除待发送的文档
 */
function removePendingDoc(index: number): void {
  documentStore.removePendingDocument(effectiveSessionId.value, index)
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
  if ((message.trim() || pendingDocs.value.length > 0) && !props.isSending) {
    // 调试日志：确认发送时的工具选择状态
    window.api.logger.debug('[MessageInput] 发送消息，选中的工具', {
      count: localSelectedTools.value.length,
      sandboxToolsEnabled: localEnableSandboxTools.value
    })

    // 获取待发送的文档
    const docsToSend = pendingDocs.value.map((doc) => ({
      fileName: doc.fileName,
      fileType: doc.fileType,
      fileSize: doc.fileSize,
      parsedContent: doc.parsedContent
    }))

    emit(
      'send',
      message.trim(),
      localSelectedModel.value,
      localSelectedTools.value,
      localSelectedKnowledgeBases.value,
      localEnableSandboxTools.value,
      docsToSend
    )

    // 清空输入和文档列表
    localInputMessage.value = ''
    emit('update:inputMessage', '')
    documentStore.clearPendingDocuments(effectiveSessionId.value)
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
    localEnableSandboxTools.value,
    []
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

    <!-- 待发送文档列表 -->
    <div v-if="pendingDocs.length > 0" class="pending-docs-list">
      <div v-for="(doc, index) in pendingDocs" :key="index" class="pending-doc-item">
        <svg
          class="pending-doc-icon"
          width="16"
          height="16"
          viewBox="0 0 1024 1024"
          :style="{ color: getFileTypeIcon(doc.fileName).color }"
        >
          <path :d="getFileTypeIcon(doc.fileName).path" fill="currentColor" />
        </svg>
        <div class="pending-doc-info">
          <span class="pending-doc-name" :title="doc.fileName">{{ doc.fileName }}</span>
          <span class="pending-doc-type">{{
            getFileExtension(doc.fileName).toUpperCase() || 'FILE'
          }}</span>
          <span class="pending-doc-size">{{ formatFileSize(doc.fileSize) }}</span>
        </div>
        <button
          class="pending-doc-remove"
          title="移除"
          :disabled="isSending"
          @click="removePendingDoc(index)"
        >
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

    <!-- 处理中的文件列表 -->
    <div v-if="processingFiles.length > 0" class="processing-files-list">
      <div v-for="file in processingFiles" :key="file.tempId" class="processing-file-item">
        <span v-if="file.status === 'uploading'" class="processing-status uploading">
          <svg class="status-icon" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M554.25503 768.57657H469.113887a42.570572 42.570572 0 1 0 0 85.141143h85.141143a42.570572 42.570572 0 0 0 0-85.141143z m341.311426 170.282287h-42.570572A511.593712 511.593712 0 0 0 682.713598 580.369832c-26.139825-25.392973-59.748171-50.785945-59.748171-67.963544s25.392973-25.392973 42.570571-34.355199a433.92109 433.92109 0 0 0 187.459886-392.09737h42.570572a40.330015 40.330015 0 0 0 42.570572-43.317424 40.330015 40.330015 0 0 0-42.570572-42.570572H127.802461A40.330015 40.330015 0 0 0 85.23189 42.636295a40.330015 40.330015 0 0 0 42.570571 43.317424h42.570572A433.92109 433.92109 0 0 0 357.832919 478.051089c17.177599 8.962226 42.570572 26.139825 42.570572 34.355199s-33.608346 42.570572-59.748171 74.685213a472.010549 472.010549 0 0 0-170.282287 349.526799H127.802461a43.317424 43.317424 0 0 0 0 85.887996h767.763995a43.317424 43.317424 0 0 0 0-85.887996z m-640.05228 0a435.414795 435.414795 0 0 1 144.889315-298.740854C443.720914 597.547431 486.291486 554.976859 486.291486 512.406288s-34.355198-74.685213-74.685213-102.318743a345.045686 345.045686 0 0 1-156.092097-324.133826h512.340565a345.045686 345.045686 0 0 1-153.85154 324.133826c-42.570572 25.392973-74.685213 50.785945-74.685213 102.318743S581.888559 597.547431 625.205983 640.118003a435.414795 435.414795 0 0 1 144.889314 298.740854z"
            />
          </svg>
          上传中: {{ file.fileName }}
        </span>
        <span v-else-if="file.status === 'completed'" class="processing-status completed">
          完成: {{ file.fileName }}
        </span>
        <span v-else-if="file.status === 'failed'" class="processing-status failed">
          失败: {{ file.fileName }}
          <span v-if="file.error" class="processing-error"> - {{ file.error }}</span>
        </span>
      </div>
    </div>

    <div
      class="input-wrapper"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @drop="handleDrop"
    >
      <textarea
        v-model="localInputMessage"
        class="input message-textarea"
        :class="{ 'has-docs': pendingDocs.length > 0, dragging: isDragging }"
        placeholder="输入命令或消息，可拖拽文件上传 ..."
        rows="3"
        :disabled="isSending"
        @keydown="handleKeydown"
      ></textarea>

      <div v-if="isDragging" class="drag-overlay">
        <div class="drag-hint">
          <svg width="48" height="48" viewBox="0 0 1024 1024" fill="currentColor">
            <path
              d="M500.330144 493.959456C525.31082 468.616741 525.197683 428.317299 500.330144 403.44976 475.50786 378.627476 435.2763 378.491711 409.820448 403.44976L206.128377 607.051321C143.699314 670.023442 143.857706 771.05489 206.128377 833.325561 268.421675 895.618859 369.453124 895.777251 432.402617 833.325561L817.068825 448.659353C879.520515 386.207663 879.520515 284.836803 817.068825 222.385113 754.639762 159.95605 653.246275 159.933423 590.794585 222.385113L579.526128 233.74408C560.790621 252.479587 530.379363 252.479587 511.643856 233.74408 492.930976 215.0312 492.908349 184.64257 511.643856 165.861808L522.912313 154.502841C623.287566 54.625392 785.186785 54.738529 884.951097 154.502841 984.71541 254.267154 984.873802 416.121117 884.951097 516.541625L500.262262 901.185206C400.22642 1000.451715 238.576103 1000.225441 138.9023 900.551638 39.251125 800.900463 39.002223 639.227518 138.29136 539.214304L341.938176 335.567488C404.751905 273.115798 505.89649 273.251562 568.212416 335.567488 630.528342 397.883414 630.664106 499.027999 568.212416 561.841728L375.879312 754.174832C357.143805 772.910339 326.732547 772.910339 307.99704 754.174832 289.261533 735.439325 289.261533 705.028067 307.99704 686.29256L500.330144 493.959456Z"
            />
          </svg>
          <p>释放文件以上传</p>
        </div>
      </div>
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
        <!-- 文档上传按钮 -->
        <button
          class="document-upload-btn"
          :class="{ 'has-docs': pendingDocs.length > 0 }"
          :disabled="isSending"
          title="上传文档 (txt, md, pdf, doc, docx, csv, pptx)"
          @click="triggerDocumentUpload"
        >
          <svg width="18" height="18" viewBox="0 0 1024 1024" fill="currentColor">
            <path
              d="M500.330144 493.959456C525.31082 468.616741 525.197683 428.317299 500.330144 403.44976 475.50786 378.627476 435.2763 378.491711 409.820448 403.44976L206.128377 607.051321C143.699314 670.023442 143.857706 771.05489 206.128377 833.325561 268.421675 895.618859 369.453124 895.777251 432.402617 833.325561L817.068825 448.659353C879.520515 386.207663 879.520515 284.836803 817.068825 222.385113 754.639762 159.95605 653.246275 159.933423 590.794585 222.385113L579.526128 233.74408C560.790621 252.479587 530.379363 252.479587 511.643856 233.74408 492.930976 215.0312 492.908349 184.64257 511.643856 165.861808L522.912313 154.502841C623.287566 54.625392 785.186785 54.738529 884.951097 154.502841 984.71541 254.267154 984.873802 416.121117 884.951097 516.541625L500.262262 901.185206C400.22642 1000.451715 238.576103 1000.225441 138.9023 900.551638 39.251125 800.900463 39.002223 639.227518 138.29136 539.214304L341.938176 335.567488C404.751905 273.115798 505.89649 273.251562 568.212416 335.567488 630.528342 397.883414 630.664106 499.027999 568.212416 561.841728L375.879312 754.174832C357.143805 772.910339 326.732547 772.910339 307.99704 754.174832 289.261533 735.439325 289.261533 705.028067 307.99704 686.29256L500.330144 493.959456Z"
            />
          </svg>
          <span v-if="pendingDocs.length > 0" class="doc-count">{{ pendingDocs.length }}</span>
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
  position: relative;
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

.message-textarea.dragging {
  border-color: var(--theme-accent);
  background: rgba(70, 170, 143, 0.05);
  box-shadow: 0 0 0 3px rgba(70, 170, 143, 0.2);
}

.drag-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(70, 170, 143, 0.1);
  border: 2px dashed var(--theme-accent);
  border-radius: var(--theme-radius);
  pointer-events: none;
  z-index: 10;
}

.drag-hint {
  text-align: center;
  color: var(--theme-accent);
}

.drag-hint svg {
  margin-bottom: 8px;
}

.drag-hint p {
  font-size: 14px;
  font-weight: 500;
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

/* ==================== 待发送文档列表样式 ==================== */
.pending-docs-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.pending-doc-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: linear-gradient(135deg, rgba(70, 170, 143, 0.08) 0%, rgba(70, 170, 143, 0.03) 100%);
  border: 1px solid rgba(70, 170, 143, 0.2);
  border-radius: var(--theme-radius-sm, 6px);
  font-size: 12px;
  color: var(--theme-text);
  max-width: 280px;
  transition: all 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.pending-doc-item:hover {
  background: linear-gradient(135deg, rgba(70, 170, 143, 0.12) 0%, rgba(70, 170, 143, 0.05) 100%);
  border-color: rgba(70, 170, 143, 0.3);
}

.pending-doc-icon {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
}

.pending-doc-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pending-doc-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
  font-size: 12px;
  line-height: 1.4;
}

.pending-doc-type {
  font-size: 10px;
  font-weight: 600;
  color: var(--theme-accent);
  opacity: 0.8;
  line-height: 1.3;
}

.pending-doc-size {
  font-size: 10px;
  color: var(--theme-text-tertiary);
  opacity: 0.7;
  line-height: 1.3;
}

.pending-doc-remove {
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

.pending-doc-remove:hover {
  background: rgba(239, 68, 68, 0.1);
  color: var(--theme-danger);
}

.pending-doc-remove:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ==================== 处理中文件样式 ==================== */
.processing-files-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
}

.processing-file-item {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  background: linear-gradient(
    135deg,
    var(--glass-white-03, rgba(255, 255, 255, 0.03)) 0%,
    var(--glass-white-017, rgba(255, 255, 255, 0.017)) 100%
  );
  border: 1px solid var(--glass-white-1, rgba(255, 255, 255, 0.1));
  border-radius: var(--theme-radius-sm, 6px);
  font-size: 12px;
  color: var(--theme-text);
}

.processing-status {
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-icon {
  width: 14px;
  height: 14px;
  fill: currentColor;
  flex-shrink: 0;
}

.processing-status.uploading {
  color: var(--theme-text-secondary);
}

.processing-status.completed {
  color: var(--theme-accent);
}

.processing-status.failed {
  color: var(--theme-danger);
}

.processing-error {
  font-size: 11px;
  opacity: 0.8;
}

/* ==================== 文档上传按钮样式 ==================== */
.document-upload-btn {
  position: relative;
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

.document-upload-btn:hover {
  background: var(--glass-white-08, rgba(255, 255, 255, 0.08));
  border-color: var(--glass-white-15, rgba(255, 255, 255, 0.15));
  color: var(--theme-text);
}

.document-upload-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.document-upload-btn.has-docs {
  color: var(--theme-accent);
  border-color: rgba(70, 170, 143, 0.3);
  background: rgba(70, 170, 143, 0.1);
}

.document-upload-btn .doc-count {
  position: absolute;
  top: -4px;
  right: -4px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  background: var(--theme-accent);
  color: white;
  font-size: 10px;
  font-weight: 600;
  border-radius: 50%;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}
</style>
