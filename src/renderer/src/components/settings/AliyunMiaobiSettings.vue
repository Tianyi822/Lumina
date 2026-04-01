<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { AliyunMiaobiConfig } from '@shared/types/config'

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

const loading = ref(false)
const saving = ref(false)
const testing = ref(false)
const form = ref<AliyunMiaobiConfig>({
  accessKeyId: '',
  accessKeySecret: '',
  workspaceId: ''
})

const hasChanges = computed(() => {
  return Boolean(
    form.value.accessKeyId.trim() ||
    form.value.accessKeySecret.trim() ||
    form.value.workspaceId.trim()
  )
})

const canTest = computed(() => {
  return Boolean(
    form.value.accessKeyId.trim() &&
    form.value.accessKeySecret.trim() &&
    form.value.workspaceId.trim()
  )
})

function showError(message: string): void {
  emit('update:successMessage', '')
  emit('update:errorMessage', message)
}

function showSuccess(message: string): void {
  emit('update:errorMessage', '')
  emit('update:successMessage', message)
  setTimeout(() => {
    emit('update:successMessage', '')
  }, 2000)
}

async function loadConfig(): Promise<void> {
  loading.value = true
  try {
    const result = await window.api.pptExport.getConfig()
    if (!result.success) {
      showError(result.error || '加载妙笔配置失败')
      return
    }

    form.value = { ...result.config }
  } catch (error) {
    showError(`加载妙笔配置失败: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    loading.value = false
  }
}

async function handleSave(): Promise<void> {
  saving.value = true
  try {
    const result = await window.api.pptExport.saveConfig({
      accessKeyId: form.value.accessKeyId.trim(),
      accessKeySecret: form.value.accessKeySecret.trim(),
      workspaceId: form.value.workspaceId.trim()
    })

    if (!result.success) {
      showError(result.error || '保存妙笔配置失败')
      return
    }

    showSuccess('妙笔配置已保存')
  } catch (error) {
    showError(`保存妙笔配置失败: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    saving.value = false
  }
}

function buildPlainConfig(): AliyunMiaobiConfig {
  return {
    accessKeyId: form.value.accessKeyId.trim(),
    accessKeySecret: form.value.accessKeySecret.trim(),
    workspaceId: form.value.workspaceId.trim()
  }
}

async function handleTest(): Promise<void> {
  if (!canTest.value) {
    showError('请先完整填写 AccessKey ID、AccessKey Secret 和 Workspace ID')
    return
  }

  testing.value = true
  try {
    const result = await window.api.pptExport.testConfig(buildPlainConfig())
    if (!result.success) {
      showError(result.error || '妙笔配置测试失败')
      return
    }

    showSuccess('妙笔配置测试成功')
  } catch (error) {
    showError(`妙笔配置测试失败: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    testing.value = false
  }
}

onMounted(() => {
  void loadConfig()
})
</script>

<template>
  <div class="sm-settings-page sm-aliyun-miaobi-settings">
    <header class="sm-settings-page__header">
      <h2 class="sm-settings-page__title">妙笔 PPT</h2>
      <p class="sm-settings-page__description">
        配置阿里云妙笔生成 PPT 所需的 AccessKey 与 Workspace ID。
      </p>
    </header>

    <section class="sm-settings-page__section sm-aliyun-miaobi-settings__panel">
      <div class="sm-form__group">
        <label class="sm-form__label" for="aliyun-access-key-id">AccessKey ID</label>
        <input
          id="aliyun-access-key-id"
          v-model="form.accessKeyId"
          class="sm-input"
          type="text"
          autocomplete="off"
          placeholder="请输入阿里云 AccessKey ID"
        />
      </div>

      <div class="sm-form__group">
        <label class="sm-form__label" for="aliyun-access-key-secret">AccessKey Secret</label>
        <input
          id="aliyun-access-key-secret"
          v-model="form.accessKeySecret"
          class="sm-input"
          type="password"
          autocomplete="off"
          placeholder="请输入阿里云 AccessKey Secret"
        />
      </div>

      <div class="sm-form__group">
        <label class="sm-form__label" for="aliyun-workspace-id">Workspace ID</label>
        <input
          id="aliyun-workspace-id"
          v-model="form.workspaceId"
          class="sm-input"
          type="text"
          autocomplete="off"
          placeholder="请输入百炼业务空间 ID"
        />
      </div>

      <div class="sm-aliyun-miaobi-settings__actions">
        <button
          class="sm-button sm-button--secondary"
          :disabled="loading || saving || testing"
          @click="loadConfig"
        >
          {{ loading ? '加载中...' : '重新加载' }}
        </button>
        <button
          class="sm-button sm-button--secondary"
          :disabled="loading || saving || testing || !canTest"
          @click="handleTest"
        >
          {{ testing ? '测试中...' : '测试配置' }}
        </button>
        <button
          class="sm-button sm-button--primary"
          :disabled="loading || saving || testing || !hasChanges"
          @click="handleSave"
        >
          {{ saving ? '保存中...' : '保存配置' }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.sm-aliyun-miaobi-settings {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-5);
}

.sm-aliyun-miaobi-settings__panel {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-4);
}

.sm-aliyun-miaobi-settings__panel :deep(.sm-form__group) {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-2);
}

.sm-aliyun-miaobi-settings__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--sm-space-3);
}
</style>
