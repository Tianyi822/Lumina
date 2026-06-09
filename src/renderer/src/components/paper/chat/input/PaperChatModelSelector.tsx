import { useEffect, useRef, useState } from 'react'
import type { AppConfig } from '@renderer/types'
import { useUIStateStore } from '@renderer/stores/uiStateStore'
import styles from './PaperChatModelSelector.module.css'

interface PaperChatModelSelectorProps {
  selectedModel: string
  disabled?: boolean
  onUpdateSelectedModel: (value: string) => void
}

/** 异步加载已配置的模型列表，自动校正默认选中模型 */
function useConfiguredModels(
  selectedModel: string,
  updateSelectedModel: (value: string) => void
): string[] {
  const configUpdateKey = useUIStateStore((s) => s.configUpdateKey)
  const [modelOptions, setModelOptions] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false

    async function loadConfiguredModels(): Promise<void> {
      try {
        const config = (await window.api.config.getConfig()) as AppConfig | null
        const models = config?.llm_config?.models?.map((model) => model.model_name) || []
        if (cancelled) return
        setModelOptions(models)

        if (selectedModel && models.includes(selectedModel)) {
          return
        }

        const defaultModel = config?.llm_config?.default_model
        if (defaultModel && models.includes(defaultModel)) {
          updateSelectedModel(defaultModel)
        } else {
          updateSelectedModel(models[0] || '')
        }
      } catch (error) {
        window.api.logger.error('[PaperChatModelSelector] 加载模型配置失败', {
          error: error instanceof Error ? error.message : String(error)
        })
        if (!cancelled) {
          setModelOptions([])
          if (selectedModel) updateSelectedModel('')
        }
      }
    }

    void loadConfiguredModels()

    return () => {
      cancelled = true
    }
  }, [configUpdateKey, selectedModel, updateSelectedModel])

  return modelOptions
}

/** 模型选择器组件，以下拉菜单形式展示所有可用模型，支持点击切换 */
export default function PaperChatModelSelector({
  selectedModel,
  disabled,
  onUpdateSelectedModel
}: PaperChatModelSelectorProps) {
  const [showDropdown, setShowDropdown] = useState(false)
  const selectorRef = useRef<HTMLDivElement | null>(null)
  const modelOptions = useConfiguredModels(selectedModel, onUpdateSelectedModel)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent): void {
      const selector = selectorRef.current
      if (showDropdown && selector && !selector.contains(event.target as Node)) {
        setShowDropdown(false)
      }
    }

    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [showDropdown])

  function selectModel(model: string): void {
    onUpdateSelectedModel(model)
    setShowDropdown(false)
  }

  function toggleDropdown(): void {
    if (!disabled) {
      setShowDropdown((current) => !current)
    }
  }

  return (
    <div ref={selectorRef} className={styles['model-selector']}>
      <button
        className={[
          styles['model-selector__button'],
          showDropdown ? styles['model-selector__button--open'] || '' : ''
        ]
          .filter(Boolean)
          .join(' ')}
        type="button"
        disabled={disabled || modelOptions.length === 0}
        onClick={toggleDropdown}
      >
        <span>{selectedModel || '选择模型'}</span>
        <span
          className={[
            styles['model-selector__arrow'],
            showDropdown ? styles['model-selector__arrow--open'] || '' : ''
          ]
            .filter(Boolean)
            .join(' ')}
        >
          ▼
        </span>
      </button>
      {showDropdown && (
        <div className={styles['model-selector__dropdown']}>
          {modelOptions.length === 0 ? (
            <div className={styles['model-selector__option--empty']}>暂无模型配置</div>
          ) : (
            modelOptions.map((model) => (
              <div
                key={model}
                className={[
                  styles['model-selector__option'],
                  model === selectedModel ? styles['model-selector__option--active'] || '' : ''
                ]
                  .filter(Boolean)
                  .join(' ')}
                role="button"
                tabIndex={0}
                onClick={() => selectModel(model)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    selectModel(model)
                  }
                }}
              >
                {model}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
