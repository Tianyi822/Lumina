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
  validateMetaPatchType: 'Metadata patch must be an object'
}

export default session
