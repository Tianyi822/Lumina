/**
 * KeyValue 解析工具函数
 *
 * 从 KeyValueEditor.vue、MCPNewServerForm.vue、mcpStore.ts 三处重复实现中统一提取。
 * React 迁移中所有需要 key=value 解析的组件统一使用此工具。
 */

/**
 * 将 `key=value` 格式的文本解析为 Record
 * 支持值中包含 `=`（如 `KEY=a=b` → `{ KEY: 'a=b' }`）
 */
export function parseKeyValueText(text: string): Record<string, string> {
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
 * 将 Record 序列化为 `key=value` 格式的文本（每行一个键值对）
 */
export function keyValueToText(obj: Record<string, string>): string {
  return Object.entries(obj)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
}
