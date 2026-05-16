<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import InteractiveTerminalPanel from './InteractiveTerminalPanel.vue'
import type { ContainerDetails, LabData } from '@renderer/types/lab'

const props = defineProps<{
  isSshLab: boolean
  isDockerReady: boolean
  currentLab: LabData | null
  selectedContainer: ContainerDetails | null
  isSshConnected: boolean
  labDetailTab: 'stats' | 'terminal' | 'logs'
}>()

const sshTerminalSubtitle = computed(() => {
  const ssh = props.currentLab?.ssh
  if (!ssh) {
    return ''
  }

  return `${ssh.username}@${ssh.host}:${ssh.port}`
})

const dockerTerminalTitle = computed(() => {
  return props.selectedContainer?.names[0]?.replace(/^\//, '') || '未命名容器'
})

const dockerTerminalSubtitle = computed(() => {
  const container = props.selectedContainer
  if (!container) {
    return ''
  }

  return `${container.shortId} · ${container.image}`
})

const terminalTargetKey = computed(() => {
  if (props.currentLab?.backendType === 'ssh') {
    return props.currentLab.status === 'running' ? `ssh:${props.currentLab.labId}` : null
  }

  return props.selectedContainer ? `docker:${props.selectedContainer.id}` : null
})

const renderedTerminalKey = ref<string | null>(null)

watch(
  () => [props.labDetailTab, terminalTargetKey.value] as const,
  ([tab, targetKey], oldValue) => {
    const oldTargetKey = oldValue?.[1]
    if (!targetKey) {
      renderedTerminalKey.value = null
      return
    }

    if (oldTargetKey && targetKey !== oldTargetKey && renderedTerminalKey.value === oldTargetKey) {
      renderedTerminalKey.value = null
    }

    if (tab === 'terminal') {
      renderedTerminalKey.value = targetKey
    }
  },
  { immediate: true }
)
</script>

<template>
  <template v-if="isSshLab">
    <InteractiveTerminalPanel
      v-if="currentLab && isSshConnected && renderedTerminalKey === terminalTargetKey"
      :key="terminalTargetKey || undefined"
      backend="ssh"
      :target-id="currentLab.labId"
      :title="currentLab.name"
      :subtitle="sshTerminalSubtitle"
    />
    <section v-else class="ssh-terminal-connect-panel">
      <div class="ssh-terminal-connect-panel__copy">
        <h2>SSH 未连接</h2>
        <p>请使用上方连接提示重新连接 {{ sshTerminalSubtitle || '远程服务器' }}。</p>
      </div>
    </section>
  </template>
  <template v-else>
    <div v-if="!isDockerReady" class="detail-empty-state">
      <div class="sm-empty detail-empty-card">
        <h2>Docker 未就绪</h2>
        <p>本地 Docker 运行时不可用，容器终端功能暂时无法使用。</p>
      </div>
    </div>
    <div v-else-if="!selectedContainer" class="detail-empty-state">
      <div class="sm-empty detail-empty-card">
        <h2>终端尚未绑定容器</h2>
        <p>选中目标容器后，可在这里执行临时命令、定位问题并确认运行环境。</p>
      </div>
    </div>
    <InteractiveTerminalPanel
      v-else-if="renderedTerminalKey === terminalTargetKey"
      :key="terminalTargetKey || undefined"
      backend="docker"
      :target-id="selectedContainer.id"
      :title="dockerTerminalTitle"
      :subtitle="dockerTerminalSubtitle"
    />
  </template>
</template>
