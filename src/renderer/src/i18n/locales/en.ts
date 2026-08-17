import type { Resources } from './zh'

/** 英文语言资源：结构必须与 zh.ts 完全一致（编译期类型约束） */
const en: Resources = {
  common: {
    close: 'Close',
    cancel: 'Cancel',
    add: 'Add',
    delete: 'Delete',
    edit: 'Edit',
    save: 'Save',
    test: 'Test',
    testing: 'Testing...',
    testConnection: 'Test Connection',
    saveConfig: 'Save',
    saving: 'Saving...',
    loading: 'Loading...',
    expand: 'Expand',
    collapse: 'Collapse',
    refresh: 'Refresh',
    refreshing: 'Refreshing...',
    copy: 'Copy',
    copying: 'Copying...',
    connect: 'Connect',
    connecting: 'Connecting...',
    disconnect: 'Disconnect'
  },
  settings: {
    title: 'Settings',
    loadingConfig: 'Loading current configuration...',
    nav: {
      paper: 'Paper Reader',
      knowledge: 'Knowledge Base',
      advanced: 'Advanced',
      display: 'Display',
      sync: 'Data Sync',
      update: 'Updates'
    },
    display: {
      title: 'Display',
      description:
        'Choose your interface language and appearance. Changes apply instantly and sync with the native UI.',
      language: {
        title: 'Language',
        description: 'Choose the interface language. The switch takes effect immediately.'
      },
      theme: {
        followSystem: 'Follow System Theme',
        followSystemAuto: 'Your system is in {{mode}} mode and the app follows it automatically.',
        followSystemManual: 'Your system is in {{mode}} mode. You can pick a theme manually.',
        systemDark: 'dark',
        systemLight: 'light',
        available: 'Available Themes',
        availableDescAuto:
          'Following the system theme. Cards preview the current mapping; turn off auto mode to pick manually.',
        availableDescManual:
          'Pick a theme as the global appearance. All interface elements adapt automatically.',
        currentChip: 'Current: {{name}}',
        applyTheme: 'Apply theme {{name}}',
        descDark: 'Baseline dark theme unifying the dark, flat, controlled interaction style',
        descLight: 'A fresh, bright light theme'
      }
    },
    model: {
      title: 'Chat Models',
      description:
        'Manage chat models and the default model. Changes sync to local config automatically.',
      listTitle: 'Model List',
      defaultChip: 'Default: {{name}}',
      noDefault: 'Not set',
      nthModel: 'Model {{index}}',
      unnamed: 'Unnamed model',
      defaultBadge: 'Default',
      setDefault: 'Set as Default',
      modelNameLabel: 'Model Name',
      empty: 'No models configured',
      newFormTitle: 'Add New Model',
      addModel: 'Add Model',
      apiKeyShow: 'Show API Key',
      apiKeyHide: 'Hide API Key'
    },
    embedding: {
      title: 'Embedding Models',
      description:
        'Embedding models determine knowledge base retrieval quality. Manage models, test connections, and create configurations here.',
      listTitle: 'Model List',
      empty: 'No embedding models configured',
      addModel: 'Add Embedding Model',
      dimensions: '{{value}} dim',
      modelLabel: 'Model:',
      formTitleAdd: 'Add Embedding Model',
      formTitleEdit: 'Edit Embedding Model',
      displayName: 'Display Name',
      nameConflict: 'This name is already in use',
      baseUrlLabel: 'API Base URL',
      baseUrlPlaceholder: 'http://127.0.0.1:1234/v1 (up to /v1, without /embeddings)',
      apiKeyLabel: 'API Key',
      modelNameLabel: 'Model Name',
      dimensionsLabel: 'Dimensions',
      validation: {
        nameRequired: 'Please enter a display name',
        baseUrlRequired: 'Please enter the API base URL',
        apiKeyRequired: 'Please enter the API key',
        modelRequired: 'Please enter the model name',
        dimensionRequired: 'Please enter the dimensions',
        dimensionInvalid: 'Please enter a valid number',
        dimensionInteger: 'Dimensions must be an integer',
        dimensionPositive: 'Dimensions must be greater than 0'
      }
    },
    mcp: {
      title: 'MCP Servers',
      description: 'Manage tool service connections, transports, and JSON config import.',
      listTitle: 'Server List',
      listDescription: '{{count}} MCP server configurations. Test, connect, or edit each one.',
      empty: 'No MCP servers configured',
      addServer: 'Add MCP Server',
      importJson: 'Import JSON Config',
      collapseImport: 'Collapse Import',
      importLabel: 'Paste MCP config JSON',
      importPlaceholder: 'Example:\n{\n  "mcpServers": {\n    "server-name": {\n      "command": "npx",\n      "args": ["-y", "some-mcp"]\n    }\n  }\n}',
      confirmImport: 'Import',
      importing: 'Importing...',
      connected: 'Connected',
      disconnected: 'Disconnected',
      transport: 'Transport',
      transportStdio: 'stdio (local process)',
      command: 'Command',
      commandArgs: 'Arguments (one per line)',
      envVars: 'Environment Variables (KEY=VALUE, one per line)',
      serviceUrl: 'Server URL',
      authHeaders: 'Auth Headers (KEY=VALUE, one per line)',
      availableTools: 'Available Tools ({{count}})',
      noTools: 'No tools available',
      serverName: 'Server Name',
      validation: {
        nameRequired: 'Server name is required',
        commandRequired: 'Command is required for MCP server "{{name}}"',
        urlRequired: 'Server URL is required for MCP server "{{name}}"'
      }
    },
    knowledgeMcp: {
      title: 'Knowledge Base MCP Server',
      description:
        'Expose knowledge base retrieval to external MCP clients — desktop apps, IDEs, and other AI toolchains.',
      statusTitle: 'Server Status',
      statusDescription:
        'After starting or stopping, the config JSON updates automatically and can be copied into any MCP client.',
      enableToggle: 'Enable MCP Server',
      running: 'Running',
      stopped: 'Stopped',
      configTitle: 'Server Config',
      configDescription: 'Copy this directly into your MCP client configuration file.',
      serverUrl: 'Server URL',
      guideTitle: 'Usage Guide',
      guideDescription: 'What the server does, how to connect, and the security boundaries.',
      introTitle: 'Knowledge Base MCP Server',
      introBody:
        'The knowledge base MCP server exposes the knowledge bases you create in this app over the MCP protocol, so external AI tools can search and reference your content. Once enabled, any MCP-compatible tool can call knowledge search directly and use relevant document snippets as context.',
      scenariosTitle: 'Use Cases',
      scenario1: 'Search and reference your knowledge base directly in Claude Desktop',
      scenario2: 'Get knowledge base context in IDEs like Cursor and Windsurf',
      scenario3: 'Let any MCP-compatible AI tool access your private knowledge',
      howtoTitle: 'How to Use',
      howto1: 'Turn on the toggle above to start the MCP server',
      howto2: 'Copy the JSON config shown above',
      howto3: 'Add the config to your MCP client configuration file',
      howto4: 'Restart the MCP client to use the knowledge base tools',
      securityTitle: 'Security Notes',
      security1: 'The server only listens on local network interfaces; external devices need LAN access',
      security2: 'Make sure your firewall allows access to the configured port',
      security3: 'This version has no authentication; use it only on trusted networks',
      security4: 'The server stops automatically when the app quits'
    },
    paperReader: {
      ocrTitle: 'OCR',
      ocrDescription: 'Choose an OCR provider and configure its credentials.',
      ocrProvider: 'OCR Provider',
      modelName: 'Model',
      concurrency: 'Concurrency',
      concurrencyHint: 'Limited by the provider; not editable',
      getApiKey: 'Get API Key',
      apiKeyPlaceholder: 'Enter the API key for this provider',
      requestUrl: 'Endpoint',
      translationTitle: 'Translation Model',
      translationDescription:
        'Choose the LLM used for paper translation. Translation needs context awareness, so only configured chat models are listed.',
      translationModel: 'Translation Model',
      useDefault: 'Use default model',
      useDefaultNamed: 'Use default model ({{model}})',
      defaultSuffix: ' (Default)'
    }
  }
}

export default en
