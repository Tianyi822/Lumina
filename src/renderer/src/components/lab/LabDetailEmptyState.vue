<script setup lang="ts">
import styles from './LabDetailEmptyState.module.css'

defineProps<{
  title: string
  message: string
}>()
</script>

<template>
  <div :class="styles['detail-empty-state']">
    <div :class="['sm-empty', styles['detail-empty-card']]">
      <h2>{{ title }}</h2>
      <p>{{ message }}</p>
    </div>
  </div>
</template>
