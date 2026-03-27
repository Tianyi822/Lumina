<script setup lang="ts">
import type { AttachedVideo } from '@renderer/types'

const props = defineProps<{
  videos: AttachedVideo[]
}>()

const emit = defineEmits<{
  (e: 'preview', video: AttachedVideo): void
}>()

function getStatusLabel(status: AttachedVideo['status']): string {
  switch (status) {
    case 'SUCCESS':
      return '已生成'
    case 'FAIL':
      return '生成失败'
    case 'PROCESSING':
      return '生成中'
    default:
      return status
  }
}

function canPreview(video: AttachedVideo): boolean {
  return video.status === 'SUCCESS' && Boolean(video.url)
}

function handlePreview(video: AttachedVideo): void {
  if (!canPreview(video)) {
    return
  }

  emit('preview', video)
}

function getPromptPreview(prompt: string): string {
  return prompt.length > 88 ? `${prompt.slice(0, 88)}...` : prompt
}
</script>

<template>
  <div v-if="props.videos.length > 0" class="video-attachments">
    <button
      v-for="video in props.videos"
      :key="video.taskId || `${video.model}-${video.prompt}`"
      type="button"
      class="video-card"
      :class="{
        clickable: canPreview(video),
        failed: video.status === 'FAIL',
        processing: video.status === 'PROCESSING'
      }"
      :disabled="!canPreview(video)"
      @click="handlePreview(video)"
    >
      <div class="video-cover">
        <img
          v-if="video.coverImageUrl"
          :src="video.coverImageUrl"
          :alt="video.prompt"
          class="video-cover-image"
        />
        <div v-else class="video-cover-fallback">
          <span class="fallback-label">VIDEO</span>
        </div>

        <div class="video-status" :class="video.status.toLowerCase()">
          {{ getStatusLabel(video.status) }}
        </div>

        <div v-if="canPreview(video)" class="video-play-indicator">播放</div>
      </div>

      <div class="video-meta">
        <div class="video-model">{{ video.model }}</div>
        <div class="video-prompt">{{ getPromptPreview(video.prompt) }}</div>
        <div v-if="video.errorMessage" class="video-error">{{ video.errorMessage }}</div>
      </div>
    </button>
  </div>
</template>

<style scoped>
.video-attachments {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: min(420px, 100%);
  margin-top: 10px;
}

.video-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  padding: 12px;
  background: var(--sm-color-surface-1);
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-lg);
  color: var(--sm-color-text-primary);
  text-align: left;
  transition:
    background-color var(--sm-transition-fast),
    border-color var(--sm-transition-fast),
    color var(--sm-transition-fast);
}

.video-card.clickable {
  cursor: pointer;
}

.video-card.clickable:hover {
  background: var(--sm-color-surface-hover);
  border-color: var(--sm-color-border-strong);
}

.video-card:disabled {
  cursor: default;
  opacity: 0.94;
}

.video-card.failed {
  border-color: rgba(199, 120, 120, 0.24);
  background: rgba(199, 120, 120, 0.08);
}

.video-card.processing {
  border-color: rgba(197, 161, 101, 0.24);
  background: rgba(197, 161, 101, 0.08);
}

.video-cover {
  position: relative;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border-radius: var(--sm-radius-md);
  background: var(--sm-color-bg-embedded);
}

.video-cover-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.video-cover-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background: var(--sm-color-bg-embedded);
}

.fallback-label {
  font-size: 28px;
  letter-spacing: 0.24em;
  color: var(--sm-color-text-tertiary);
}

.video-status {
  position: absolute;
  top: 10px;
  left: 10px;
  padding: 5px 10px;
  border: 1px solid var(--sm-color-border-default);
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  background: rgba(11, 11, 12, 0.88);
}

.video-status.success {
  color: var(--theme-success);
}

.video-status.fail {
  color: var(--theme-danger);
}

.video-status.processing {
  color: var(--theme-warning);
}

.video-play-indicator {
  position: absolute;
  right: 12px;
  bottom: 12px;
  padding: 6px 12px;
  border: 1px solid var(--sm-color-border-default);
  border-radius: 999px;
  background: rgba(11, 11, 12, 0.88);
  color: var(--sm-color-text-primary);
  font-size: 12px;
  font-weight: 600;
}

.video-meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.video-model {
  font-size: 12px;
  font-weight: 600;
  color: var(--sm-color-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.video-prompt {
  font-size: 14px;
  line-height: 1.5;
  color: var(--sm-color-text-primary);
}

.video-error {
  font-size: 12px;
  line-height: 1.5;
  color: var(--theme-danger);
}

@media (max-width: 768px) {
  .video-attachments {
    width: 100%;
  }
}
</style>
