import type { Resources } from '../../zh'

const config: Resources['notifications']['config'] = {
  loadFailedTitle: 'Failed to load configuration',
  loadFailedPrefix: 'Failed to load configuration: ',
  saveSuccess: 'Configuration saved',
  saveFailedTitle: 'Failed to save configuration',
  saveFailedFallback: 'Save failed',
  saveFailedPrefix: 'Failed to save configuration: ',
  statusErrorTitle: 'Configuration error',
  statusFetchFailedPrefix: 'Failed to get configuration status: ',
  validateApiBaseUrlRequired: 'API base URL cannot be empty',
  validateApiKeyRequired: 'API key cannot be empty',
  validateModelNameRequired: 'Model name cannot be empty',
  noActiveConfig: 'Cannot update: no valid configuration available',
  initUnexpectedErrorPrefix: 'Unexpected error during configuration initialization: ',
  createFileFailed: 'Cannot create the configuration file: {{detail}}',
  loadFailed: 'Failed to load configuration: {{detail}}',
  saveFailed: 'Failed to save configuration: {{detail}}'
}

export default config
