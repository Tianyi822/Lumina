<script setup lang="ts">
import { computed } from 'vue'
import type { LabData } from '@renderer/types/lab'

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
  <section v-if="ssh" class="ssh-reconnect-prompt" role="status">
    <div class="ssh-reconnect-prompt__copy">
      <span class="ssh-reconnect-prompt__title">SSH 未连接</span>
      <span class="ssh-reconnect-prompt__target">{{ targetLabel }}</span>
    </div>

    <input
      v-if="isPasswordAuth"
      :value="password"
      type="password"
      class="ssh-reconnect-prompt__password"
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

<style scoped>
.ssh-reconnect-prompt {
  display: flex;
  align-items: center;
  gap: var(--sm-space-3);
  min-width: min(520px, 100%);
  padding: var(--sm-space-2) var(--sm-space-3);
  border: 1px solid rgba(210, 153, 34, 0.35);
  border-radius: var(--sm-radius-md);
  background: rgba(210, 153, 34, 0.08);
}

.ssh-reconnect-prompt__copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ssh-reconnect-prompt__title {
  color: var(--sm-color-text-primary);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.2;
}

.ssh-reconnect-prompt__target {
  overflow: hidden;
  color: var(--sm-color-text-secondary);
  font-family: var(--sm-font-mono);
  font-size: 11px;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ssh-reconnect-prompt__password {
  width: 168px;
  min-height: 30px;
  padding: 0 var(--sm-space-3);
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-sm);
  background: var(--sm-color-bg-embedded);
  color: var(--sm-color-text-primary);
  font: inherit;
  font-size: 12px;
}

.ssh-reconnect-prompt__password:focus {
  border-color: var(--sm-color-border-selected);
  outline: none;
}

@media (max-width: 980px) {
  .ssh-reconnect-prompt {
    align-items: stretch;
    flex-direction: column;
  }

  .ssh-reconnect-prompt__password {
    width: 100%;
  }
}
</style>
