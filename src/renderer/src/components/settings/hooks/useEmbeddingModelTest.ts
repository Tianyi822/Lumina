import { useState, useCallback } from 'react'

interface SaveResult {
  success: boolean
  error?: string
}

interface TestResult {
  success: boolean
  error?: string
  model?: string
  dimensions?: number
}

interface TestNewModelResult {
  saveResult: SaveResult
  testResult: TestResult | null
}

export function useEmbeddingModelTest() {
  const [testing, setTesting] = useState(false)

  const testNewModel = useCallback(
    async (tempId: string, config: Record<string, unknown>): Promise<TestNewModelResult> => {
      setTesting(true)
      try {
        const saveResult = await window.api.embeddingModels.save(
          tempId,
          config as unknown as Parameters<typeof window.api.embeddingModels.save>[1]
        )
        if (!saveResult.success) {
          return { saveResult, testResult: null }
        }

        const testResult = await window.api.embeddingModels.test(tempId)

        await window.api.embeddingModels.delete(tempId)

        return { saveResult, testResult }
      } finally {
        setTesting(false)
      }
    },
    []
  )

  return { testing, testNewModel }
}
