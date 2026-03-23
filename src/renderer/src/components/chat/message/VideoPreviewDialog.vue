<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { AttachedVideo } from '@renderer/types'

const props = defineProps<{
  visible: boolean
  video: AttachedVideo | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const playbackError = ref('')

const canPlay = computed(() => {
  return props.video?.status === 'SUCCESS' && Boolean(props.video.url)
})

function handleClose(): void {
  emit('close')
}

function handleKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && props.visible) {
    handleClose()
  }
}

function handleVideoError(): void {
  playbackError.value = '视频加载失败，可能是链接已失效或网络不可达。'
}

watch(
  () => [props.visible, props.video?.url],
  () => {
    playbackError.value = ''
  }
)

onMounted(() => {
  document.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="visible && video" class="video-dialog-overlay" @click.self="handleClose">
      <div class="video-dialog">
        <div class="video-dialog-header">
          <div class="video-dialog-meta">
            <div class="video-dialog-title">{{ video.model }}</div>
            <div class="video-dialog-prompt">{{ video.prompt }}</div>
          </div>
          <button type="button" class="video-dialog-close" @click="handleClose">关闭</button>
        </div>

        <div class="video-dialog-body">
          <video
            v-if="canPlay"
            class="video-player"
            :src="video.url"
            :poster="video.coverImageUrl"
            controls
            autoplay
            playsinline
            @error="handleVideoError"
          ></video>

          <div v-else class="video-dialog-empty">
            <div class="empty-title">
              {{ video.status === 'FAIL' ? '视频生成失败' : '视频暂不可播放' }}
            </div>
            <div class="empty-text">
              {{ video.errorMessage || '当前附件没有可播放的视频地址。' }}
            </div>
          </div>

          <div v-if="playbackError" class="video-dialog-error">
            {{ playbackError }}
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.video-dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(4, 12, 11, 0.72);
  backdrop-filter: blur(14px);
}

.video-dialog {
  width: min(980px, calc(100vw - 48px));
  max-height: calc(100vh - 48px);
  overflow: hidden;
  border-radius: 22px;
  background:
    radial-gradient(circle at top right, rgba(112, 215, 92, 0.12), transparent 20%),
    linear-gradient(180deg, rgba(10, 15, 14, 0.98), rgba(8, 12, 11, 0.96));
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.4);
}

.video-dialog-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 22px 14px;
}

.video-dialog-meta {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.video-dialog-title {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(217, 255, 226, 0.74);
}

.video-dialog-prompt {
  font-size: 15px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.92);
}

.video-dialog-close {
  border: 0;
  border-radius: 999px;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  cursor: pointer;
}

.video-dialog-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0 22px 22px;
}

.video-player {
  width: 100%;
  max-height: calc(100vh - 180px);
  border-radius: 18px;
  background: #000;
  outline: none;
}

.video-dialog-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 320px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.04);
  color: #fff;
  text-align: center;
}

.empty-title {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 10px;
}

.empty-text {
  max-width: 520px;
  font-size: 14px;
  line-height: 1.7;
  color: rgba(255, 255, 255, 0.72);
}

.video-dialog-error {
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(255, 120, 120, 0.12);
  color: #ffd7d7;
  font-size: 13px;
}

@media (max-width: 768px) {
  .video-dialog-overlay {
    padding: 12px;
  }

  .video-dialog {
    width: 100%;
    max-height: calc(100vh - 24px);
  }

  .video-dialog-header,
  .video-dialog-body {
    padding-left: 14px;
    padding-right: 14px;
  }

  .video-dialog-header {
    flex-direction: column;
  }

  .video-dialog-close {
    align-self: flex-end;
  }
}
</style>
