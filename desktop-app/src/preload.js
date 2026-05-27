const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('launcherApi', {
  checkSetup: () => ipcRenderer.invoke('setup:check'),
  installNode: () => ipcRenderer.invoke('setup:install-node'),
  installCodexCli: () => ipcRenderer.invoke('setup:install-codex-cli'),
  installDependencies: () => ipcRenderer.invoke('setup:install-deps'),
  installAddon: () => ipcRenderer.invoke('setup:install-addon'),
  installAssistantPacks: () => ipcRenderer.invoke('setup:install-assistant-packs'),
  exportClaudeSkillsZip: () => ipcRenderer.invoke('setup:export-claude-skills-zip'),
  launchBlender: () => ipcRenderer.invoke('app:launch-blender'),
  openBlenderDownload: () => ipcRenderer.invoke('app:open-blender-download'),
  openClaudeDownload: () => ipcRenderer.invoke('app:open-claude-download'),
  openChatgptDownload: () => ipcRenderer.invoke('app:open-chatgpt-download'),
  openCodexInstallDocs: () => ipcRenderer.invoke('app:open-codex-install-docs'),
  configureClaude: () => ipcRenderer.invoke('config:claude'),
  configureCodex: () => ipcRenderer.invoke('config:codex'),
  restoreClaudeConfig: () => ipcRenderer.invoke('config:restore-claude'),
  restoreCodexConfig: () => ipcRenderer.invoke('config:restore-codex'),
  listTmpFiles: () => ipcRenderer.invoke('tmp:list-files'),
  readTmpFile: (filePath) => ipcRenderer.invoke('tmp:read-file', filePath),
  resetResultFile: () => ipcRenderer.invoke('tmp:reset-result'),
  fetchSceneSnapshot: () => ipcRenderer.invoke('tmp:fetch-snapshot'),
  runPrompt: (options) => ipcRenderer.invoke('prompt:run', options),
  runCodexPrompt: (options) => ipcRenderer.invoke('agent:codex-run', options),
  runClaudePrompt: (options) => ipcRenderer.invoke('agent:claude-run', options),
  ragStatus: () => ipcRenderer.invoke('rag:status'),
  ragIndex: () => ipcRenderer.invoke('rag:index'),
  ragQuery: (options) => ipcRenderer.invoke('rag:query', options),
  startServer: (options) => ipcRenderer.invoke('server:start', options),
  stopServer: () => ipcRenderer.invoke('server:stop'),
  serverStatus: () => ipcRenderer.invoke('server:status'),
  onServerLog: (callback) => {
    const handler = (_event, line) => callback(line);
    ipcRenderer.on('server-log', handler);
    return () => ipcRenderer.removeListener('server-log', handler);
  },
  onAgentRunProgress: (callback) => {
    const handler = (_event, progressEvent) => callback(progressEvent);
    ipcRenderer.on('agent-run-progress', handler);
    return () => ipcRenderer.removeListener('agent-run-progress', handler);
  },
  onInstallState: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('install-state', handler);
    return () => ipcRenderer.removeListener('install-state', handler);
  },
  onNodeInstallState: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('node-install-state', handler);
    return () => ipcRenderer.removeListener('node-install-state', handler);
  },
});
