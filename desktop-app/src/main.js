const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('child_process');
const fsSync = require('fs');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');

const repoRoot = path.resolve(__dirname, '../..');
const mcpServerDir = path.join(repoRoot, 'mcp-server');
const mcpServerEntrypoint = path.join(mcpServerDir, 'index.js');
const addonSource = path.join(repoRoot, 'blender-addon', 'claude_modeling_tools.py');

const claudeConfigPath = path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
const codexConfigPath = path.join(os.homedir(), '.codex', 'config.toml');
const blenderScriptsRoot = path.join(os.homedir(), 'Library', 'Application Support', 'Blender');
const blenderAppPath = '/Applications/Blender.app';
const tmpRoot = '/tmp';
const tmpReadLimitBytes = 300 * 1024;
const blenderClaudeWatchFile = '/tmp/blender_claude_execute.py';
const blenderResultFile = '/tmp/blender_result.json';

let mainWindow = null;
let serverProcess = null;
const appDisplayName = 'Blender MCP Launcher';

// Electron only inherits the minimal system PATH (/usr/bin:/bin etc.), so npm/node
// installed via NVM, Homebrew, or other managers won't be found with shell: false.
// Resolve the real path once by asking a login shell, then cache it.
const toolPathCache = {};

async function resolveToolPath(tool) {
  if (toolPathCache[tool]) return toolPathCache[tool];

  const shells = [process.env.SHELL, '/bin/zsh', '/bin/bash'].filter(Boolean);
  for (const shell of shells) {
    try {
      const result = await new Promise((resolve, reject) => {
        const child = spawn(shell, ['-l', '-c', `which ${tool}`], { env: process.env });
        let out = '';
        child.stdout.on('data', (d) => { out += d.toString(); });
        child.on('close', (code) => (code === 0 ? resolve(out.trim()) : reject()));
        child.on('error', reject);
      });
      if (result && fsSync.existsSync(result)) {
        toolPathCache[tool] = result;
        return result;
      }
    } catch {
      // try next shell
    }
  }

  // Fall back to common install locations
  const fallbacks = {
    npm: ['/opt/homebrew/bin/npm', '/usr/local/bin/npm', '/usr/bin/npm'],
    node: ['/opt/homebrew/bin/node', '/usr/local/bin/node', '/usr/bin/node'],
  };
  for (const candidate of (fallbacks[tool] || [])) {
    if (fsSync.existsSync(candidate)) {
      toolPathCache[tool] = candidate;
      return candidate;
    }
  }

  // Last resort: hope it's on PATH
  toolPathCache[tool] = tool;
  return tool;
}

app.setName(appDisplayName);

function resolveAppIcon() {
  const iconPng = path.join(repoRoot, 'desktop-app', 'build', 'icons', 'icon.png');
  if (fsSync.existsSync(iconPng)) {
    return iconPng;
  }
  return undefined;
}

function getBackupRoot() {
  return path.join(app.getPath('appData'), 'blender-mcp-launcher', 'backups');
}

function sendLog(message) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('server-log', `${new Date().toISOString()} ${message}`);
}

function sendInstallState(state) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('install-state', state);
}

async function autoInstallDeps() {
  if (await fileExists(path.join(mcpServerDir, 'node_modules'))) return;

  sendInstallState({ installing: true, error: null });
  sendLog('First run: installing MCP server dependencies...');

  try {
    const npm = await resolveToolPath('npm');
    await new Promise((resolve, reject) => {
      const child = spawn(npm, ['install'], { cwd: mcpServerDir, shell: false });
      child.stdout.on('data', (data) => sendLog(`[npm] ${data.toString().trimEnd()}`));
      child.stderr.on('data', (data) => sendLog(`[npm] ${data.toString().trimEnd()}`));
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`npm install exited with code ${code}`));
      });
      child.on('error', reject);
    });
    sendLog('MCP server dependencies installed successfully.');
    sendInstallState({ installing: false, error: null });
  } catch (error) {
    const msg = String(error.message || error);
    sendLog(`Dependency install failed: ${msg}`);
    sendInstallState({ installing: false, error: msg });
  }
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      env: { ...process.env, ...(options.env || {}) },
      shell: false,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', reject);

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr, code });
      } else {
        reject(new Error((stderr || stdout || `Command failed with code ${code}`).trim()));
      }
    });
  });
}

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function detectBlenderAddonTarget() {
  const fallback = path.join(blenderScriptsRoot, '5.0', 'scripts', 'addons');

  if (!(await fileExists(blenderScriptsRoot))) {
    return fallback;
  }

  const entries = await fs.readdir(blenderScriptsRoot, { withFileTypes: true });
  const versions = entries
    .filter((entry) => entry.isDirectory() && /^\d+(\.\d+)?$/.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));

  if (!versions.length) {
    return fallback;
  }

  return path.join(blenderScriptsRoot, versions[0], 'scripts', 'addons');
}

