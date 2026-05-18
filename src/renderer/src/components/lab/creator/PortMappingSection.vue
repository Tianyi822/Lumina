<script setup lang="ts">
import type { LabCreateType, PortMapping } from '@renderer/stores/lab/types'
import styles from './PortMappingSection.module.css'

defineProps<{
  createType: LabCreateType
  portMappings: PortMapping[]
}>()

const emit = defineEmits<{
  (e: 'refresh'): void
  (e: 'add'): void
  (e: 'update', index: number, patch: Partial<PortMapping>): void
  (e: 'remove', index: number): void
}>()
</script>

<template>
  <div
    v-if="createType === 'compose' || createType === 'dockerfile'"
    :class="styles['port-mapping-section']"
  >
    <div :class="styles['port-mapping-header']">
      <h3 :class="styles['port-mapping-title']">
        端口映射
        <span v-if="portMappings.length > 0" :class="styles['port-count']"
          >({{ portMappings.length }})</span
        >
      </h3>
      <div :class="styles['port-mapping-actions']">
        <button :class="styles['btn-small']" @click="emit('refresh')">重新解析</button>
        <button :class="styles['btn-small']" @click="emit('add')">+ 添加</button>
      </div>
    </div>
    <p :class="styles['port-mapping-hint']">
      已从{{
        createType === 'compose' ? 'docker-compose.yaml' : 'Dockerfile EXPOSE 指令'
      }}自动解析端口映射，您可以手动修改
    </p>

    <div v-if="portMappings.length === 0" :class="styles['port-mapping-empty']">
      未检测到端口映射，点击"添加"手动配置
    </div>

    <div v-else :class="styles['port-mapping-list']">
      <div
        v-for="(mapping, index) in portMappings"
        :key="index"
        :class="styles['port-mapping-item']"
      >
        <div :class="[styles['port-field'], styles['host-port']]">
          <label>主机端口</label>
          <input
            type="number"
            :value="mapping.hostPort ?? ''"
            placeholder="自动"
            min="1"
            max="65535"
            @input="
              emit('update', index, {
                hostPort: ($event.target as HTMLInputElement).value
                  ? parseInt(($event.target as HTMLInputElement).value, 10)
                  : null
              })
            "
          />
        </div>
        <span :class="styles['port-arrow']">→</span>
        <div :class="[styles['port-field'], styles['container-port']]">
          <label>容器端口</label>
          <input
            type="number"
            :value="mapping.containerPort"
            min="1"
            max="65535"
            @input="
              emit('update', index, {
                containerPort: parseInt(($event.target as HTMLInputElement).value, 10)
              })
            "
          />
        </div>
        <div :class="[styles['port-field'], styles['protocol']]">
          <label>协议</label>
          <select
            :value="mapping.protocol"
            @change="
              emit('update', index, {
                protocol: ($event.target as HTMLSelectElement).value as 'tcp' | 'udp'
              })
            "
          >
            <option value="tcp">TCP</option>
            <option value="udp">UDP</option>
          </select>
        </div>
        <button :class="styles['btn-remove']" title="删除此端口映射" @click="emit('remove', index)">
          ×
        </button>
      </div>
    </div>
  </div>
</template>
