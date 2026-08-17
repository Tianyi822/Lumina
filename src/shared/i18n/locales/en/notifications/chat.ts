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
  overlappingEdits: 'Editing operations on block {{blockId}} overlap'
}

export default chat
