<script setup lang="ts">
interface Props {
  modelValue: Record<string, string>
  placeholder?: string
  rows?: number
}

interface Emits {
  (e: 'update:modelValue', value: Record<string, string>): void
}

withDefaults(defineProps<Props>(), {
  placeholder: 'KEY=value',
  rows: 3
})

const emit = defineEmits<Emits>()

/**
 * 将键值对对象转换为文本
 */
function keyValueToText(obj: Record<string, string>): string {
  return Object.entries(obj)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
}

/**
 * 解析键值对文本
 */
function parseKeyValueText(text: string): Record<string, string> {
  const result: Record<string, string> = {}
  const lines = text.split('\n').filter((line) => line.trim())
  for (const line of lines) {
    const [key, ...valueParts] = line.split('=')
    if (key && valueParts.length > 0) {
      result[key.trim()] = valueParts.join('=').trim()
    }
  }
  return result
}

/**
 * 处理输入变化
 */
function handleInput(event: Event): void {
  const text = (event.target as HTMLTextAreaElement).value
  emit('update:modelValue', parseKeyValueText(text))
}
</script>

<template>
  <textarea
    :value="keyValueToText(modelValue)"
    :placeholder="placeholder"
    :rows="rows"
    class="input textarea-small"
    @input="handleInput"
  />
</template>
