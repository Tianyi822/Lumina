<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useRuntimePlatform } from '@renderer/composables/useRuntimePlatform'
import { useNotificationCenterStore } from '@renderer/stores/notificationCenterStore'
import NotificationItem from './NotificationItem.vue'
import NotificationConfirmDialog from './NotificationConfirmDialog.vue'

const store = useNotificationCenterStore()
const { notifications, confirmState } = storeToRefs(store)
const { isWindows } = useRuntimePlatform()

function handleDismiss(id: string): void {
  store.dismiss(id)
}
</script>

<template>
  <Teleport to="body">
    <!-- 通知列表 -->
    <TransitionGroup
      v-if="notifications.length > 0"
      name="sm-notification"
      tag="div"
      class="sm-notification-center"
      :class="{ 'sm-notification-center--windows': isWindows }"
    >
      <NotificationItem
        v-for="notification in notifications"
        :key="notification.id"
        :notification="notification"
        @dismiss="handleDismiss"
      />
    </TransitionGroup>

    <!-- 确认对话框 -->
    <NotificationConfirmDialog
      v-if="confirmState.visible"
      :message="confirmState.message"
      :title="confirmState.title"
      :danger="confirmState.danger"
      @confirm="store.resolveConfirm(true)"
      @cancel="store.resolveConfirm(false)"
    />
  </Teleport>
</template>
