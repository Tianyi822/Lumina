<script setup lang="ts">
import { onMounted } from 'vue'
import { usePptTemplateStore } from '@renderer/stores'
import { TemplateUploader, TemplateList } from './ppt-template'

interface Props {
  errorMessage?: string
  successMessage?: string
}

interface Emits {
  (e: 'update:errorMessage', value: string): void
  (e: 'update:successMessage', value: string): void
}

defineProps<Props>()
const emit = defineEmits<Emits>()

const pptTemplateStore = usePptTemplateStore()

/** 显示错误消息 */
function showError(message: string): void {
  emit('update:errorMessage', message)
}

/** 显示成功消息 */
function showSuccess(message: string): void {
  emit('update:successMessage', message)
  setTimeout(() => {
    emit('update:successMessage', '')
  }, 3000)
}

// 组件挂载时加载模板列表
onMounted(() => {
  pptTemplateStore.loadTemplates()
})
</script>

<template>
  <div class="ppt-template-settings">
    <!-- 上传区域 -->
    <TemplateUploader @error="showError" @success="showSuccess" />

    <!-- 模板列表 -->
    <TemplateList />
  </div>
</template>

<style scoped>
.ppt-template-settings {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
</style>
