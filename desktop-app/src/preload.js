const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('launcherApi', {
  checkSetup: () => ipcRenderer.invoke('setup:check'),
  installDependencies: () => ipcRenderer.invoke('setup:install-deps'),
  installAddon: () => ipcRenderer.invoke('setup:install-addon'),
  launchBlender: () => ipcRenderer.invoke('app:launch-blender'),
  configureClaude: () => ipcRenderer.invoke('config:claude'),
  configureCodex: () => ipcRenderer.invoke('config:codex'),
  restoreClaudeConfig: () => ipcRenderer.invoke('config:restore-claude'),
  restoreCodexConfig: () => ipcRenderer.invoke('config:restore-codex'),
  listTmpFiles: () => ipcRenderer.invoke('tmp:list-files'),
  readTmpFile: (filePath) => ipcRenderer.invoke('tmp:read-file', filePath),
  resetResultFile: () => ipcRenderer.invoke('tmp:reset-result'),
  fetchSceneSnapshot: () => ipcRenderer.invoke('tmp:fetch-snapshot'),
  startServer: (options) => ipcRenderer.invoke('server:start', options),
  stopServer: () => ipcRenderer.invoke('server:stop'),
  serverStatus: () => ipcRenderer.invoke('server:status'),
  onServerLog: (callback) => {
    const handler = (_event, line) => callback(line);
    ipcRenderer.on('server-log', handler);
    return () => ipcRenderer.removeListener('server-log', handler);
  },
  onInstallState: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('install-state', handler);
    return () => ipcRenderer.removeListener('install-state', handler);
  },
});
