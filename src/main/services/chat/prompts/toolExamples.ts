// ReAct 模式的 Few-shot 示例集合，用于帮助模型理解如何正确使用工具和进行推理

import type { FewShotExample, EnhancedFewShotExample, ExampleSelectionCriteria } from './types'
import { dynamicExampleExtractor } from './DynamicExampleExtractor'
import { logger } from '../../logger'

// Few-shot 示例
export const FEW_SHOT_EXAMPLES: FewShotExample[] = [
  {
    userQuery: '今天北京的天气怎么样?',
    thought: '用户想了解北京的天气信息。我需要使用天气查询工具来获取当前的天气数据。',
    toolCalls: [
      {
        name: 'weather_service__get_weather',
        arguments: { city: '北京', unit: 'celsius' },
        result: JSON.stringify({
          city: '北京',
          temperature: 18,
          condition: '晴朗',
          humidity: 45,
          wind: '东北风 3级'
        })
      }
    ],
    finalAnswer:
      '根据天气查询结果，北京今天天气晴朗，气温 18°C，湿度 45%，东北风 3级。适合外出活动。'
  },
  {
    userQuery: '帮我搜索一下 Vue 3 的最新版本号，然后读取项目中的 package.json 文件查看当前版本。',
    thought:
      '这个任务需要两步：首先搜索 Vue 3 的最新版本，然后读取本地 package.json 文件查看当前使用的版本。我可以先执行这两个操作。',
    toolCalls: [
      {
        name: 'web_search__search',
        arguments: { query: 'Vue 3 latest version 2025', limit: 3 },
        result: JSON.stringify({
          results: [
            {
              title: 'Vue 3.5 Released',
              url: 'https://vuejs.org',
              snippet: 'Vue 3.5.0 is latest version'
            }
          ]
        })
      },
      {
        name: 'file_system__read_file',
        arguments: { path: '/Users/chentianyi/Project/web-workplace/sparrow-manus/package.json' },
        result: JSON.stringify({
          content: '{\n  "name": "sparrow-manus",\n  "dependencies": {\n    "vue": "^3.4.0"\n  }\n}'
        })
      }
    ],
    finalAnswer:
      '根据搜索结果，Vue 3 的最新版本是 3.5.0。你的项目中当前使用的是 Vue 3.4.0（package.json 中显示为 "^3.4.0"），可以考虑升级到最新版本以获得新特性和性能改进。'
  },
  {
    userQuery: '分析这个错误：TypeError: Cannot read property "name" of undefined',
    thought:
      '用户遇到了一个常见的 JavaScript 错误。这个错误表明代码试图访问一个 undefined 对象的 name 属性。我需要分析可能的原因和解决方案。',
    toolCalls: [],
    finalAnswer: `这是一个常见的 JavaScript 运行时错误。分析和解决方案如下：

**可能原因：**
1. 对象未正确初始化
2. API 返回的数据结构与预期不符
3. 异步操作完成前就访问了数据
4. 数组访问越界导致返回 undefined

**解决方案：**
1. 使用可选链操作符：\`object?.name\`
2. 添加默认值：\`object?.name || 'default'\`
3. 在访问前检查对象存在性：
\`\`\`javascript
if (object && object.name) {
  console.log(object.name)
}
\`\`\`
4. 确保异步数据已加载完成再访问

**调试建议：**
- 在错误行添加 \`console.log\` 检查对象的值
- 使用 TypeScript 可以在编译时发现这类问题

需要我帮你查看具体的代码并修复这个问题吗？请提供相关的代码片段。`
  }
]

/**
 * 根据配置获取指定数量的示例（支持动态和静态混合）
 */
export async function getFewShotExamplesAsync(
  count: number = 3,
  options: {
    enableDynamicExamples?: boolean
    minQualityScore?: number
    requiredTools?: string[]
    maxStaticExamples?: number
    maxDynamicExamples?: number
  } = {}
): Promise<FewShotExample[]> {
  const {
    enableDynamicExamples = false,
    minQualityScore = 0.6,
    requiredTools = [],
    maxStaticExamples = 2,
    maxDynamicExamples = 3
  } = options

  try {
    // 如果启用动态示例，使用智能选择
    if (enableDynamicExamples) {
      const criteria: ExampleSelectionCriteria = {
        maxCount: count,
        minQualityScore,
        requiredTools: requiredTools.length > 0 ? requiredTools : undefined,
        includeStatic: true,
        includeDynamic: true,
        maxStaticCount: maxStaticExamples,
        maxDynamicCount: maxDynamicExamples
      }

      const dynamicExamples = await dynamicExampleExtractor.selectExamples(criteria)

      if (dynamicExamples.length > 0) {
        // 记录使用情况
        await dynamicExampleExtractor.recordUsage(dynamicExamples.map((e) => e.id))

        // 转换为 FewShotExample 格式
        return dynamicExamples.map((e) => ({
          userQuery: e.userQuery,
          thought: e.thought,
          toolCalls: e.toolCalls,
          finalAnswer: e.finalAnswer
        }))
      }
    }
  } catch (error) {
    logger.warn('获取动态示例失败，回退到静态示例', 'main', { error })
  }

  // 回退到静态示例
  return getFewShotExamples(count)
}

// 根据配置获取指定数量的示例（同步版本，保持向后兼容）
export function getFewShotExamples(count: number = 3): FewShotExample[] {
  return FEW_SHOT_EXAMPLES.slice(0, Math.min(count, FEW_SHOT_EXAMPLES.length))
}

// 将示例格式化为提示词文本
export function formatFewShotExample(example: FewShotExample): string {
  let text = `**用户**: ${example.userQuery}\n\n`
  text += `**思考**: ${example.thought}\n\n`

  if (example.toolCalls && example.toolCalls.length > 0) {
    text += `**工具调用**:\n`
    for (const toolCall of example.toolCalls) {
      text += `- 工具: ${toolCall.name}\n`
      text += `  参数: ${JSON.stringify(toolCall.arguments, null, 2)}\n`
      text += `  结果: ${toolCall.result}\n\n`
    }
  }

  text += `**最终答案**: ${example.finalAnswer}\n`
  return text
}

/**
 * 格式化增强示例
 */
export function formatEnhancedFewShotExample(example: EnhancedFewShotExample): string {
  return formatFewShotExample(example)
}

/**
 * 导出动态示例提取器实例
 */
export { dynamicExampleExtractor }
