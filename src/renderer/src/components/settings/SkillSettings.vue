<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { SkillLoadResult } from '@shared/types/skill'
import { useNotification } from '@renderer/composables/useNotification'

const notify = useNotification()

const loading = ref(false)
const saving = ref(false)
const skillResults = ref<SkillLoadResult[]>([])

const validSkillCount = computed(() => {
  return skillResults.value.filter((result) => result.success).length
})

const enabledSkillCount = computed(() => {
  return skillResults.value.filter((result) => result.success && result.skill?.enabled).length
})

async function loadSkills(): Promise<void> {
  loading.value = true
  try {
    skillResults.value = await window.api.skill.list()
  } catch (error) {
    notify.error('Skill 加载失败', error instanceof Error ? error.message : String(error), {
      source: 'settings'
    })
  } finally {
    loading.value = false
  }
}

async function addSkillDirectory(): Promise<void> {
  saving.value = true
  try {
    const result = await window.api.skill.addExternalDirectory()
    if (!result.success) {
      if (result.error !== '已取消选择') {
        notify.error('添加 Skill 失败', result.error || '目录不符合 Skill 规范', {
          source: 'settings'
        })
      }
      return
    }

    notify.success('Skill 已添加', '', { source: 'settings' })
    await loadSkills()
  } finally {
    saving.value = false
  }
}

async function reloadSkills(): Promise<void> {
  loading.value = true
  try {
    skillResults.value = await window.api.skill.reload()
    notify.success('Skill 已重新加载', '', { source: 'settings' })
  } finally {
    loading.value = false
  }
}

async function setSkillEnabled(result: SkillLoadResult, enabled: boolean): Promise<void> {
  saving.value = true
  try {
    const response = await window.api.skill.setEnabled(result.directoryPath, enabled)
    if (!response.success) {
      notify.error('Skill 状态更新失败', response.error || '保存失败', { source: 'settings' })
      return
    }
    await loadSkills()
  } finally {
    saving.value = false
  }
}

async function removeSkill(result: SkillLoadResult): Promise<void> {
  if (!window.confirm(`移除 Skill 目录？\n${result.directoryPath}`)) {
    return
  }

  saving.value = true
  try {
    const response = await window.api.skill.remove(result.directoryPath)
    if (!response.success) {
      notify.error('移除 Skill 失败', response.error || '保存失败', { source: 'settings' })
      return
    }
    await loadSkills()
  } finally {
    saving.value = false
  }
}

function getSkillName(result: SkillLoadResult): string {
  return result.skill?.name || result.directoryPath.split('/').pop() || result.directoryPath
}

onMounted(() => {
  void loadSkills()
})
</script>

<template>
  <div class="skill-settings">
    <div class="skill-settings__header">
      <div>
        <h3 class="skill-settings__title">Skill</h3>
        <p class="skill-settings__summary">
          {{ enabledSkillCount }} 个启用，{{ validSkillCount }} 个可用
        </p>
      </div>
      <div class="skill-settings__actions">
        <button class="sm-button" :disabled="loading || saving" @click="reloadSkills">
          重新加载
        </button>
        <button class="sm-button sm-button--primary" :disabled="saving" @click="addSkillDirectory">
          添加目录
        </button>
      </div>
    </div>

    <div v-if="loading" class="sm-settings-empty">正在加载 Skill...</div>

    <div v-else-if="skillResults.length === 0" class="sm-settings-empty">
      还没有添加外部 Skill 目录。
    </div>

    <div v-else class="skill-settings__list">
      <article
        v-for="result in skillResults"
        :key="result.directoryPath"
        class="skill-settings__item"
        :class="{ 'is-invalid': !result.success }"
      >
        <div class="skill-settings__item-main">
          <div class="skill-settings__item-title-row">
            <h4 class="skill-settings__item-title">{{ getSkillName(result) }}</h4>
            <span class="skill-settings__status" :class="{ 'is-invalid': !result.success }">
              {{ result.success ? '可用' : '校验失败' }}
            </span>
          </div>

          <p v-if="result.skill" class="skill-settings__description">
            {{ result.skill.description }}
          </p>

          <div class="skill-settings__path">{{ result.directoryPath }}</div>

          <div v-if="result.skill" class="skill-settings__meta">
            <span>ID: {{ result.skill.id }}</span>
            <span>版本: {{ result.skill.version }}</span>
            <span v-if="result.skill.language">语言: {{ result.skill.language }}</span>
          </div>

          <div v-if="result.errors?.length" class="skill-settings__errors">
            <div v-for="error in result.errors" :key="error" class="skill-settings__error">
              {{ error }}
            </div>
          </div>
        </div>

        <div class="skill-settings__item-actions">
          <label class="skill-settings__switch skill-settings__switch--compact">
            <input
              type="checkbox"
              :checked="result.enabled"
              :disabled="saving"
              @change="setSkillEnabled(result, ($event.target as HTMLInputElement).checked)"
            />
            <span>{{ result.enabled ? '启用' : '停用' }}</span>
          </label>
          <button
            class="sm-button sm-button--danger"
            :disabled="saving"
            @click="removeSkill(result)"
          >
            移除
          </button>
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped>
.skill-settings {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-4);
}

