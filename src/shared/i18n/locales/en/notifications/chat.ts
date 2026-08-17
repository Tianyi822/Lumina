import type { Resources } from '../../zh'

const chat: Resources['notifications']['chat'] = {
  configValidationFailed: 'Configuration validation failed',
  configNotLoaded: 'Configuration not loaded',
  modelConfigNotFound: 'Model configuration not found: {{modelKey}}',
  modelBusyRetryLater:
    'The model service is currently busy (429). Please retry later or switch to another model. Original error: {{reason}}',
  modelRateLimited:
    'Model requests are too frequent (429). Please retry later. Original error: {{reason}}',
  sessionNotFound: 'Session not found',
  planStepFailed: 'Step {{index}} failed',
  planStepExecutionFailed: 'Step execution failed',
  planUserCancelled: 'Cancelled by user',
  unknownError: 'Unknown error',
  unknownWriterTool: 'Unknown writer tool: {{toolName}}, only propose_edits is supported',
  titleModifyForbidden:
    'Modifying the document title is forbidden: the title is read-only metadata',
  invalidProposalArgs: 'Invalid edit proposal arguments: {{issues}}',
  replaceBlocksRequiresTargets: 'replace_blocks requires targetBlockIds',
  unsupportedEditOperation: 'Unsupported edit operation: {{kind}}',
  blockNotInScope: 'Block {{blockId}} is not within the current editing scope',
  offsetOutOfRange: 'Offset {{offset}} of block {{blockId}} is out of range',
  invalidTextRange: 'Range [{{from}}, {{to}}) of block {{blockId}} is invalid',
  disallowedBlockType:
    'Disallowed block type: {{type}} (image or table structure changes are forbidden)',
  insertBudgetExceeded: 'Total inserted text exceeds the limit of {{limit}} characters',
  overlappingEdits: 'Editing operations on block {{blockId}} overlap',
  duplicateCallBlocked: '[duplicate] Repeated consecutive calls',
  duplicateCallBlockedDetail_one:
    '[duplicate] Repeated consecutive calls of "{{toolName}}" reached {{count}} time, likely stuck in a loop. Please use different arguments or change approach (for example, check status first, proceed step by step, or switch to another tool).',
  duplicateCallBlockedDetail_other:
    '[duplicate] Repeated consecutive calls of "{{toolName}}" reached {{count}} times, likely stuck in a loop. Please use different arguments or change approach (for example, check status first, proceed step by step, or switch to another tool).',
  toolCallOperation: 'Tool call {{toolName}}',
  toolNotFound: 'Registered tool not found: {{toolName}}',
  toolCallFailed: 'Tool call failed',
  parseToolArgsFailed: 'Failed to parse tool arguments: {{error}}',
  mcpServerNotFound: 'MCP server not found: {{serverName}}',
  unknownPaperTool: 'Unknown paper tool: {{toolName}}, only search_context is supported',
  paperIdNotSet: 'Paper ID is not set, cannot retrieve paper context'
}

export default chat
