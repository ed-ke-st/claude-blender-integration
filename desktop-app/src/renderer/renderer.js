const setupStatusEl = document.getElementById('setup-status');
const configStatusEl = document.getElementById('config-status');
const serverStatusEl = document.getElementById('server-status');
const serverLogsEl = document.getElementById('server-logs');
const tmpStatusEl = document.getElementById('tmp-status');
const tmpContentEl = document.getElementById('tmp-content');

const checkSetupBtn = document.getElementById('check-setup');
const launchBlenderBtn = document.getElementById('launch-blender');
const installDepsBtn = document.getElementById('install-deps');
const installAddonBtn = document.getElementById('install-addon');
const configureClaudeBtn = document.getElementById('configure-claude');
const restoreClaudeBtn = document.getElementById('restore-claude');
const configureCodexBtn = document.getElementById('configure-codex');
const restoreCodexBtn = document.getElementById('restore-codex');
const startServerBtn = document.getElementById('start-server');
const stopServerBtn = document.getElementById('stop-server');
const tmpRefreshBtn = document.getElementById('tmp-refresh');
const tmpOpenBtn = document.getElementById('tmp-open');
const tmpFetchSnapshotBtn = document.getElementById('tmp-fetch-snapshot');
const tmpResetResultBtn = document.getElementById('tmp-reset-result');
const tmpFileSelectEl = document.getElementById('tmp-file-select');

const transportEl = document.getElementById('transport');
const hostEl = document.getElementById('host');
const portEl = document.getElementById('port');
const authTokenEl = document.getElementById('auth-token');

function setBusy(button, busy) {
  button.disabled = busy;
}

function appendLog(line) {
  if (!line) return;
  const current = serverLogsEl.textContent.trim();
  serverLogsEl.textContent = current ? `${current}\n${line}` : line;
  serverLogsEl.scrollTop = serverLogsEl.scrollHeight;
}

function formatSetupStatus(result) {
  const c = result.checks;
  const d = result.details;
  return [
    `Node installed: ${c.nodeInstalled ? 'yes' : 'no'} ${d.nodeVersion ? `(${d.nodeVersion})` : ''}`,
    `Blender installed (${result.paths.blenderAppPath}): ${c.blenderInstalled ? 'yes' : 'no'}`,
    `MCP dependencies (mcp-server/node_modules): ${c.mcpDependenciesInstalled ? 'yes' : 'no'}`,
    `Addon source present: ${c.addonSourcePresent ? 'yes' : 'no'}`,
    `Addon installed in Blender: ${c.addonInstalled ? 'yes' : 'no'}`,
    `Claude config exists: ${c.claudeConfigExists ? 'yes' : 'no'}`,
    `Codex config exists: ${c.codexConfigExists ? 'yes' : 'no'}`,
    `Claude config backups: ${d.claudeBackups}`,
    `Codex config backups: ${d.codexBackups}`,
    `Server running: ${c.serverRunning ? 'yes' : 'no'}`,
    '',
    'Paths:',
    `- Repo: ${result.paths.repoRoot}`,
    `- Server: ${result.paths.mcpServerEntrypoint}`,
    `- Addon source: ${result.paths.addonSource}`,
    `- Addon target: ${d.addonTarget || '(not detected)'}`,
    `- Claude config: ${result.paths.claudeConfigPath}`,
    `- Codex config: ${result.paths.codexConfigPath}`,
    `- Backups root: ${result.paths.backupRoot}`,
  ].join('\n');
}

async function refreshSetupStatus() {
  const result = await window.launcherApi.checkSetup();
  setupStatusEl.textContent = formatSetupStatus(result);
}

function renderTmpFiles(files) {
  tmpFileSelectEl.innerHTML = '';
  if (!files.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No relevant files found in /tmp';
    tmpFileSelectEl.append(option);
    return;
  }

  for (const file of files) {
    const option = document.createElement('option');
    option.value = file.path;
    option.textContent = `${file.name} (${file.size} bytes, ${file.modifiedAt})`;
    tmpFileSelectEl.append(option);
  }
}

async function refreshTmpFiles() {
  const files = await window.launcherApi.listTmpFiles();
  renderTmpFiles(files);
  tmpStatusEl.textContent = `Found ${files.length} relevant files in /tmp.`;
}

