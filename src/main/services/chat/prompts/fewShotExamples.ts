import type { FewShotExample } from '../PromptBuilder'

// 论文会话示例：展示论文内部检索、联网搜索的不同决策路径
const PAPER_EXAMPLES: FewShotExample[] = [
  {
    userQuery: '帮我解释论文中第 3.2 节的注意力机制',
    reasoning:
      '问题针对当前论文内部内容，应先检索论文原文获取准确的句子，而不是凭记忆解释或联网搜索。',
    toolCalls: [{ name: 'paper__search_context', args: { query: '注意力机制', source: 'both' } }],
    answer: '根据论文 3.2 节，该注意力机制通过……（基于检索到的原文句子给出准确解释，不编造细节）。'
  },
  {
    userQuery: '这篇论文用到的 BERT 模型，现在还有更好的替代方案吗？',
    reasoning: '问题涉及外部最新进展，论文内部上下文不足以回答，需要联网搜索补充最新信息。',
    toolCalls: [{ name: 'paper_web__search', args: { query: 'BERT 替代方案 最新模型 对比' } }],
    answer:
      '根据论文，作者使用 BERT 作为基础编码器（「根据论文」）；根据联网搜索，目前主流替代方案包括……（「根据联网搜索」）。'
  },
  {
    userQuery: '总结一下这篇论文的主要贡献',
    reasoning: '问题属于论文内部总结，直接检索论文原文即可，无需联网或知识库。',
    toolCalls: [
      { name: 'paper__search_context', args: { query: '贡献 contribution', source: 'both' } }
    ],
    answer: '论文的主要贡献包括三点：……（基于检索到的原文整理）。'
  }
]

// 知识库会话示例：展示知识库检索与何时不应使用知识库
const KNOWLEDGE_EXAMPLES: FewShotExample[] = [
  {
    userQuery: '我之前整理的笔记里有没有关于 Transformer 架构的内容？',
    reasoning: '用户明确要求检索个人知识库，应使用知识库搜索工具。',
    toolCalls: [{ name: 'knowledge__search', args: { query: 'Transformer 架构' } }],
    answer: '在你的知识库中找到以下相关笔记：……（基于知识库结果整理）。'
  },
  {
    userQuery: '什么是梯度下降？',
    reasoning: '这是一个通用概念解释问题，可以直接基于已有知识回答，无需调用知识库工具。',
    toolCalls: [],
    answer: '梯度下降是一种优化算法……（直接给出准确的概念解释）。'
  }
]

// 默认会话示例：展示何时不需要工具、何时需要工具
const DEFAULT_EXAMPLES: FewShotExample[] = [
  {
    userQuery: '用 Python 写一个快速排序',
    reasoning: '这是通用编程问题，不依赖外部数据，直接回答即可，无需工具。',
    toolCalls: [],
    answer: '以下是快速排序的 Python 实现：……（给出可运行代码）。'
  },
  {
    userQuery: '帮我查一下这个项目仓库里有没有对应的实现',
    reasoning: '用户要求检索代码仓库或外部资源，需要联网或文件搜索工具支持。',
    toolCalls: [{ name: 'paper_web__search', args: { query: '项目仓库 开源实现' } }],
    answer: '根据搜索，该项目的官方仓库位于……（「根据联网搜索」）。'
  }
]

const EXAMPLES_BY_SESSION_TYPE: Record<string, FewShotExample[]> = {
  paper: PAPER_EXAMPLES,
  knowledge: KNOWLEDGE_EXAMPLES,
  default: DEFAULT_EXAMPLES
}

/** 单个 sessionType 注入的示例上限，避免 system prompt 膨胀 */
const MAX_EXAMPLES_PER_SESSION = 3

/**
 * 根据会话类型返回对应的 Few-shot 示例。
 * 未知 sessionType 回退到 default，每类最多返回 MAX_EXAMPLES_PER_SESSION 个。
 */
export function getFewShotExamples(sessionType?: string): FewShotExample[] {
  const key = sessionType && sessionType in EXAMPLES_BY_SESSION_TYPE ? sessionType : 'default'
  return EXAMPLES_BY_SESSION_TYPE[key].slice(0, MAX_EXAMPLES_PER_SESSION)
}