.skill-settings__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sm-space-4);
}

.skill-settings__title {
  margin: 0;
  color: var(--sm-color-text-primary);
  font-size: 18px;
  font-weight: 600;
}

.skill-settings__summary {
  margin: 6px 0 0;
  color: var(--sm-color-text-secondary);
  font-size: 13px;
}

.skill-settings__actions,
.skill-settings__item-actions {
  display: flex;
  align-items: center;
  gap: var(--sm-space-2);
  flex-wrap: wrap;
}

.skill-settings__switch {
  display: inline-flex;
  align-items: center;
  gap: var(--sm-space-2);
  color: var(--sm-color-text-primary);
  font-size: 13px;
}

.skill-settings__switch input {
  margin: 0;
}

.skill-settings__switch--compact {
  white-space: nowrap;
}

.skill-settings__list {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-3);
}

.skill-settings__item {
  display: flex;
  justify-content: space-between;
  gap: var(--sm-space-4);
  padding: 14px;
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-md);
  background: var(--sm-color-surface-1);
}

.skill-settings__item.is-invalid {
  border-color: var(--sm-color-status-danger);
}

.skill-settings__item-main {
  min-width: 0;
  flex: 1;
}

.skill-settings__item-title-row {
  display: flex;
  align-items: center;
  gap: var(--sm-space-2);
  flex-wrap: wrap;
}

.skill-settings__item-title {
  margin: 0;
  color: var(--sm-color-text-primary);
  font-size: 14px;
  font-weight: 600;
}

.skill-settings__status {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 0 7px;
  border: 1px solid var(--sm-color-status-success);
  border-radius: var(--sm-radius-sm);
  color: var(--sm-color-status-success);
  font-size: 11px;
}

.skill-settings__status.is-invalid {
  border-color: var(--sm-color-status-danger);
  color: var(--sm-color-status-danger);
}

.skill-settings__description {
  margin: 8px 0 0;
  color: var(--sm-color-text-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.skill-settings__path {
  margin-top: 8px;
  color: var(--sm-color-text-tertiary);
  font-family: var(--sm-font-mono);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.skill-settings__meta {
  display: flex;
  gap: var(--sm-space-2);
  flex-wrap: wrap;
  margin-top: 8px;
  color: var(--sm-color-text-tertiary);
  font-size: 12px;
}

.skill-settings__errors {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 10px;
}

.skill-settings__error {
  color: var(--sm-color-status-danger);
  font-size: 12px;
  line-height: 1.4;
}

@media (max-width: 760px) {
  .skill-settings__header,
  .skill-settings__item,
  .skill-settings__controls {
    align-items: stretch;
    flex-direction: column;
  }

  .skill-settings__actions,
  .skill-settings__item-actions {
    justify-content: flex-start;
  }
}
</style>