function tomlValue(value) {
  return JSON.stringify(value).replace(/\\/g, '\\\\');
}

function upsertCodexServerConfig(originalContent, serverPath) {
  const block = [
    '[mcp_servers.blender]',
    'command = "node"',
    `args = [${tomlValue(serverPath)}]`,
    'startup_timeout_sec = 20',
    'tool_timeout_sec = 60',
    'enabled = true',
    '',
  ].join('\n');

  const lines = originalContent ? originalContent.split(/\r?\n/) : [];
  const start = lines.findIndex((line) => line.trim() === '[mcp_servers.blender]');

  if (start === -1) {
    const prefix = originalContent && !originalContent.endsWith('\n') ? '\n' : '';
    return `${originalContent || ''}${prefix}${block}`;
  }

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i].trim().startsWith('[')) {
      end = i;
      break;
    }
  }

  const nextLines = [...lines.slice(0, start), ...block.trimEnd().split('\n'), ...lines.slice(end)];
  return `${nextLines.join('\n')}\n`;
}

async function listBackups(kind) {
  const dir = path.join(getBackupRoot(), kind);
  if (!(await fileExists(dir))) {
    return [];
  }

  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.bak'))
    .map((entry) => path.join(dir, entry.name))
    .sort((a, b) => b.localeCompare(a));
}

async function createConfigBackup(kind, sourcePath) {
  if (!(await fileExists(sourcePath))) {
    return null;
  }

  const backupDir = path.join(getBackupRoot(), kind);
  await fs.mkdir(backupDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `${stamp}.bak`);
  await fs.copyFile(sourcePath, backupPath);
  return backupPath;
}

async function restoreLatestConfigBackup(kind, targetPath) {
  const backups = await listBackups(kind);
  if (!backups.length) {
    throw new Error(`No ${kind} backup found.`);
  }

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.copyFile(backups[0], targetPath);
  return backups[0];
}

function ensureTmpPath(candidatePath) {
  const resolved = path.resolve(candidatePath);
  if (resolved !== tmpRoot && !resolved.startsWith(`${tmpRoot}${path.sep}`)) {
    throw new Error('Only /tmp files can be read.');
  }
  return resolved;
}

function isRelevantTmpFile(name) {
  const lower = name.toLowerCase();
  return lower.includes('blender')
    || lower.includes('mcp')
    || lower.includes('execute')
    || lower.includes('result')
    || lower.endsWith('.py')
    || lower.endsWith('.json')
    || lower.endsWith('.log')
    || lower.endsWith('.txt');
}

async function listTmpFiles() {
  const entries = await fs.readdir(tmpRoot, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!isRelevantTmpFile(entry.name)) continue;

    const fullPath = path.join(tmpRoot, entry.name);
    const stats = await fs.stat(fullPath);
    files.push({
      name: entry.name,
      path: fullPath,
      size: stats.size,
      modifiedAt: stats.mtime.toISOString(),
      modifiedMs: stats.mtimeMs,
    });
  }

  files.sort((a, b) => b.modifiedMs - a.modifiedMs);
  return files;
}

