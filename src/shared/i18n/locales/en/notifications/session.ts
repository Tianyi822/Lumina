import type { Resources } from '../../zh'

const session: Resources['notifications']['session'] = {
  invalidSessionId: 'Invalid session ID',
  sessionNotFound: 'Session not found',
  illegalSessionId: 'Illegal session ID: {{sessionId}}',
  validateTitleType: 'Title must be a string',
  validateTitleTooLong: 'Title cannot exceed {{max}} characters',
  validateMessagesType: 'Messages must be an array',
  validateMessagesEmpty: 'Messages array cannot be empty',
  validateMessageStructure: 'Invalid message structure',
  validateMetaPatchType: 'Metadata patch must be an object',
  initFailed: 'Session service initialization failed: {{detail}}',
  saveFailed: 'Failed to save the session: {{detail}}',
  appendMessagesFailed: 'Failed to append messages: {{detail}}',
  updateMetaFailed: 'Failed to update session metadata: {{detail}}',
  deleteFailed: 'Failed to delete the session: {{detail}}',
  writerResourceRefRequired: 'Writer sessions require a resourceRef with kind "writer"',
  factoryNotFound: 'No session factory found for type {{type}}'
}

export default session
