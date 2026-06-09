/**
 * 工具描述的详细级别
 * - minimal: 仅工具名称 + 一句话描述（< 50 tokens）
 * - basic: 追加参数名称和类型（50-150 tokens）
 * - detailed: 完整描述 + 参数说明 + 示例 + 使用建议（150-300 tokens）
 */
export type ToolDescriptionLevel = 'basic' | 'detailed' | 'minimal'
