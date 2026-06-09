import { useState, useEffect, useCallback, useRef } from 'react'
import { parseKeyValueText, keyValueToText } from './keyValueUtils'

interface KeyValueEditorProps {
  value: Record<string, string>
  onChange: (value: Record<string, string>) => void
  placeholder?: string
  rows?: number
}

/** KeyValue 编辑器：受控 textarea，编辑 key=value 文本，失焦时解析为 Record 并回调 */
export default function KeyValueEditor({
  value,
  onChange,
  placeholder = 'KEY=value',
  rows = 3
}: KeyValueEditorProps) {
  const [text, setText] = useState(() => keyValueToText(value))
  const prevValueRef = useRef(value)

  // 外部 value 变更时同步内部文本（仅当外部真正变更时）
  useEffect(() => {
    if (prevValueRef.current !== value) {
      setText(keyValueToText(value))
      prevValueRef.current = value
    }
  }, [value])

  const handleBlur = useCallback(() => {
    const parsed = parseKeyValueText(text)
    prevValueRef.current = parsed
    onChange(parsed)
  }, [text, onChange])

  return (
    <textarea
      value={text}
      placeholder={placeholder}
      rows={rows}
      className="sm-textarea"
      style={{
        minHeight: 60,
        resize: 'vertical',
        fontFamily: 'var(--sm-font-mono)',
        lineHeight: 1.5
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={handleBlur}
    />
  )
}
