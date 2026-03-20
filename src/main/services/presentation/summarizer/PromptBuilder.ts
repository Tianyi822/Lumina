import type { ChatMessage } from '@shared/types/chat'

export interface TemplateInput {
  templateId: string
  name: string
  slideCount: number
  analysisJson: string
}

/**
 * PPT 模板 AI 总结提示词构建器
 */
export class PromptBuilder {
  /**
   * 构建发送给模型的消息列表
   */
  buildMessages(template: TemplateInput): ChatMessage[] {
    const systemPrompt = [
      '你是一个 PPT 模板分析助手。',
      '你的任务是根据给定的 PPT 模板 analysis.json，输出一份严格的 JSON 总结。',
      '禁止输出 JSON 之外的任何解释、注释、前后缀文字。',
      '输出必须是一个 JSON 对象，并严格遵循以下结构：',
      '{',
      '  "schemaVersion": "1.0",',
      '  "templateId": string,',
      '  "generatedAt": string,',
      '  "modelName": string,',
      '  "overallSummary": {',
      '    "style": string,',
      '    "useCases": string[],',
      '    "designHighlights": string[],',
      '    "contentGuidelines": string',
      '  },',
      '  "slideSummaries": [',
      '    {',
      '      "slideIndex": number,',
      '      "pageType": string,',
      '      "purpose": string,',
      '      "keyPoints": string[],',
      '      "designNotes": string',
      '    }',
      '  ]',
      '}',
      '要求：',
      '1. slideSummaries 必须覆盖全部页面，数量必须与 slideCount 完全一致。',
      '2. slideIndex 必须从 0 开始，并与页面顺序一致。',
      '3. keyPoints 必须是字符串数组，尽量提炼页面职责、内容结构和可复用信息。',
      '4. designNotes 可为空字符串，但字段类型必须是字符串；如果确实没有明显设计特征，也请给出简短描述。',
      '5. generatedAt 与 modelName 必须填写字符串。',
      '6. 不要输出 Markdown，不要使用代码块，不要省略字段。'
    ].join('\n')

    const userPrompt = [
      '请基于以下模板信息生成总结 JSON。',
      `templateId: ${template.templateId}`,
      `templateName: ${template.name}`,
      `slideCount: ${template.slideCount}`,
      '',
      '下面是 analysis.json 原文：',
      template.analysisJson
    ].join('\n')

    return [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: userPrompt
      }
    ]
  }
}