async function readTmpFile(filePath) {
  const safePath = ensureTmpPath(filePath);
  const stats = await fs.stat(safePath);
  if (!stats.isFile()) {
    throw new Error('Selected path is not a file.');
  }

  const raw = await fs.readFile(safePath);
  const truncated = raw.length > tmpReadLimitBytes;
  const view = truncated ? raw.subarray(0, tmpReadLimitBytes) : raw;

  return {
    path: safePath,
    size: raw.length,
    truncated,
    content: view.toString('utf8'),
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createRequestId() {
  return `launcher-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function resetBlenderResultFile() {
  const resetPayload = {
    status: 'reset',
    message: 'Result reset by Blender MCP Launcher',
    timestamp: Date.now() / 1000,
    request_id: null,
    model: 'launcher',
    last_code: null,
    objects_created: [],
    scene_objects: [],
    collections: [],
  };

  await fs.writeFile(blenderResultFile, `${JSON.stringify(resetPayload, null, 2)}\n`, 'utf8');
  return {
    path: blenderResultFile,
    payload: resetPayload,
  };
}

async function fetchLiveSceneSnapshot() {
  const requestId = createRequestId();
  const probeCode = `# MCP_REQUEST_ID:${requestId}
import bpy
print("Blender MCP Launcher snapshot request")
`;

  await fs.writeFile(blenderClaudeWatchFile, probeCode, 'utf8');
  sendLog(`Snapshot probe written to ${blenderClaudeWatchFile} (${requestId})`);

  const timeoutMs = 10000;
  const pollMs = 250;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      if (await fileExists(blenderResultFile)) {
        const raw = await fs.readFile(blenderResultFile, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed.request_id === requestId) {
          return {
            path: blenderResultFile,
            requestId,
            result: parsed,
          };
        }
      }
    } catch {
      // Ignore transient parse/read errors while file is being written.
    }

    await sleep(pollMs);
  }

  throw new Error(
    `Timed out waiting for Blender snapshot in ${blenderResultFile}. Make sure Blender is open and Auto-Execute is enabled.`
  );
}

async function checkSetupStatus() {
  const claudeBackups = await listBackups('claude');
  const codexBackups = await listBackups('codex');

  const status = {
    paths: {
      repoRoot,
      mcpServerEntrypoint,
      addonSource,
      claudeConfigPath,
      codexConfigPath,
      blenderAppPath,
      backupRoot: getBackupRoot(),
    },
    checks: {
      nodeInstalled: false,
      blenderInstalled: false,
      mcpDependenciesInstalled: false,
      addonSourcePresent: false,
      addonInstalled: false,
      claudeConfigExists: false,
      codexConfigExists: false,
      serverRunning: Boolean(serverProcess),
    },
    details: {
      claudeBackups: claudeBackups.length,
      codexBackups: codexBackups.length,
    },
  };

  try {
    const node = await resolveToolPath('node');
    const result = await runCommand(node, ['--version']);
    status.checks.nodeInstalled = true;
    status.details.nodeVersion = result.stdout.trim();
  } catch (error) {
    status.details.nodeVersion = error.message;
  }

  status.checks.blenderInstalled = await fileExists(blenderAppPath);
  status.checks.mcpDependenciesInstalled = await fileExists(path.join(mcpServerDir, 'node_modules'));
  status.checks.addonSourcePresent = await fileExists(addonSource);
  status.checks.claudeConfigExists = await fileExists(claudeConfigPath);
  status.checks.codexConfigExists = await fileExists(codexConfigPath);

  const addonTarget = await detectBlenderAddonTarget();
  const addonTargetFile = path.join(addonTarget, 'claude_modeling_tools.py');
  status.checks.addonInstalled = await fileExists(addonTargetFile);
  status.details.addonTarget = addonTarget;

  return status;
}

function createWindow() {
  const iconPath = resolveAppIcon();

  mainWindow = new BrowserWindow({
    width: 980,
    height: 720,
    minWidth: 840,
    minHeight: 620,
    title: appDisplayName,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
    return;
  }

  mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'renderer', 'index.html'));

  mainWindow.webContents.once('did-finish-load', () => {
    autoInstallDeps().catch((err) => sendLog(`Auto-install error: ${err.message || err}`));
  });
}

ipcMain.handle('setup:check', async () => checkSetupStatus());
ipcMain.handle('tmp:list-files', async () => listTmpFiles());
ipcMain.handle('tmp:read-file', async (_event, filePath) => readTmpFile(filePath));
ipcMain.handle('tmp:reset-result', async () => resetBlenderResultFile());
ipcMain.handle('tmp:fetch-snapshot', async () => fetchLiveSceneSnapshot());

ipcMain.handle('setup:install-deps', async () => {
  sendLog('Installing MCP server dependencies (npm install)...');
  const npm = await resolveToolPath('npm');
  const result = await runCommand(npm, ['install'], { cwd: mcpServerDir });
  sendLog('Dependencies installed.');
  return result.stdout || 'Dependencies installed.';
});

ipcMain.handle('setup:install-addon', async () => {
  const addonTarget = await detectBlenderAddonTarget();
  await fs.mkdir(addonTarget, { recursive: true });
  const targetFile = path.join(addonTarget, 'claude_modeling_tools.py');
  await fs.copyFile(addonSource, targetFile);
  sendLog(`Addon installed: ${targetFile}`);
  return targetFile;
});

ipcMain.handle('app:launch-blender', async () => {
  if (!(await fileExists(blenderAppPath))) {
    throw new Error(`Blender not found at ${blenderAppPath}`);
  }

  await runCommand('open', ['-a', blenderAppPath]);
  sendLog('Blender launched.');
  return { launched: true, blenderAppPath };
});

ipcMain.handle('config:claude', async () => {
  await fs.mkdir(path.dirname(claudeConfigPath), { recursive: true });
  const backupPath = await createConfigBackup('claude', claudeConfigPath);

  let config = {};
  if (await fileExists(claudeConfigPath)) {
    const raw = await fs.readFile(claudeConfigPath, 'utf8');
    config = raw.trim() ? JSON.parse(raw) : {};
  }

  if (!config.mcpServers || typeof config.mcpServers !== 'object') {
    config.mcpServers = {};
  }

  config.mcpServers.blender = {
    command: 'node',
    args: [mcpServerEntrypoint],
  };

  await fs.writeFile(claudeConfigPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  sendLog(`Claude config updated: ${claudeConfigPath}`);
  return { path: claudeConfigPath, backupPath };
});

ipcMain.handle('config:codex', async () => {
  await fs.mkdir(path.dirname(codexConfigPath), { recursive: true });
  const backupPath = await createConfigBackup('codex', codexConfigPath);

  const original = (await fileExists(codexConfigPath))
    ? await fs.readFile(codexConfigPath, 'utf8')
    : '';

  const updated = upsertCodexServerConfig(original, mcpServerEntrypoint);
  await fs.writeFile(codexConfigPath, updated, 'utf8');
  sendLog(`Codex config updated: ${codexConfigPath}`);
  return { path: codexConfigPath, backupPath };
});

ipcMain.handle('config:restore-claude', async () => {
  const restoredFrom = await restoreLatestConfigBackup('claude', claudeConfigPath);
  sendLog(`Claude config restored from backup: ${restoredFrom}`);
  return { path: claudeConfigPath, restoredFrom };
});

ipcMain.handle('config:restore-codex', async () => {
  const restoredFrom = await restoreLatestConfigBackup('codex', codexConfigPath);
  sendLog(`Codex config restored from backup: ${restoredFrom}`);
  return { path: codexConfigPath, restoredFrom };
});

ipcMain.handle('server:start', async (_event, options = {}) => {
  if (serverProcess) {
    return { alreadyRunning: true };
  }

  const transport = options.transport === 'http' ? 'http' : 'stdio';
  const host = options.host || '127.0.0.1';
  const port = options.port || '3030';
  const authToken = options.authToken || '';

  const env = { ...process.env, MCP_TRANSPORT: transport };
  if (transport === 'http') {
    env.HOST = host;
    env.PORT = String(port);
    if (authToken) {
      env.MCP_AUTH_TOKEN = authToken;
    }
  }

  const node = await resolveToolPath('node');
  serverProcess = spawn(node, [mcpServerEntrypoint], {
    cwd: mcpServerDir,
    env,
    shell: false,
  });

  serverProcess.stdout.on('data', (data) => {
    sendLog(`[server] ${data.toString().trimEnd()}`);
  });

  serverProcess.stderr.on('data', (data) => {
    sendLog(`[server:err] ${data.toString().trimEnd()}`);
  });

  serverProcess.on('close', (code, signal) => {
    sendLog(`Server stopped (code=${code}, signal=${signal || 'none'})`);
    serverProcess = null;
  });

  sendLog(`Server started in ${transport.toUpperCase()} mode.`);
  return { started: true, transport };
});

ipcMain.handle('server:stop', async () => {
  if (!serverProcess) {
    return { running: false };
  }

  serverProcess.kill('SIGTERM');
  return { running: false };
});

ipcMain.handle('server:status', async () => ({
  running: Boolean(serverProcess),
}));

app.whenReady().then(createWindow);
app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) {
    const iconPath = resolveAppIcon();
    if (iconPath) {
      app.dock.setIcon(iconPath);
    }
  }
});

app.on('window-all-closed', () => {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
  }
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