function selectTmpFile(targetPath) {
  if (!targetPath) return false;
  for (const option of tmpFileSelectEl.options) {
    if (option.value === targetPath) {
      tmpFileSelectEl.value = targetPath;
      return true;
    }
  }
  return false;
}

checkSetupBtn.addEventListener('click', async () => {
  setBusy(checkSetupBtn, true);
  try {
    await refreshSetupStatus();
  } catch (error) {
    setupStatusEl.textContent = String(error.message || error);
  } finally {
    setBusy(checkSetupBtn, false);
  }
});

launchBlenderBtn.addEventListener('click', async () => {
  setBusy(launchBlenderBtn, true);
  try {
    const result = await window.launcherApi.launchBlender();
    setupStatusEl.textContent = `Blender launch requested:\n${result.blenderAppPath}`;
    await refreshSetupStatus();
  } catch (error) {
    setupStatusEl.textContent = `Blender launch failed:\n${String(error.message || error)}`;
  } finally {
    setBusy(launchBlenderBtn, false);
  }
});

installDepsBtn.addEventListener('click', async () => {
  setBusy(installDepsBtn, true);
  try {
    const output = await window.launcherApi.installDependencies();
    setupStatusEl.textContent = `Dependencies installed.\n\n${output}`;
    await refreshSetupStatus();
  } catch (error) {
    setupStatusEl.textContent = `Dependency install failed:\n${String(error.message || error)}`;
  } finally {
    setBusy(installDepsBtn, false);
  }
});

installAddonBtn.addEventListener('click', async () => {
  setBusy(installAddonBtn, true);
  try {
    const file = await window.launcherApi.installAddon();
    setupStatusEl.textContent = `Addon installed to:\n${file}`;
    await refreshSetupStatus();
  } catch (error) {
    setupStatusEl.textContent = `Addon install failed:\n${String(error.message || error)}`;
  } finally {
    setBusy(installAddonBtn, false);
  }
});

configureClaudeBtn.addEventListener('click', async () => {
  setBusy(configureClaudeBtn, true);
  try {
    const result = await window.launcherApi.configureClaude();
    const backupNote = result.backupPath
      ? `\nBackup created:\n${result.backupPath}`
      : '\nNo previous file existed, so no backup was created.';
    configStatusEl.textContent = `Claude Desktop config updated:\n${result.path}${backupNote}\n\nRestart Claude Desktop to reload MCP servers.`;
    await refreshSetupStatus();
  } catch (error) {
    configStatusEl.textContent = `Failed to configure Claude:\n${String(error.message || error)}`;
  } finally {
    setBusy(configureClaudeBtn, false);
  }
});

restoreClaudeBtn.addEventListener('click', async () => {
  setBusy(restoreClaudeBtn, true);
  try {
    const result = await window.launcherApi.restoreClaudeConfig();
    configStatusEl.textContent = `Claude config restored:\n${result.path}\n\nRestored from:\n${result.restoredFrom}`;
    await refreshSetupStatus();
  } catch (error) {
    configStatusEl.textContent = `Failed to restore Claude config:\n${String(error.message || error)}`;
  } finally {
    setBusy(restoreClaudeBtn, false);
  }
});

configureCodexBtn.addEventListener('click', async () => {
  setBusy(configureCodexBtn, true);
  try {
    const result = await window.launcherApi.configureCodex();
    const backupNote = result.backupPath
      ? `\nBackup created:\n${result.backupPath}`
      : '\nNo previous file existed, so no backup was created.';
    configStatusEl.textContent = `Codex config updated:\n${result.path}${backupNote}`;
    await refreshSetupStatus();
  } catch (error) {
    configStatusEl.textContent = `Failed to configure Codex:\n${String(error.message || error)}`;
  } finally {
    setBusy(configureCodexBtn, false);
  }
});

restoreCodexBtn.addEventListener('click', async () => {
  setBusy(restoreCodexBtn, true);
  try {
    const result = await window.launcherApi.restoreCodexConfig();
    configStatusEl.textContent = `Codex config restored:\n${result.path}\n\nRestored from:\n${result.restoredFrom}`;
    await refreshSetupStatus();
  } catch (error) {
    configStatusEl.textContent = `Failed to restore Codex config:\n${String(error.message || error)}`;
  } finally {
    setBusy(restoreCodexBtn, false);
  }
});

