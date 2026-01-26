<script setup lang="ts">
import { ref, watch } from 'vue'
import KeyValueEditor from './KeyValueEditor.vue'
import type { MCPServerConfig } from '@renderer/types'

interface Props {
  existingNames: string[]
}

interface Emits {
  (e: 'submit', config: MCPServerConfig): void
  (e: 'cancel'): void
  (e: 'test', config: MCPServerConfig): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

// 表单数据
const formData = ref<MCPServerConfig>({
  name: '',
  transport: 'stdio',
  enabled: true,
  command: '',
  args: [],
  env: {},
  url: '',
  headers: {}
})

const argsText = ref('')
const envText = ref('')
const headersText = ref('')
const testing = ref(false)

// 监听 transport 类型变化,重置相关字段
watch(
  () => formData.value.transport,
  (newTransport) => {
    if (newTransport === 'stdio') {
      formData.value.url = ''
      headersText.value = ''
    } else {
      formData.value.command = ''
      argsText.value = ''
      envText.value = ''
    }
  }
)

/**
 * 解析键值对文本
 */
function parseKeyValueText(text: string): Record<string, string> {
  const result: Record<string, string> = {}
  const lines = text.split('\n').filter((line) => line.trim())
  for (const line of lines) {
    const [key, ...valueParts] = line.split('=')
    if (key && valueParts.length > 0) {
      result[key.trim()] = valueParts.join('=').trim()
    }
  }
  return result
}

/**
 * 构建配置对象
 */
function buildConfig(): MCPServerConfig {
  return {
    ...formData.value,
    args: argsText.value
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s),
    env: parseKeyValueText(envText.value),
    headers: parseKeyValueText(headersText.value)
  }
}

/**
 * 验证配置
 */
function validateConfig(): string | null {
  if (!formData.value.name.trim()) {
    return '请输入服务器名称'
  }

  if (props.existingNames.some((n) => n === formData.value.name)) {
    return '该名称已存在'
  }

  if (formData.value.transport === 'stdio') {
    if (!formData.value.command?.trim()) {
      return '请输入执行命令'
    }
  } else {
    if (!formData.value.url?.trim()) {
      return '请输入服务地址'
    }
  }

  return null
}

/**
 * 提交表单
 */
function handleSubmit(): void {
  const error = validateConfig()
  if (error) {
    alert(error)
    return
  }

  emit('submit', buildConfig())
}

/**
 * 测试连接
 */
function handleTest(): void {
  const error = validateConfig()
  if (error) {
    alert(error)
    return
  }

  testing.value = true
  emit('test', buildConfig())
}

/**
 * 取消
 */
function handleCancel(): void {
  emit('cancel')
}
</script>

<template>
  <div class="new-model-form">
    <h3 class="form-section-title">添加 MCP 服务器</h3>
    <div class="form-group">
      <label>服务器名称 <span class="required">*</span></label>
      <input
        v-model="formData.name"
        type="text"
        class="input"
        placeholder="例如: filesystem, github"
      />
    </div>
    <div class="form-group">
      <label>传输类型</label>
      <select v-model="formData.transport" class="input">
        <option value="stdio">stdio (本地进程)</option>
        <option value="sse">SSE (Server-Sent Events)</option>
        <option value="streamableHttp">Streamable HTTP</option>
      </select>
    </div>

    <!-- stdio 配置 -->
    <template v-if="formData.transport === 'stdio'">
      <div class="form-group">
        <label>执行命令 <span class="required">*</span></label>
        <input
          v-model="formData.command"
          type="text"
          class="input"
          placeholder="例如: npx, node, python"
        />
      </div>
      <div class="form-group">
        <label>命令参数 (每行一个)</label>
        <textarea
          v-model="argsText"
          class="input textarea-small"
          placeholder="-y&#10;@modelcontextprotocol/server-xxx"
        ></textarea>
      </div>
      <div class="form-group">
        <label>环境变量 (KEY=VALUE 格式，每行一个)</label>
        <KeyValueEditor
          :model-value="formData.env || {}"
          placeholder="API_KEY=xxx"
          @update:model-value="(val) => (formData.env = val || {})"
        />
      </div>
    </template>

    <!-- HTTP/SSE 配置 -->
    <template v-else>
      <div class="form-group">
        <label>服务地址 <span class="required">*</span></label>
        <input
          v-model="formData.url"
          type="text"
          class="input"
          placeholder="https://example.com/mcp"
        />
      </div>
      <div class="form-group">
        <label>认证头 (KEY=VALUE 格式，每行一个)</label>
        <KeyValueEditor
          :model-value="formData.headers || {}"
          placeholder="Authorization=Bearer your-token"
          @update:model-value="(val) => (formData.headers = val || {})"
        />
      </div>
    </template>

    <div class="form-actions">
      <button class="btn" @click="handleCancel">取消</button>
      <button class="btn" :disabled="testing" @click="handleTest">
        {{ testing ? '测试中...' : '测试连接' }}
      </button>
      <button class="btn-primary" @click="handleSubmit">添加</button>
    </div>
  </div>
</template>
