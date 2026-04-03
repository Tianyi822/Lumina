<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type {
  UserInteractionRequest,
  VideoDuration,
  VideoQuality,
  VideoSize
} from '@renderer/types'

interface VideoGenerationConfigSelection {
  size: VideoSize
  quality: VideoQuality
  withAudio: boolean
  duration: VideoDuration
}

const props = defineProps<{
  interactionInfo: UserInteractionRequest
}>()

const emit = defineEmits<{
  (e: 'submit', selection: VideoGenerationConfigSelection): void
}>()

const fallbackConfig = {
  defaultSize: '1920x1080' as VideoSize,
  sizeOptions: ['1920x1080', '1080x1920', '1280x720'] as VideoSize[],
  defaultQuality: 'quality' as VideoQuality,
  qualityOptions: ['quality', 'speed'] as VideoQuality[],
  defaultWithAudio: false,
  durationOptions: [5, 10] as VideoDuration[],
  defaultDuration: 5 as VideoDuration
}

const config = computed(() => props.interactionInfo.videoGenerationConfig || fallbackConfig)
const selectedSize = ref<VideoSize>(config.value.defaultSize)
const selectedQuality = ref<VideoQuality>(config.value.defaultQuality)
const selectedWithAudio = ref(config.value.defaultWithAudio)
const selectedDuration = ref<VideoDuration>(config.value.defaultDuration)

function resetSelections(): void {
  selectedSize.value = config.value.defaultSize
  selectedQuality.value = config.value.defaultQuality
  selectedWithAudio.value = config.value.defaultWithAudio
  selectedDuration.value = config.value.defaultDuration
}

function getSizeLabel(size: VideoSize): string {
  switch (size) {
    case '1920x1080':
      return '横屏 1080P'
    case '1080x1920':
      return '竖屏 1080P'
    case '1280x720':
      return '横屏 720P'
    default:
      return size
  }
}

function getQualityLabel(quality: VideoQuality): string {
  return quality === 'quality' ? '高质量' : '快速'
}

function handleSubmit(): void {
  emit('submit', {
    size: selectedSize.value,
    quality: selectedQuality.value,
    withAudio: selectedWithAudio.value,
    duration: selectedDuration.value
  })
}

watch(
  () => props.interactionInfo,
  () => {
    resetSelections()
  },
  { deep: true, immediate: true }
)
</script>

<template>
  <div class="video-config-panel">
    <div class="sm-video-config__title">{{ interactionInfo.question }}</div>

    <div class="config-group">
      <div class="group-label">视频分辨率</div>
      <div class="chip-list">
        <button
          v-for="size in config.sizeOptions"
          :key="size"
          type="button"
          class="config-chip"
          :class="{ active: selectedSize === size }"
          @click="selectedSize = size"
        >
          {{ getSizeLabel(size) }}
        </button>
      </div>
    </div>

    <div class="config-group">
      <div class="group-label">视频质量</div>
      <div class="chip-list">
        <button
          v-for="quality in config.qualityOptions"
          :key="quality"
          type="button"
          class="config-chip"
          :class="{ active: selectedQuality === quality }"
          @click="selectedQuality = quality"
        >
          {{ getQualityLabel(quality) }}
        </button>
      </div>
    </div>

    <div class="config-group">
      <div class="group-label">是否生成音频</div>
      <div class="chip-list">
        <button
          type="button"
          class="config-chip"
          :class="{ active: selectedWithAudio }"
          @click="selectedWithAudio = true"
        >
          生成音频
        </button>
        <button
          type="button"
          class="config-chip"
          :class="{ active: !selectedWithAudio }"
          @click="selectedWithAudio = false"
        >
          静音视频
        </button>
      </div>
    </div>

    <div class="config-group">
      <div class="group-label">视频时长</div>
      <div class="chip-list">
        <button
          v-for="duration in config.durationOptions"
          :key="duration"
          type="button"
          class="config-chip"
          :class="{ active: selectedDuration === duration }"
          @click="selectedDuration = duration"
        >
          {{ duration }} 秒
        </button>
      </div>
    </div>

    <button type="button" class="submit-button" @click="handleSubmit">按此配置继续生成</button>
  </div>
</template>

<style scoped>
.video-config-panel {
  margin-bottom: 12px;
  padding: 14px 16px;
  background:
    linear-gradient(180deg, var(--sm-color-accent-08), var(--sm-color-accent-03)),
    var(--sm-color-surface-2);
  border: 1px solid var(--sm-color-accent-22);
  border-radius: var(--sm-radius-lg);
  color: var(--sm-color-text-primary);
}

.sm-video-config__title {
  font-size: 13px;
  line-height: 1.6;
  margin-bottom: 14px;
  color: var(--sm-color-text-primary);
}

.config-group + .config-group {
  margin-top: 14px;
}

.group-label {
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--sm-color-text-secondary);
}

.chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.config-chip {
  border: 1px solid var(--sm-color-border-default);
  border-radius: 999px;
  padding: 8px 12px;
  background: var(--sm-color-surface-1);
  color: var(--sm-color-text-primary);
  cursor: pointer;
  transition:
    border-color var(--sm-transition-fast),
    background-color var(--sm-transition-fast),
    color var(--sm-transition-fast);
}

.config-chip:hover {
  border-color: var(--sm-color-border-strong);
  background: var(--sm-color-surface-hover);
}

.config-chip.active {
  border-color: var(--sm-color-border-selected);
  background: var(--sm-color-surface-selected);
}

.submit-button {
  margin-top: 16px;
  border: 1px solid var(--sm-color-border-accent);
  border-radius: var(--sm-radius-md);
  padding: 10px 14px;
  background: var(--sm-color-accent-16);
  color: var(--sm-color-text-primary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background-color var(--sm-transition-fast),
    border-color var(--sm-transition-fast),
    color var(--sm-transition-fast);
}

.submit-button:hover {
  background: var(--sm-color-accent-22);
  border-color: var(--sm-color-accent-28);
}
</style>
