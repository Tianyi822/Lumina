<script setup lang="ts">
import { useRuntimePlatform } from '@renderer/composables/useRuntimePlatform'
import WorkspaceViewSwitcher from './WorkspaceViewSwitcher.vue'
import styles from './WorkspaceSidebarChrome.module.css'

defineProps<{
  count: number
  actionsKey?: string
}>()

const { isWindows, usesNativeTrafficLights } = useRuntimePlatform()
</script>

<template>
  <header
    :class="[
      styles['sm-sidebar-shell__header'],
      'sm-sidebar-shell__header--chrome',
      {
        'sm-sidebar-shell__header--chrome-mac': usesNativeTrafficLights,
        'sm-sidebar-shell__header--chrome-windows': isWindows
      }
    ]"
  >
    <div
      v-if="usesNativeTrafficLights || isWindows"
      :class="[
        styles['sm-sidebar-shell__chrome-action-hitbox'],
        { [styles['sm-sidebar-shell__chrome-action-hitbox--windows']]: isWindows }
      ]"
      aria-hidden="true"
    ></div>

    <div class="sm-sidebar-shell__switcher-row">
      <div class="sm-sidebar-shell__switcher-card">
        <WorkspaceViewSwitcher />
      </div>
      <span class="sm-sidebar-shell__count">{{ count }}</span>
    </div>

    <Transition name="sm-sidebar-actions-switch" mode="out-in" appear>
      <div
        v-if="$slots.actions"
        :key="actionsKey || 'sidebar-actions'"
        class="sm-sidebar-shell__actions"
      >
        <slot name="actions" />
      </div>
    </Transition>
  </header>
</template>
