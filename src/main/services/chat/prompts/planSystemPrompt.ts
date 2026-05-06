import type { MCPToolReference } from '../../../types/chat'

/**
 * 构建规划阶段的系统提示词
 * 指导模型分析用户请求复杂度并生成结构化执行计划
 */
export function buildPlanSystemPrompt(
  tools: MCPToolReference[] = [],
  paperContext?: string
): string {
  const toolSummary = tools.length > 0 ? buildToolSummary(tools) : ''
  const contextSection = paperContext
    ? `\n## 当前论文上下文\n\n论文内容已包含在对话中，请基于论文内容规划任务。`
    : ''

  return `# 任务规划助手

你是一个任务规划专家。你的工作是分析用户的请求，将其拆解为清晰的执行步骤。

## 规划规则

1. **分析复杂度**：判断用户请求是否需要多步骤执行
2. **简单请求**：如果一次工具调用或直接回答即可完成，返回单步骤计划
3. **复杂请求**：将任务拆解为 2-6 个独立步骤，每个步骤应：
   - 有明确的目标（title）
   - 有详细的执行描述（description）
   - 能独立完成或依赖前序步骤的输出
4. **工具感知**：根据可用工具设计步骤，确保每个步骤可被现有工具支持
5. **不要执行**：你只需要输出计划，不要实际执行任何操作

## 输出格式

你必须严格输出以下 JSON 格式，不要输出其他内容：

\`\`\`json
{
  "steps": [
    {
      "title": "步骤标题",
      "description": "详细描述这个步骤需要做什么，需要使用哪些工具"
    }
  ]
}
\`\`\`

## 可用工具摘要

${toolSummary || '当前没有可用工具，步骤应基于论文内容直接分析。'}
${contextSection}

现在请分析用户的请求并输出执行计划。`.trim()
}

function buildToolSummary(tools: MCPToolReference[]): string {
  const grouped = new Map<string, MCPToolReference[]>()
  for (const tool of tools) {
    const existing = grouped.get(tool.serverName) ?? []
    existing.push(tool)
    grouped.set(tool.serverName, existing)
  }

  const lines: string[] = []
  for (const [server, serverTools] of grouped) {
    lines.push(`**${server}**`)
    for (const tool of serverTools) {
      lines.push(`- ${tool.toolName}: ${tool.description}`)
    }
  }
  return lines.join('\n')
}

/**
 * 构建单步骤执行的上下文提示词
 * 为每个计划步骤注入执行上下文
 */
export function buildStepExecutionPrompt(
  stepTitle: string,
  stepDescription: string,
  previousResults: string[],
  previousFailure?: string
): string {
  const contextSection =
    previousResults.length > 0
      ? `## 前序步骤结果\n\n${previousResults.map((r, i) => `### 步骤 ${i + 1} 结果\n${r}`).join('\n\n')}`
      : ''
  const failureSection = previousFailure
    ? `## 上次尝试失败原因\n\n${previousFailure}\n\n请调整参数、换用更安全的命令或改用其他工具后重试，不要重复同一个失败操作。`
    : ''

  return `## 当前任务

你正在执行一个多步骤计划中的某个步骤。

**当前步骤**：${stepTitle}
**步骤描述**：${stepDescription}

请完成当前步骤。使用合适的工具获取信息或执行操作。如果该步骤产生了实质性结论，请直接输出；如果步骤仅涉及信息收集或工具操作，无需额外总结。
如果前序步骤已经创建了实验室、容器、预览地址或项目根目录，必须优先复用这些标识和路径；除非用户明确要求新建，不要重复创建同名实验室或容器。
${failureSection}
${contextSection}`.trim()
}
