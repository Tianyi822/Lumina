<script setup lang="ts">
import { useZustandStore } from '@renderer/composables/useZustandStore'
import { useRuntimePlatform } from '@renderer/composables/useRuntimePlatform'
import { useNotificationCenterStore } from '@renderer/stores/notificationCenterStore'
import NotificationItem from './NotificationItem.vue'
import NotificationConfirmDialog from './NotificationConfirmDialog.vue'

const store = useZustandStore(useNotificationCenterStore)
const { isWindows } = useRuntimePlatform()

function handleDismiss(id: string): void {
  store.dismiss(id)
}
</script>

<template>
  <Teleport to="body">
    <!-- 通知列表 -->
    <TransitionGroup
      v-if="store.notifications.length > 0"
      name="sm-notification"
      tag="div"
      class="sm-notification-center"
      :class="{ 'sm-notification-center--windows': isWindows }"
    >
      <NotificationItem
        v-for="notification in store.notifications"
        :key="notification.id"
        :notification="notification"
        @dismiss="handleDismiss"
      />
    </TransitionGroup>

    <!-- 确认对话框 -->
    <NotificationConfirmDialog
      v-if="store.confirmState.visible"
      :message="store.confirmState.message"
      :title="store.confirmState.title"
      :danger="store.confirmState.danger"
      @confirm="store.resolveConfirm(true)"
      @cancel="store.resolveConfirm(false)"
    />
  </Teleport>
</template>
