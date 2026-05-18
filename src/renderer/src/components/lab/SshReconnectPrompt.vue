<script setup lang="ts">
import { computed } from 'vue'
import type { LabData } from '@renderer/types/lab'
import styles from './SshReconnectPrompt.module.css'

const props = defineProps<{
  lab: LabData
  password: string
  connecting?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:password', value: string): void
  (e: 'connect'): void
}>()

const ssh = computed(() => props.lab.ssh)
const isPasswordAuth = computed(() => ssh.value?.authType === 'password')
const targetLabel = computed(() => {
  if (!ssh.value) {
    return '远程服务器'
  }

  return `${ssh.value.username}@${ssh.value.host}:${ssh.value.port}`
})

function handlePasswordInput(event: Event): void {
  emit('update:password', (event.target as HTMLInputElement).value)
}
</script>

<template>
  <section v-if="ssh" :class="styles['ssh-reconnect-prompt']" role="status">
    <div :class="styles['ssh-reconnect-prompt__copy']">
      <span :class="styles['ssh-reconnect-prompt__title']">SSH 未连接</span>
      <span :class="styles['ssh-reconnect-prompt__target']">{{ targetLabel }}</span>
    </div>

    <input
      v-if="isPasswordAuth"
      :value="password"
      type="password"
      :class="styles['ssh-reconnect-prompt__password']"
      placeholder="输入 SSH 密码"
      :disabled="connecting"
      @input="handlePasswordInput"
      @keydown.enter="emit('connect')"
    />

    <button
      class="sm-button sm-button--primary sm-button--small"
      :disabled="connecting || (isPasswordAuth && !password.trim())"
      @click="emit('connect')"
    >
      {{ connecting ? '连接中...' : '重新连接' }}
    </button>
  </section>
</template>
