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
  background:
    linear-gradient(140deg, rgba(7, 53, 50, 0.92) 0%, rgba(10, 89, 78, 0.82) 100%),
    rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(112, 215, 92, 0.18);
  border-radius: 18px;
  color: #f6fff8;
  text-align: left;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    border-color 0.18s ease;
}

.video-card.clickable {
  cursor: pointer;
}

.video-card.clickable:hover {
  transform: translateY(-1px);
  border-color: rgba(112, 215, 92, 0.34);
  box-shadow: 0 14px 32px rgba(2, 24, 21, 0.22);
}

.video-card:disabled {
  cursor: default;
  opacity: 0.96;
}

.video-card.failed {
  border-color: rgba(255, 120, 120, 0.26);
  background:
    linear-gradient(140deg, rgba(58, 22, 22, 0.94) 0%, rgba(92, 31, 31, 0.86) 100%),
    rgba(255, 255, 255, 0.04);
}

.video-card.processing {
  border-color: rgba(255, 201, 71, 0.28);
}

.video-cover {
  position: relative;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border-radius: 14px;
  background:
    radial-gradient(circle at top right, rgba(255, 255, 255, 0.24), transparent 32%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.05));
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
  background:
    radial-gradient(circle at 30% 20%, rgba(112, 215, 92, 0.32), transparent 35%),
    linear-gradient(140deg, rgba(10, 89, 78, 0.96), rgba(1, 34, 30, 0.96));
}

.fallback-label {
  font-size: 28px;
  letter-spacing: 0.24em;
  color: rgba(255, 255, 255, 0.72);
}

.video-status {
  position: absolute;
  top: 10px;
  left: 10px;
  padding: 5px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  backdrop-filter: blur(8px);
  background: rgba(0, 0, 0, 0.34);
}

.video-status.success {
  color: #d9ffe2;
}

.video-status.fail {
  color: #ffd4d4;
}

.video-status.processing {
  color: #fff1c3;
}

.video-play-indicator {
  position: absolute;
  right: 12px;
  bottom: 12px;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.48);
  color: #fff;
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
  color: rgba(255, 255, 255, 0.7);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.video-prompt {
  font-size: 14px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.94);
}

.video-error {
  font-size: 12px;
  line-height: 1.5;
  color: rgba(255, 226, 226, 0.92);
}

@media (max-width: 768px) {
  .video-attachments {
    width: 100%;
  }
}
</style>
