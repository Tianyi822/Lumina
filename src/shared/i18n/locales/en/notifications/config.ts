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
  validateApiBaseUrlRequired: 'API Base URL cannot be empty',
  validateApiKeyRequired: 'API Key cannot be empty',
  validateModelNameRequired: 'Model name cannot be empty',
  noActiveConfig: 'Cannot update: no valid configuration available',
  initUnexpectedErrorPrefix: 'Unexpected error during configuration initialization: '
}

export default config
