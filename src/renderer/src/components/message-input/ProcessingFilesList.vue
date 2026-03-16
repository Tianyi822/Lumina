<script setup lang="ts">
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import type { ProcessingFile } from '@renderer/stores/documentUploadStore'

const props = defineProps<{
  files: ProcessingFile[]
}>()
</script>

<template>
  <div v-if="props.files.length > 0" class="processing-files-list">
    <div v-for="file in props.files" :key="file.tempId" class="processing-file-item">
      <span v-if="file.status === 'uploading'" class="processing-status uploading">
        <SvgIcon class="status-icon" name="spinner" :size="16" :spin="true" />
        上传中: {{ file.fileName }}
      </span>
      <span v-else-if="file.status === 'parsing'" class="processing-status parsing">
        <SvgIcon class="status-icon" name="spinner" :size="16" :spin="true" />
        解析中: {{ file.fileName }}
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
</template>

<style scoped>
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

.processing-status.uploading,
.processing-status.parsing {
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
</style>
