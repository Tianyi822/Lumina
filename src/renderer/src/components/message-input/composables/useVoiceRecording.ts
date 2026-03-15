import { computed, onUnmounted, ref, type Ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useConfigStore } from '@renderer/stores'

interface UseVoiceRecordingReturn {
  voiceRecognitionEnabled: Ref<boolean>
  isRecording: Ref<boolean>
  voiceInfoMessage: Ref<string>
  toggleVoiceRecording: () => void
  cleanupVoiceRecording: () => Promise<void>
}

/**
 * 语音录制与识别逻辑
 */
export function useVoiceRecording(inputMessage: Ref<string>): UseVoiceRecordingReturn {
  const configStore = useConfigStore()
  const { voiceRecognitionConfig } = storeToRefs(configStore)

  const isRecording = ref(false)
  const mediaStream = ref<MediaStream | null>(null)
  const audioContext = ref<AudioContext | null>(null)
  const processorNode = ref<ScriptProcessorNode | null>(null)
  const voiceUnsubscribe = ref<(() => void) | null>(null)
  const voiceInfoMessage = ref('')
  const voiceRecognitionEnabled = computed(() => Boolean(voiceRecognitionConfig.value?.enabled))
  let voiceInfoTimer: number | null = null

  function toggleVoiceRecording(): void {
    if (isRecording.value) {
      void stopVoiceRecording()
    } else {
      void startVoiceRecording()
    }
  }

  function showVoiceInfo(message: string): void {
    voiceInfoMessage.value = message

    if (voiceInfoTimer !== null) {
      window.clearTimeout(voiceInfoTimer)
    }

    voiceInfoTimer = window.setTimeout(() => {
      voiceInfoMessage.value = ''
      voiceInfoTimer = null
    }, 4000)
  }

  async function startVoiceRecording(): Promise<void> {
    if (!voiceRecognitionConfig.value?.enabled) {
      alert('语音识别功能未启用，请先在设置中配置')
      return
    }

    if (!voiceRecognitionConfig.value?.token || !voiceRecognitionConfig.value?.appkey) {
      alert('语音识别配置不完整，请先在设置中配置 Token 和 Appkey')
      return
    }

    try {
      mediaStream.value = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        }
      })

      audioContext.value = new AudioContext({ sampleRate: 16000 })

      const source = audioContext.value.createMediaStreamSource(mediaStream.value)
      processorNode.value = audioContext.value.createScriptProcessor(4096, 1, 1)

      const startResult = await window.api.voiceRecognition.start()

      if (startResult.refreshedToken) {
        configStore.updateVoiceRecognitionConfig({
          ...voiceRecognitionConfig.value,
          token: startResult.refreshedToken
        })
      }

      if (startResult.info) {
        showVoiceInfo(startResult.info)
        window.api.logger.info('[MessageInput] 语音识别鉴权已自动刷新', {
          message: startResult.info
        })
      }

      if (!startResult.success) {
        throw new Error(startResult.error || '启动语音识别失败')
      }

      voiceUnsubscribe.value = window.api.voiceRecognition.onResult((event) => {
        if (event.type === 'partial' && event.data.text) {
          window.api.logger.debug('[MessageInput] 语音识别中间结果', { text: event.data.text })
          return
        }

        if (event.type === 'final' && event.data.text) {
          inputMessage.value = inputMessage.value
            ? `${inputMessage.value}${event.data.text}`
            : event.data.text
          return
        }

        if (event.type === 'error') {
          window.api.logger.error('[MessageInput] 语音识别错误', { error: event.data.error })
          alert(`语音识别错误: ${event.data.error}`)
          void stopVoiceRecording()
          return
        }

        if (event.type === 'stopped') {
          window.api.logger.info('[MessageInput] 语音识别已停止')
        }
      })

      processorNode.value.onaudioprocess = (event: AudioProcessingEvent) => {
        if (!isRecording.value) {
          return
        }

        const inputData = event.inputBuffer.getChannelData(0)
        const pcmData = new Int16Array(inputData.length)

        for (let i = 0; i < inputData.length; i++) {
          const sample = Math.max(-1, Math.min(1, inputData[i]))
          pcmData[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
        }

        window.api.voiceRecognition.sendAudio(new Uint8Array(pcmData.buffer))
      }

      source.connect(processorNode.value)
      processorNode.value.connect(audioContext.value.destination)

      isRecording.value = true
      window.api.logger.info('[MessageInput] 语音录制已开始')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      window.api.logger.error('[MessageInput] 启动语音录制失败', { error: errorMessage })
      alert(`启动语音录制失败: ${errorMessage}`)
      await cleanupVoiceRecording()
    }
  }

  async function stopVoiceRecording(): Promise<void> {
    window.api.logger.info('[MessageInput] 停止语音录制')
    isRecording.value = false
    await cleanupVoiceRecording()
  }

  async function cleanupVoiceRecording(): Promise<void> {
    if (voiceUnsubscribe.value) {
      voiceUnsubscribe.value()
      voiceUnsubscribe.value = null
    }

    try {
      await window.api.voiceRecognition.stop()
    } catch {
      // 忽略停止错误
    }

    if (processorNode.value) {
      processorNode.value.disconnect()
      processorNode.value.onaudioprocess = null
      processorNode.value = null
    }

    if (audioContext.value) {
      await audioContext.value.close()
      audioContext.value = null
    }

    if (mediaStream.value) {
      mediaStream.value.getTracks().forEach((track) => track.stop())
      mediaStream.value = null
    }

    isRecording.value = false
  }

  onUnmounted(() => {
    if (voiceInfoTimer !== null) {
      window.clearTimeout(voiceInfoTimer)
      voiceInfoTimer = null
    }

    void cleanupVoiceRecording()
  })

  return {
    voiceRecognitionEnabled,
    isRecording,
    voiceInfoMessage,
    toggleVoiceRecording,
    cleanupVoiceRecording
  }
}