startServerBtn.addEventListener('click', async () => {
  setBusy(startServerBtn, true);
  try {
    const result = await window.launcherApi.startServer({
      transport: transportEl.value,
      host: hostEl.value.trim(),
      port: portEl.value.trim(),
      authToken: authTokenEl.value,
    });
    if (result.alreadyRunning) {
      serverStatusEl.textContent = 'Server already running.';
    } else {
      serverStatusEl.textContent = `Server started (${result.transport}).`;
    }
    const status = await window.launcherApi.serverStatus();
    if (!status.running) {
      serverStatusEl.textContent = 'Server failed to start.';
    }
    await refreshSetupStatus();
  } catch (error) {
    serverStatusEl.textContent = `Start failed:\n${String(error.message || error)}`;
  } finally {
    setBusy(startServerBtn, false);
  }
});

stopServerBtn.addEventListener('click', async () => {
  setBusy(stopServerBtn, true);
  try {
    await window.launcherApi.stopServer();
    serverStatusEl.textContent = 'Stop signal sent.';
    await refreshSetupStatus();
  } catch (error) {
    serverStatusEl.textContent = `Stop failed:\n${String(error.message || error)}`;
  } finally {
    setBusy(stopServerBtn, false);
  }
});

tmpRefreshBtn.addEventListener('click', async () => {
  setBusy(tmpRefreshBtn, true);
  try {
    await refreshTmpFiles();
  } catch (error) {
    tmpStatusEl.textContent = `Failed to list /tmp files:\n${String(error.message || error)}`;
  } finally {
    setBusy(tmpRefreshBtn, false);
  }
});

tmpOpenBtn.addEventListener('click', async () => {
  setBusy(tmpOpenBtn, true);
  try {
    const selected = tmpFileSelectEl.value;
    if (!selected) {
      tmpStatusEl.textContent = 'No /tmp file is selected.';
      return;
    }

    const result = await window.launcherApi.readTmpFile(selected);
    tmpStatusEl.textContent = result.truncated
      ? `Opened ${result.path} (${result.size} bytes, showing first 307200 bytes)`
      : `Opened ${result.path} (${result.size} bytes)`;
    tmpContentEl.textContent = result.content || '(file is empty)';
  } catch (error) {
    tmpStatusEl.textContent = `Failed to read /tmp file:\n${String(error.message || error)}`;
  } finally {
    setBusy(tmpOpenBtn, false);
  }
});

tmpResetResultBtn.addEventListener('click', async () => {
  setBusy(tmpResetResultBtn, true);
  try {
    const result = await window.launcherApi.resetResultFile();
    await refreshTmpFiles();
    selectTmpFile(result.path);
    tmpStatusEl.textContent = `Reset ${result.path}`;
    tmpContentEl.textContent = JSON.stringify(result.payload, null, 2);
  } catch (error) {
    tmpStatusEl.textContent = `Failed to reset result file:\n${String(error.message || error)}`;
  } finally {
    setBusy(tmpResetResultBtn, false);
  }
});

tmpFetchSnapshotBtn.addEventListener('click', async () => {
  setBusy(tmpFetchSnapshotBtn, true);
  try {
    tmpStatusEl.textContent = 'Requesting live scene snapshot from Blender...';
    const response = await window.launcherApi.fetchSceneSnapshot();
    await refreshTmpFiles();
    selectTmpFile(response.path);
    const sceneCount = Array.isArray(response.result.scene_objects) ? response.result.scene_objects.length : 0;
    tmpStatusEl.textContent = `Fetched snapshot (${sceneCount} scene object(s), request_id=${response.requestId}).`;
    tmpContentEl.textContent = JSON.stringify(response.result, null, 2);
  } catch (error) {
    tmpStatusEl.textContent = `Failed to fetch scene snapshot:\n${String(error.message || error)}`;
  } finally {
    setBusy(tmpFetchSnapshotBtn, false);
  }
});

window.launcherApi.onServerLog((line) => appendLog(line));

refreshSetupStatus().catch((error) => {
  setupStatusEl.textContent = String(error.message || error);
});

refreshTmpFiles().catch((error) => {
  tmpStatusEl.textContent = `Failed to list /tmp files:\n${String(error.message || error)}`;
});
