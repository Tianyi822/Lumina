<script setup lang="ts">
import type { PaperAnnotationColorKey } from '@shared/types/paper'
import type { SelectionActionMenuState } from '../composables/usePaperAnnotationComposer'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import styles from './PaperAnnotationSelectionMenu.module.css'

defineProps<{
  state: SelectionActionMenuState
  highlightColorOptions: readonly PaperAnnotationColorKey[]
  error: string | null
}>()

const emit = defineEmits<{
  (e: 'create-highlight', colorKey: PaperAnnotationColorKey): void
  (e: 'open-note-editor'): void
  (e: 'add-to-chat'): void
  (e: 'cancel'): void
}>()
</script>

<template>
  <div
    :class="styles['paper-annotation-selection-menu']"
    :style="{
      left: `${state.x}px`,
      top: `${state.y}px`
    }"
    @mousedown.prevent
  >
    <div :class="styles['paper-annotation-selection-menu__row']">
      <button
        v-for="colorKey in highlightColorOptions"
        :key="colorKey"
        :class="styles['paper-annotation-selection-menu__color-btn']"
        type="button"
        :title="colorKey"
        @click="emit('create-highlight', colorKey)"
      >
        <span
          :class="[
            styles['paper-annotation-selection-menu__dot'],
            styles[`paper-annotation-selection-menu__dot--${colorKey}`]
          ]"
        />
      </button>

      <div :class="styles['paper-annotation-selection-menu__divider-v']" />

      <button
        :class="styles['paper-annotation-selection-menu__note-btn']"
        type="button"
        @click="emit('open-note-editor')"
      >
        <SvgIcon :class="styles['paper-annotation-selection-menu__icon']" name="note" :size="14" />
        <span class="paper-annotation-selection-menu__label">记录笔记</span>
      </button>

      <div :class="styles['paper-annotation-selection-menu__divider-v']" />

      <button
        :class="styles['paper-annotation-selection-menu__note-btn']"
        type="button"
        @click="emit('add-to-chat')"
      >
        <SvgIcon :class="styles['paper-annotation-selection-menu__icon']" name="chat" :size="14" />
        <span class="paper-annotation-selection-menu__label">添加到对话</span>
      </button>
    </div>

    <p v-if="error" :class="styles['paper-annotation-selection-menu__error']">
      {{ error }}
    </p>
  </div>
</template>
