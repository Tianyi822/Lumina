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
  <div class="sm-settings-page knowledge-mcp-settings">
    <header class="sm-settings-page__header">
      <h2 class="sm-settings-page__title">知识库 MCP 服务</h2>
      <p class="sm-settings-page__description">
        将知识库检索能力暴露给外部 MCP 客户端，适用于桌面端、IDE 和其他 AI 工具链。
      </p>
    </header>

    <section class="sm-settings-page__section">
      <div class="sm-settings-page__section-header">
        <div>
          <h3 class="sm-settings-page__section-title">服务状态</h3>
          <p class="sm-settings-page__section-description">
            启停服务后，配置 JSON 会自动更新，可直接复制到支持 MCP 的客户端中。
          </p>
        </div>
      </div>

      <button
        class="mcp-toggle"
        :class="{ enabled: enabled, disabled: toggling || loading }"
        :disabled="toggling || loading"
        type="button"
        @click="handleToggle"
      >
        <div class="toggle-switch">
          <div class="toggle-thumb"></div>
        </div>
        <span class="toggle-label">启用 MCP 服务</span>
        <span v-if="enabled" class="status-badge active">运行中</span>
        <span v-else class="status-badge">已停止</span>
      </button>
    </section>

    <section v-if="enabled && configJSON" class="sm-settings-page__section">
      <div class="config-header">
        <div>
          <h3 class="sm-settings-page__section-title">服务配置</h3>
          <p class="sm-settings-page__section-description">复制后可直接写入 MCP 客户端配置文件。</p>
        </div>
        <button class="sm-button sm-button--small copy-btn" :disabled="copying" @click="copyConfig">
          {{ copying ? '复制中...' : '复制' }}
        </button>
      </div>
      <div class="config-url">
        <span class="url-label">服务地址</span>
        <span class="url-value">{{ status.url }}</span>
      </div>
      <pre class="config-json"><code>{{ configJSON }}</code></pre>
    </section>

    <section class="sm-settings-page__section">
      <div class="sm-settings-page__section-header">
        <div>
          <h3 class="sm-settings-page__section-title">使用说明</h3>
          <p class="sm-settings-page__section-description">
            统一说明服务用途、接入步骤和安全边界，避免页面与弹窗之间出现不同语气。
          </p>
        </div>
      </div>

      <div class="description-section">
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
    </section>
  </div>
</template>

<style scoped>
.knowledge-mcp-settings {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-5);
}

.mcp-toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 12px 14px;
  font-size: 13px;
  background: var(--sm-color-surface-2);
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-md);
  cursor: pointer;
  transition:
    background-color var(--sm-transition-fast),
    border-color var(--sm-transition-fast);
  user-select: none;
}

.mcp-toggle:hover:not(.disabled) {
  border-color: var(--sm-color-border-strong);
  background: var(--sm-color-surface-hover);
}

.mcp-toggle.enabled {
  border-color: var(--sm-color-border-accent);
  background: rgba(142, 149, 217, 0.08);
}

.mcp-toggle.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.toggle-switch {
  width: 36px;
  height: 20px;
  background: var(--sm-color-border-default);
  border-radius: 10px;
  position: relative;
  transition: background-color 0.2s ease;
}

.mcp-toggle.enabled .toggle-switch {
  background: var(--sm-color-accent);
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
  color: var(--sm-color-text-secondary);
}

.mcp-toggle.enabled .toggle-thumb {
  transform: translateX(16px);
  color: var(--sm-color-accent);
}

.toggle-label {
  font-size: 13px;
  color: var(--sm-color-text-primary);
  font-weight: 500;
}

.status-badge {
  margin-left: auto;
  padding: 2px 8px;
  background: var(--sm-color-surface-1);
  border: 1px solid var(--sm-color-border-default);
  border-radius: 999px;
  color: var(--sm-color-text-secondary);
  font-size: 11px;
  font-weight: 600;
  min-width: 18px;
  text-align: center;
}

.status-badge.active {
  background: rgba(142, 149, 217, 0.12);
  border-color: var(--sm-color-border-accent);
  color: var(--sm-color-accent-hover);
}

.config-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.copy-btn {
  font-size: 12px;
}

.config-url {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.url-label {
  font-size: 12px;
  color: var(--sm-color-text-secondary);
}

.url-value {
  font-size: 12px;
  color: var(--sm-color-accent-hover);
  font-family: var(--sm-font-mono);
  word-break: break-all;
}

.config-json {
  margin: 0;
  padding: 14px 16px;
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-md);
  background: var(--sm-color-bg-embedded);
  font-family: var(--sm-font-mono);
  font-size: 12px;
  line-height: 1.5;
  color: var(--sm-color-text-secondary);
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

.description-block {
  padding: 14px 16px;
  background: var(--sm-color-surface-2);
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-md);
}

.description-block h5 {
  font-size: 13px;
  font-weight: 500;
  color: var(--sm-color-text-primary);
  margin: 0 0 8px 0;
}

.description-block p {
  font-size: 13px;
  line-height: 1.6;
  color: var(--sm-color-text-secondary);
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
  color: var(--sm-color-text-secondary);
  margin-bottom: 4px;
}

.description-block.warning {
  background: rgba(197, 161, 101, 0.08);
  border-color: rgba(197, 161, 101, 0.22);
}

.description-block.warning h5 {
  color: var(--sm-color-status-warning);
}
</style>
