<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { KnowledgeMCPServerStatus } from '@shared/types/knowledgeMCP'

interface Emits {
  (e: 'update:errorMessage', value: string): void
  (e: 'update:successMessage', value: string): void
}

const emit = defineEmits<Emits>()

// 服务状态
const status = ref<KnowledgeMCPServerStatus>({
  running: false,
  port: 3100,
  localIP: '127.0.0.1',
  url: ''
})

// 配置 JSON
const configJSON = ref('')

// 加载状态
const loading = ref(false)
const toggling = ref(false)
const copying = ref(false)

// 开关状态
const enabled = computed(() => status.value.running)

// 显示消息
function showError(message: string): void {
  emit('update:errorMessage', message)
}

function showSuccess(message: string): void {
  emit('update:successMessage', message)
  setTimeout(() => {
    emit('update:successMessage', '')
  }, 2000)
}

// 获取服务状态
async function loadStatus(): Promise<void> {
  loading.value = true
  try {
    const result = await window.api.knowledgeMCP.getStatus()
    status.value = result

    if (result.running) {
      configJSON.value = await window.api.knowledgeMCP.getConfig()
    }
  } catch (error) {
    showError(`获取状态失败: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    loading.value = false
  }
}

// 切换服务状态
async function handleToggle(): Promise<void> {
  // 如果正在切换或加载中，不执行操作
  if (toggling.value || loading.value) return

  toggling.value = true
  try {
    if (enabled.value) {
      // 停止服务
      const result = await window.api.knowledgeMCP.stop()
      if (result.success) {
        showSuccess('MCP 服务已停止')
        configJSON.value = ''
      } else {
        showError('停止服务失败')
      }
    } else {
      // 启动服务
      const result = await window.api.knowledgeMCP.start()
      if (result.success) {
        showSuccess('MCP 服务已启动')
        // 刷新配置 JSON
        configJSON.value = await window.api.knowledgeMCP.getConfig()
      } else {
        showError(`启动服务失败: ${result.error || '未知错误'}`)
      }
    }
    await loadStatus()
  } catch (error) {
    showError(`操作失败: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    toggling.value = false
  }
}

// 复制配置
async function copyConfig(): Promise<void> {
  if (!configJSON.value) return

  copying.value = true
  try {
    await navigator.clipboard.writeText(configJSON.value)
    showSuccess('配置已复制到剪贴板')
  } catch (error) {
    showError(`复制失败: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    copying.value = false
  }
}

// 状态变更监听
let cleanup: (() => void) | null = null

onMounted(() => {
  loadStatus()
  cleanup = window.api.knowledgeMCP.onStatusChange((newStatus) => {
    status.value = newStatus
    if (newStatus.running) {
      window.api.knowledgeMCP.getConfig().then((config) => {
        configJSON.value = config
      })
    } else {
      configJSON.value = ''
    }
  })
})

onUnmounted(() => {
  cleanup?.()
})
</script>

<template>
  <div class="knowledge-mcp-settings">
    <!-- 标题 -->
    <h3 class="section-title">知识库 MCP 服务</h3>

    <!-- 功能开关 -->
    <div
      class="mcp-toggle"
      :class="{ enabled: enabled, disabled: toggling || loading }"
      @click="handleToggle"
    >
      <div class="toggle-switch">
        <div class="toggle-thumb">
          <svg v-if="enabled" viewBox="0 0 1024 1024" width="12" height="12">
            <path
              d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm0 820c-205.4 0-372-166.6-372-372s166.6-372 372-372 372 166.6 372 372-166.6 372-372 372z"
              fill="currentColor"
            />
            <path
              d="M512 336m-40 0a40 40 0 1 0 80 0 40 40 0 1 0-80 0zm0 176m-40 0a40 40 0 1 0 80 0 40 40 0 1 0-80 0zm0 176m-40 0a40 40 0 1 0 80 0 40 40 0 1 0-80 0"
              fill="currentColor"
            />
          </svg>
          <svg v-else viewBox="0 0 1024 1024" width="12" height="12">
            <path
              d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm0 820c-205.4 0-372-166.6-372-372s166.6-372 372-372 372 166.6 372 372-166.6 372-372 372z"
              fill="currentColor"
            />
            <path
              d="M512 336m-40 0a40 40 0 1 0 80 0 40 40 0 1 0-80 0zm0 176m-40 0a40 40 0 1 0 80 0 40 40 0 1 0-80 0zm0 176m-40 0a40 40 0 1 0 80 0 40 40 0 1 0-80 0"
              fill="currentColor"
              opacity="0.3"
            />
          </svg>
        </div>
      </div>
      <span class="toggle-label">启用 MCP 服务</span>
      <span v-if="enabled" class="status-badge active">运行中</span>
      <span v-else class="status-badge">已停止</span>
    </div>

    <!-- MCP 配置展示（启用后显示） -->
    <div v-if="enabled && configJSON" class="config-section">
      <div class="config-header">
        <span class="config-title">MCP 配置</span>
        <button class="btn btn-small copy-btn" :disabled="copying" @click="copyConfig">
          {{ copying ? '复制中...' : '复制' }}
        </button>
      </div>
      <div class="config-url">
        <span class="url-label">服务地址：</span>
        <span class="url-value">{{ status.url }}</span>
      </div>
      <pre class="config-json"><code>{{ configJSON }}</code></pre>
    </div>

    <!-- 功能说明 -->
    <div class="description-section">
      <h4 class="description-title">功能说明</h4>

      <div class="description-block">
        <h5>知识库 MCP 服务</h5>
        <p>
          知识库 MCP 服务将您在本应用中创建的知识库通过 MCP 协议对外暴露，让外部 AI
          工具能够搜索和引用您的知识库内容。启用后，其他支持 MCP
          协议的工具可以直接调用知识库搜索功能，获取相关文档片段作为上下文。
        </p>
      </div>

      <div class="description-block">
        <h5>使用场景</h5>
        <ul>
          <li>在 Claude Desktop 中直接搜索和引用您的知识库内容</li>
          <li>在 Cursor、Windsurf 等 IDE 中获取知识库上下文</li>
          <li>让其他支持 MCP 协议的 AI 工具访问您的私有知识</li>
        </ul>
      </div>

      <div class="description-block">
        <h5>如何使用</h5>
        <ol>
          <li>开启上方开关启动 MCP 服务</li>
          <li>复制上方显示的 JSON 配置</li>
          <li>将配置添加到您的 MCP 客户端配置文件中</li>
          <li>重启 MCP 客户端即可使用知识库工具</li>
        </ol>
      </div>

      <div class="description-block warning">
        <h5>安全注意事项</h5>
        <ul>
          <li>服务仅监听本地网络接口，外部设备需要通过局域网访问</li>
          <li>请确保您的防火墙设置允许指定端口的访问</li>
          <li>当前版本不包含认证机制，请在可信网络环境中使用</li>
          <li>关闭应用时服务会自动停止</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.knowledge-mcp-settings {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--theme-text);
  margin: 0 0 4px 0;
}

/* 开关样式 - 模仿 SandboxToolsToggle */
.mcp-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  font-size: 12px;
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius-sm);
  cursor: pointer;
  transition: all 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  user-select: none;
}

.mcp-toggle:hover:not(.disabled) {
  border-color: var(--theme-border-hover);
  background-color: var(--theme-bg-hover);
}

.mcp-toggle.enabled {
  border-color: var(--theme-accent);
  background-color: rgba(52, 122, 115, 0.1);
}

.mcp-toggle.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.toggle-switch {
  width: 36px;
  height: 20px;
  background-color: var(--theme-border);
  border-radius: 10px;
  position: relative;
  transition: background-color 0.2s ease;
}

.mcp-toggle.enabled .toggle-switch {
  background-color: var(--theme-accent);
}

.toggle-thumb {
  width: 16px;
  height: 16px;
  background-color: white;
  border-radius: 50%;
  position: absolute;
  top: 2px;
  left: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s ease;
  color: var(--theme-text-secondary);
}

.mcp-toggle.enabled .toggle-thumb {
  transform: translateX(16px);
  color: var(--theme-accent);
}

.toggle-label {
  font-size: 13px;
  color: var(--theme-text);
  font-weight: 500;
}

.status-badge {
  font-size: 11px;
  padding: 1px 6px;
  background-color: var(--theme-bg);
  border: 1px solid var(--theme-border);
  border-radius: 10px;
  color: var(--theme-text-secondary);
  min-width: 18px;
  text-align: center;
}

.status-badge.active {
  background-color: var(--theme-accent);
  border-color: transparent;
  color: white;
}

/* 配置展示区域 */
.config-section {
  background: var(--glass-white-02, rgba(255, 255, 255, 0.02));
  border: 1px solid var(--glass-white-08, rgba(255, 255, 255, 0.08));
  border-radius: var(--theme-radius-sm);
  overflow: hidden;
}

.config-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--glass-white-03, rgba(255, 255, 255, 0.03));
  border-bottom: 1px solid var(--glass-white-08, rgba(255, 255, 255, 0.08));
}

.config-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--theme-text);
}

.copy-btn {
  font-size: 12px;
  padding: 4px 12px;
}

.config-url {
  padding: 10px 16px;
  background: var(--glass-white-02, rgba(255, 255, 255, 0.02));
  border-bottom: 1px solid var(--glass-white-05, rgba(255, 255, 255, 0.05));
}

.url-label {
  font-size: 12px;
  color: var(--theme-text-secondary);
}

.url-value {
  font-size: 12px;
  color: var(--theme-accent);
  font-family: monospace;
  word-break: break-all;
}

.config-json {
  margin: 0;
  padding: 16px;
  background: var(--theme-bg, rgba(0, 0, 0, 0.2));
  font-family: 'SF Mono', 'Consolas', monospace;
  font-size: 12px;
  line-height: 1.5;
  color: var(--theme-text-secondary);
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.config-json code {
  color: inherit;
  background: none;
}

/* 功能说明 */
.description-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.description-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--theme-text);
  margin: 0;
}

.description-block {
  padding: 12px 16px;
  background: var(--glass-white-02, rgba(255, 255, 255, 0.02));
  border: 1px solid var(--glass-white-05, rgba(255, 255, 255, 0.05));
  border-radius: var(--theme-radius-sm);
}

.description-block h5 {
  font-size: 13px;
  font-weight: 500;
  color: var(--theme-text);
  margin: 0 0 8px 0;
}

.description-block p {
  font-size: 13px;
  line-height: 1.6;
  color: var(--theme-text-secondary);
  margin: 0;
}

.description-block ul,
.description-block ol {
  margin: 0;
  padding-left: 20px;
}

.description-block li {
  font-size: 13px;
  line-height: 1.6;
  color: var(--theme-text-secondary);
  margin-bottom: 4px;
}

.description-block.warning {
  background: rgba(245, 158, 11, 0.05);
  border-color: rgba(245, 158, 11, 0.2);
}

.description-block.warning h5 {
  color: var(--theme-warning);
}
</style>
