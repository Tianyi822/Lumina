<script setup lang="ts">
import type { LabCreateType, PortMapping } from '@renderer/stores/lab/types'

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
  <div v-if="createType === 'compose' || createType === 'dockerfile'" class="port-mapping-section">
    <div class="port-mapping-header">
      <h3 class="port-mapping-title">
        端口映射
        <span v-if="portMappings.length > 0" class="port-count">({{ portMappings.length }})</span>
      </h3>
      <div class="port-mapping-actions">
        <button class="btn-small" @click="emit('refresh')">重新解析</button>
        <button class="btn-small" @click="emit('add')">+ 添加</button>
      </div>
    </div>
    <p class="port-mapping-hint">
      已从{{
        createType === 'compose' ? 'docker-compose.yaml' : 'Dockerfile EXPOSE 指令'
      }}自动解析端口映射，您可以手动修改
    </p>

    <div v-if="portMappings.length === 0" class="port-mapping-empty">
      未检测到端口映射，点击“添加”手动配置
    </div>

    <div v-else class="port-mapping-list">
      <div v-for="(mapping, index) in portMappings" :key="index" class="port-mapping-item">
        <div class="port-field host-port">
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
        <span class="port-arrow">→</span>
        <div class="port-field container-port">
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
        <div class="port-field protocol">
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
        <button class="btn-remove" title="删除此端口映射" @click="emit('remove', index)">×</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.port-mapping-section {
  padding: 16px 20px;
  border-top: 1px solid var(--sm-color-border-default);
  background-color: var(--sm-color-bg-app);
}

.port-mapping-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.port-mapping-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
  display: flex;
  align-items: center;
  gap: 6px;
}

.port-count {
  font-size: 12px;
  font-weight: 400;
  color: var(--sm-color-text-secondary);
}

.port-mapping-actions {
  display: flex;
  gap: 8px;
}

.btn-small {
  padding: 4px 10px;
  font-size: 12px;
  font-family: var(--sm-font-sans);
  background-color: var(--sm-color-surface-1);
  border: 1px solid var(--sm-color-border-default);
  border-radius: 4px;
  color: var(--sm-color-text-secondary);
  cursor: pointer;
}

.port-mapping-hint {
  margin: 0 0 12px 0;
  font-size: 12px;
  color: var(--sm-color-text-secondary);
  line-height: 1.5;
}

.port-mapping-empty {
  padding: 16px;
  border: 1px dashed var(--sm-color-border-default);
  border-radius: 8px;
  color: var(--sm-color-text-secondary);
  font-size: 13px;
  text-align: center;
}

.port-mapping-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.port-mapping-item {
  display: grid;
  grid-template-columns: 1fr auto 1fr 120px auto;
  gap: 10px;
  align-items: end;
}

.port-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.port-field label {
  font-size: 12px;
  color: var(--sm-color-text-secondary);
}

.port-field input,
.port-field select {
  padding: 8px 10px;
  border: 1px solid var(--sm-color-border-default);
  border-radius: 6px;
  background-color: var(--sm-color-surface-1);
  color: var(--sm-color-text-primary);
  font-family: var(--sm-font-sans);
}

.port-arrow {
  padding-bottom: 8px;
  color: var(--sm-color-text-secondary);
}

.btn-remove {
  width: 32px;
  height: 32px;
  border: 1px solid var(--sm-color-border-default);
  border-radius: 6px;
  background-color: var(--sm-color-surface-1);
  color: var(--sm-color-status-danger);
  cursor: pointer;
}

@media (max-width: 768px) {
  .port-mapping-item {
    grid-template-columns: 1fr;
  }

  .port-arrow {
    display: none;
  }
}
</style>
