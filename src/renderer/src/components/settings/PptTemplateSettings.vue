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
  <div class="sm-settings-page sm-ppt-template-settings">
    <header class="sm-settings-page__header">
      <h2 class="sm-settings-page__title">PPT 模板</h2>
      <p class="sm-settings-page__description">
        管理演示文稿模板上传、分析结果和 AI 总结产物，保持上传区与列表区属于同一套配置系统。
      </p>
    </header>

    <section class="sm-settings-page__section">
      <TemplateUploader @error="showError" @success="showSuccess" />
    </section>

    <section class="sm-settings-page__section">
      <TemplateList />
    </section>
  </div>
</template>

<style scoped>
.sm-ppt-template-settings {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-5);
}
</style>
