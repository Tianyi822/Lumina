import OpenAI from 'openai'
import type { LLMConfig } from '@shared/types/config'
import { configManager } from '@main/services/config'
import { logger } from '@main/services/logger'
import { PaperStorageService } from './PaperStorageService'
import { PaperTranslationCore } from './PaperTranslationCore'

const paperTranslationStorage = new PaperStorageService()
const TRANSLATION_MIN_OUTPUT_TOKENS = 512
const TRANSLATION_MAX_OUTPUT_TOKENS = 4096

function getTranslationLlmConfig(): LLMConfig | null {
  const config = configManager.getConfig()
  if (!config) {
    return null
  }

  const translationModel = config.paperReader?.translationModel
  if (translationModel) {
    const matched = config.llm_config.models.find((model) => model.model_name === translationModel)
    if (matched) {
      return matched
    }
  }

  const defaultModelKey = config.llm_config.default_model
  return config.llm_config.models.find((model) => model.model_name === defaultModelKey) ?? null
}

/**
 * 论文翻译服务
 * 继承 PaperTranslationCore，注入 OpenAI 兼容的 LLM 客户端作为翻译引擎
 */
class PaperTranslationService extends PaperTranslationCore {
  constructor() {
    super({
      concurrency: 3,
      logger,
      getDefaultLlmConfig: getTranslationLlmConfig,
      readCache: (paperId) => paperTranslationStorage.readTranslationCache(paperId),
      saveCache: (paperId, cache) => paperTranslationStorage.saveTranslationCache(paperId, cache),
      clearCache: (paperId) => paperTranslationStorage.clearTranslationCache(paperId),
      translateSegment: async (llmConfig, prompt, segment, signal) => {
        const client = new OpenAI({
          apiKey: llmConfig.api_key,
          baseURL: llmConfig.base_url,
          timeout: 120_000
        })

        const response = await client.chat.completions.create(
          {
            model: llmConfig.model_name,
            max_tokens: Math.max(
              TRANSLATION_MIN_OUTPUT_TOKENS,
              Math.min(TRANSLATION_MAX_OUTPUT_TOKENS, segment.originalText.length * 4)
            ),
            messages: [
              {
                role: 'system',
                content:
                  '你是专业的学术论文翻译助手。请严格按照用户要求输出纯翻译结果，不要附加任何解释。'
              },
              {
                role: 'user',
                content: prompt
              }
            ]
          },
          { signal }
        )

        const translatedContent = response.choices[0]?.message?.content?.trim()
        if (!translatedContent) {
          throw new Error('模型未返回翻译内容')
        }

        return translatedContent
      }
    })
  }
}

export const paperTranslationService = new PaperTranslationService()
