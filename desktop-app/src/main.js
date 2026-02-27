const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { spawn } = require('child_process');
const fsSync = require('fs');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');

const repoRoot = path.resolve(__dirname, '../..');
const mcpServerDir = path.join(repoRoot, 'mcp-server');
const mcpServerEntrypoint = path.join(mcpServerDir, 'index.js');
const ragStorePath = path.join(repoRoot, '.rag', 'vector-store.json');
const addonSource = path.join(repoRoot, 'blender-addon', 'claude_modeling_tools.py');
const assistantPacksRepoDir = path.join(repoRoot, 'assistant-packs');
const assistantPacksResourceDir = path.join(process.resourcesPath || '', 'assistant-packs');

const claudeConfigPath = path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
const codexConfigPath = path.join(os.homedir(), '.codex', 'config.toml');
const claudeLocalAgentSkillsPluginRoot = path.join(
  os.homedir(),
  'Library',
  'Application Support',
  'Claude',
  'local-agent-mode-sessions',
  'skills-plugin'
);
const blenderScriptsRoot = path.join(os.homedir(), 'Library', 'Application Support', 'Blender');
const blenderAppPath = '/Applications/Blender.app';
const blenderDownloadUrl = 'https://www.blender.org/download/';
const claudeDesktopDownloadUrl = 'https://claude.ai/download';
const codexInstallDocsUrl = 'https://github.com/openai/codex#installation';
const codexNpmPackage = '@openai/codex';
const chatgptDesktopDownloadUrl = 'https://openai.com/chatgpt/desktop/';
const claudeDesktopAppCandidates = [
  '/Applications/Claude.app',
  '/Applications/Claude Desktop.app',
];
const chatgptDesktopAppCandidates = [
  '/Applications/ChatGPT.app',
];
// Use the OS per-user temp dir — avoids EACCES collisions when multiple macOS
// users run the app (sticky bit on /tmp prevents cross-user file writes).
const tmpRoot = os.tmpdir();
const tmpReadLimitBytes = 300 * 1024;
const blenderClaudeWatchFile = path.join(tmpRoot, 'blender_claude_execute.py');
const blenderResultFile = path.join(tmpRoot, 'blender_result.json');
const nodeDownloadUrl = 'https://nodejs.org/en/download';
const nvmReleaseBaseUrl = 'https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4';
const nvmNodeMajor = '24';

let mainWindow = null;
let serverProcess = null;
let nodeInstallJob = null;
const appDisplayName = 'Blender MCP Launcher';

// Electron only inherits the minimal system PATH (/usr/bin:/bin etc.), so npm/node
// installed via NVM, Homebrew, or other managers won't be found with shell: false.
// Resolve the real path once by asking a login shell, then cache it.
const toolPathCache = {};

async function runLoginShell(command, options = {}) {
  const shells = [process.env.SHELL, '/bin/zsh', '/bin/bash'].filter(Boolean);
  let lastError = null;

  for (const shell of shells) {
    try {
      return await runCommand(shell, ['-l', '-c', command], options);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('No login shell available to run command.');
}

async function resolveToolPath(tool) {
  if (toolPathCache[tool]) return toolPathCache[tool];

  if (tool === 'node' || tool === 'npm') {
    try {
      const nvmResolveCmd = [
        'export NVM_DIR="$HOME/.nvm"',
        '[ -s "$NVM_DIR/nvm.sh" ]',
        '. "$NVM_DIR/nvm.sh"',
        `command -v ${tool}`,
      ].join(' && ');

      const nvmResolved = (await runLoginShell(nvmResolveCmd)).stdout.trim();
      if (nvmResolved && fsSync.existsSync(nvmResolved)) {
        toolPathCache[tool] = nvmResolved;
        return nvmResolved;
      }
    } catch {
      // nvm not available yet; continue with standard resolution.
    }
  }

  const shells = [process.env.SHELL, '/bin/zsh', '/bin/bash'].filter(Boolean);
  for (const shell of shells) {
    try {
      const result = await new Promise((resolve, reject) => {
        const child = spawn(shell, ['-l', '-c', `command -v ${tool}`], { env: process.env });
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
    codex: ['/opt/homebrew/bin/codex', '/usr/local/bin/codex', '/usr/bin/codex'],
    brew: ['/opt/homebrew/bin/brew', '/usr/local/bin/brew', '/usr/bin/brew'],
    zip: ['/usr/bin/zip', '/opt/homebrew/bin/zip', '/usr/local/bin/zip'],
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

// Build an env that prepends the resolved tool's bin directory to PATH so that
// npm scripts (which use #!/usr/bin/env node internally) can find their sibling
// node binary even when Electron's inherited PATH is minimal.
async function envWithToolPath(tool) {
  const resolved = await resolveToolPath(tool);
  const binDir = resolved !== tool ? path.dirname(resolved) : null;
  const base = process.env.PATH || '';
  const augmented = binDir && !base.split(':').includes(binDir)
    ? `${binDir}:${base}`
    : base;
  return { ...process.env, PATH: augmented };
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

function sendNodeInstallState(state) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('node-install-state', state);
}

function resolveAssistantPackPath(...segments) {
  const candidates = [
    path.join(assistantPacksRepoDir, ...segments),
    path.join(assistantPacksResourceDir, ...segments),
  ];

  for (const candidate of candidates) {
    if (fsSync.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Assistant pack not found: ${segments.join('/')}`);
}

async function installCodexSkillsFromPack() {
  const sourceRoot = resolveAssistantPackPath('codex', 'skills');
  const codexSkillsRoot = path.join(os.homedir(), '.codex', 'skills');
  await fs.mkdir(codexSkillsRoot, { recursive: true });

  const entries = await fs.readdir(sourceRoot, { withFileTypes: true });
  let installed = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const sourceSkillFile = path.join(sourceRoot, entry.name, 'SKILL.md');
    if (!(await fileExists(sourceSkillFile))) continue;

    const targetSkillDir = path.join(codexSkillsRoot, entry.name);
    await fs.mkdir(targetSkillDir, { recursive: true });
    await fs.copyFile(sourceSkillFile, path.join(targetSkillDir, 'SKILL.md'));
    installed += 1;
  }

  return {
    installed,
    targetRoot: codexSkillsRoot,
  };
}

async function installClaudeSkillsFromPack() {
  const sourceRoot = resolveAssistantPackPath('claude', 'skills');
  const claudeSkillsRoot = path.join(os.homedir(), '.claude', 'skills');
  await fs.mkdir(claudeSkillsRoot, { recursive: true });

  const entries = await fs.readdir(sourceRoot, { withFileTypes: true });
  let installed = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const sourceSkillFile = path.join(sourceRoot, entry.name, 'SKILL.md');
    if (!(await fileExists(sourceSkillFile))) continue;

    const targetSkillDir = path.join(claudeSkillsRoot, entry.name);
    await fs.mkdir(targetSkillDir, { recursive: true });
    await fs.copyFile(sourceSkillFile, path.join(targetSkillDir, 'SKILL.md'));
    installed += 1;
  }

  return {
    installed,
    targetRoot: claudeSkillsRoot,
  };
}

async function installClaudeSubAgentsFromPack() {
  let sourceRoot;
  try {
    sourceRoot = resolveAssistantPackPath('claude', 'sub-agents');
  } catch {
    return {
      installed: 0,
      targetRoot: path.join(os.homedir(), '.claude', 'agents'),
    };
  }

  const claudeAgentsRoot = path.join(os.homedir(), '.claude', 'agents');
  await fs.mkdir(claudeAgentsRoot, { recursive: true });

  const entries = await fs.readdir(sourceRoot, { withFileTypes: true });
  let installed = 0;

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.md')) continue;

    const sourceFile = path.join(sourceRoot, entry.name);
    const targetFile = path.join(claudeAgentsRoot, entry.name);
    await fs.copyFile(sourceFile, targetFile);
    installed += 1;
  }

  return {
    installed,
    targetRoot: claudeAgentsRoot,
  };
}

async function listClaudeLocalAgentSkillsRoots() {
  if (!(await fileExists(claudeLocalAgentSkillsPluginRoot))) {
    return [];
  }

  const roots = [];
  const pluginEntries = await fs.readdir(claudeLocalAgentSkillsPluginRoot, { withFileTypes: true });
  for (const pluginEntry of pluginEntries) {
    if (!pluginEntry.isDirectory()) continue;
    const pluginPath = path.join(claudeLocalAgentSkillsPluginRoot, pluginEntry.name);
    const sessionEntries = await fs.readdir(pluginPath, { withFileTypes: true });
    for (const sessionEntry of sessionEntries) {
      if (!sessionEntry.isDirectory()) continue;
      const skillsPath = path.join(pluginPath, sessionEntry.name, 'skills');
      if (await fileExists(skillsPath)) {
        roots.push(skillsPath);
      }
    }
  }

  return roots;
}

function parseSkillFrontmatter(skillContent) {
  const lines = skillContent.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') {
    return {};
  }

  const out = {};
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (line === '---') break;
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

async function readClaudeSkillMetadataFromPack() {
  const sourceRoot = resolveAssistantPackPath('claude', 'skills');
  const entries = await fs.readdir(sourceRoot, { withFileTypes: true });
  const skills = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillId = entry.name;
    const sourceSkillFile = path.join(sourceRoot, skillId, 'SKILL.md');
    if (!(await fileExists(sourceSkillFile))) continue;

    const raw = await fs.readFile(sourceSkillFile, 'utf8');
    const frontmatter = parseSkillFrontmatter(raw);
    skills.push({
      skillId,
      name: frontmatter.name || skillId,
      description: frontmatter.description || `${skillId} skill`,
    });
  }

  return skills;
}

async function upsertClaudeLocalAgentManifest(sessionRoot, skillMetadata) {
  const manifestPath = path.join(sessionRoot, 'manifest.json');
  let manifest = {
    lastUpdated: Date.now(),
    skills: [],
  };

  if (await fileExists(manifestPath)) {
    try {
      const raw = await fs.readFile(manifestPath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        manifest = {
          ...parsed,
          skills: Array.isArray(parsed.skills) ? parsed.skills : [],
        };
      }
    } catch {
      manifest = {
        lastUpdated: Date.now(),
        skills: [],
      };
    }
  }

  const nowIso = new Date().toISOString();
  for (const skill of skillMetadata) {
    const idx = manifest.skills.findIndex((item) => item && item.skillId === skill.skillId);
    const nextItem = {
      skillId: skill.skillId,
      name: skill.name,
      description: skill.description,
      creatorType: 'user',
      updatedAt: nowIso,
      enabled: true,
    };

    if (idx === -1) {
      manifest.skills.push(nextItem);
    } else {
      manifest.skills[idx] = {
        ...(manifest.skills[idx] || {}),
        ...nextItem,
      };
    }
  }

  manifest.lastUpdated = Date.now();
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifestPath;
}

async function installClaudeSkillsToLocalAgentSessionsFromPack() {
  const sourceRoot = resolveAssistantPackPath('claude', 'skills');
  const targetRoots = await listClaudeLocalAgentSkillsRoots();
  if (!targetRoots.length) {
    return {
      sessionsFound: 0,
      skillDirsUpdated: 0,
      totalCopies: 0,
      manifestsUpdated: 0,
      manifestPaths: [],
      targetRoots: [],
    };
  }

  const sourceEntries = await fs.readdir(sourceRoot, { withFileTypes: true });
  const metadata = await readClaudeSkillMetadataFromPack();
  let skillDirsUpdated = 0;
  let totalCopies = 0;
  let manifestsUpdated = 0;
  const manifestPaths = [];

  for (const targetRoot of targetRoots) {
    const sessionRoot = path.dirname(targetRoot);
    for (const entry of sourceEntries) {
      if (!entry.isDirectory()) continue;
      const sourceSkillFile = path.join(sourceRoot, entry.name, 'SKILL.md');
      if (!(await fileExists(sourceSkillFile))) continue;

      const targetSkillDir = path.join(targetRoot, entry.name);
      await fs.mkdir(targetSkillDir, { recursive: true });
      await fs.copyFile(sourceSkillFile, path.join(targetSkillDir, 'SKILL.md'));
      skillDirsUpdated += 1;
      totalCopies += 1;
    }

    if (metadata.length) {
      const manifestPath = await upsertClaudeLocalAgentManifest(sessionRoot, metadata);
      manifestsUpdated += 1;
      manifestPaths.push(manifestPath);
    }
  }

  return {
    sessionsFound: targetRoots.length,
    skillDirsUpdated,
    totalCopies,
    manifestsUpdated,
    manifestPaths,
    targetRoots,
  };
}

function timestampTag() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function exportClaudeSkillsZipFromPack() {
  const sourceRoot = resolveAssistantPackPath('claude', 'skills');
  const downloadsDir = path.join(os.homedir(), 'Downloads');
  await fs.mkdir(downloadsDir, { recursive: true });

  const stamp = timestampTag();
  const stagingRoot = path.join(tmpRoot, `blender-mcp-claude-skills-${stamp}`);
  const packageRoot = path.join(stagingRoot, 'claude-skills');
  const zipPath = path.join(downloadsDir, `blender-mcp-claude-skills-${stamp}.zip`);

  await fs.rm(stagingRoot, { recursive: true, force: true });
  await fs.mkdir(packageRoot, { recursive: true });
  await fs.rm(zipPath, { force: true });

  let included = 0;

  try {
    const entries = await fs.readdir(sourceRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const sourceSkillFile = path.join(sourceRoot, entry.name, 'SKILL.md');
      if (!(await fileExists(sourceSkillFile))) continue;

      const targetSkillDir = path.join(packageRoot, entry.name);
      await fs.mkdir(targetSkillDir, { recursive: true });
      await fs.copyFile(sourceSkillFile, path.join(targetSkillDir, 'SKILL.md'));
      included += 1;
    }

    if (!included) {
      throw new Error('No Claude skills were found to export.');
    }

    const zip = await resolveToolPath('zip');
    await runCommand(zip, ['-r', zipPath, 'claude-skills'], { cwd: stagingRoot });
    return {
      zipPath,
      skillsIncluded: included,
      sourceRoot,
    };
  } finally {
    await fs.rm(stagingRoot, { recursive: true, force: true });
  }
}

async function autoInstallDeps() {
  if (await fileExists(path.join(mcpServerDir, 'node_modules'))) return;

  const nodeProbe = await probeNodeInstallation();
  if (!nodeProbe.installed) {
    sendLog('First run: Node.js not detected yet; skipping automatic dependency install.');
    sendInstallState({
      installing: false,
      error: null,
      skipped: true,
      reason: 'node-missing',
    });
    return;
  }

  sendInstallState({ installing: true, error: null });
  sendLog('First run: installing MCP server dependencies...');

  try {
    const npm = await resolveToolPath('npm');
    const npmEnv = await envWithToolPath('npm');
    await new Promise((resolve, reject) => {
      const child = spawn(npm, ['install'], { cwd: mcpServerDir, env: npmEnv, shell: false });
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
    const friendlyMsg = /spawn npm ENOENT/i.test(msg)
      ? 'npm was not found. Install Node.js first, then install dependencies.'
      : msg;
    sendLog(`Dependency install failed: ${friendlyMsg}`);
    sendInstallState({ installing: false, error: friendlyMsg });
  }
}

function parseJsonOutput(rawText, context) {
  try {
    return JSON.parse(rawText);
  } catch {
    throw new Error(`${context} did not return valid JSON.`);
  }
}

async function runRagCli(args = []) {
  const nodeProbe = await ensureNodeInstalled();
  const node = nodeProbe.nodePath;
  const nodeEnv = await envWithToolPath('node');
  return runCommand(node, ['rag/cli.js', ...args], { cwd: mcpServerDir, env: nodeEnv });
}

async function probeNodeInstallation() {
  try {
    const nodePath = await resolveToolPath('node');
    const result = await runCommand(nodePath, ['--version']);
    return {
      installed: true,
      nodePath,
      nodeVersion: result.stdout.trim(),
      error: null,
    };
  } catch (error) {
    return {
      installed: false,
      nodePath: null,
      nodeVersion: null,
      error: String(error.message || error),
    };
  }
}

async function ensureNodeInstalled() {
  const probe = await probeNodeInstallation();
  if (!probe.installed) {
    throw new Error(
      `Node.js is required but was not detected. Install Node.js and try again. Details: ${probe.error}`
    );
  }
  return probe;
}

async function detectInstalledApp(candidates = []) {
  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }
  return null;
}

async function probeCodexInstallation() {
  try {
    const codexPath = await resolveToolPath('codex');
    const result = await runCommand(codexPath, ['--version']);
    const version = (result.stdout || result.stderr || '').trim().split('\n').filter(Boolean).slice(-1)[0] || null;
    return {
      installed: true,
      codexPath,
      codexVersion: version,
      error: null,
    };
  } catch (error) {
    return {
      installed: false,
      codexPath: null,
      codexVersion: null,
      error: String(error.message || error),
    };
  }
}

async function runNodeInstallFlow() {
  const before = await probeNodeInstallation();
  if (before.installed) {
    sendLog(`Node.js already installed (${before.nodeVersion}).`);
    return {
      ok: true,
      alreadyInstalled: true,
      method: 'existing',
      nodeVersion: before.nodeVersion,
      nodePath: before.nodePath,
      downloadUrl: nodeDownloadUrl,
    };
  }

  try {
    sendLog(`Installing Node.js with nvm script bootstrap (${nvmReleaseBaseUrl})...`);
    const nvmInstallCommand = [
      'set -e',
      'export NVM_DIR="$HOME/.nvm"',
      'mkdir -p "$NVM_DIR"',
      '[ -s "$NVM_DIR/nvm.sh" ] || ('
        + 'curl -fsSL "' + nvmReleaseBaseUrl + '/nvm.sh" -o "$NVM_DIR/nvm.sh"'
        + ' && curl -fsSL "' + nvmReleaseBaseUrl + '/nvm-exec" -o "$NVM_DIR/nvm-exec"'
        + ' && chmod +x "$NVM_DIR/nvm-exec"'
        + ' && curl -fsSL "' + nvmReleaseBaseUrl + '/bash_completion" -o "$NVM_DIR/bash_completion"'
        + ')',
      "grep -q 'NVM_DIR=\"$HOME/.nvm\"' \"$HOME/.zshrc\" 2>/dev/null || printf '\\nexport NVM_DIR=\"$HOME/.nvm\"\\n[ -s \"$NVM_DIR/nvm.sh\" ] && . \"$NVM_DIR/nvm.sh\"\\n' >> \"$HOME/.zshrc\"",
      "grep -q 'NVM_DIR=\"$HOME/.nvm\"' \"$HOME/.bashrc\" 2>/dev/null || printf '\\nexport NVM_DIR=\"$HOME/.nvm\"\\n[ -s \"$NVM_DIR/nvm.sh\" ] && . \"$NVM_DIR/nvm.sh\"\\n' >> \"$HOME/.bashrc\"",
      '. "$NVM_DIR/nvm.sh"',
      `nvm install ${nvmNodeMajor}`,
      `nvm alias default ${nvmNodeMajor}`,
      'node -v',
      'npm -v',
    ].join(' && ');

    const nvmResult = await runLoginShell(nvmInstallCommand);
    if (nvmResult.stdout.trim()) {
      sendLog(`[nvm] ${nvmResult.stdout.trim().split('\n').slice(-2).join(' | ')}`);
    }

    delete toolPathCache.node;
    delete toolPathCache.npm;
    const after = await probeNodeInstallation();
    if (!after.installed) {
      throw new Error('nvm install completed, but node is still not available to the launcher.');
    }

    sendLog(`Node.js installed via nvm (${after.nodeVersion}).`);
    return {
      ok: true,
      alreadyInstalled: false,
      method: 'nvm',
      nodeVersion: after.nodeVersion,
      nodePath: after.nodePath,
      downloadUrl: nodeDownloadUrl,
    };
  } catch (error) {
    const message = String(error.message || error);
    const needsCommandLineTools = /xcode-select --install|Command Line Developer Tools/i.test(message);
    const friendlyMessage = needsCommandLineTools
      ? 'Xcode Command Line Tools are required before installing Node.js. Run `xcode-select --install`, complete setup, then retry.'
      : message;

    sendLog(`nvm Node.js install attempt failed: ${friendlyMessage}`);
    if (needsCommandLineTools) {
      sendLog('Open Terminal and run: xcode-select --install');
    }
    sendLog(`Node.js install failed. Manual download: ${nodeDownloadUrl}`);
    return {
      ok: false,
      alreadyInstalled: false,
      method: 'manual',
      nodeVersion: null,
      nodePath: null,
      downloadUrl: nodeDownloadUrl,
      error: friendlyMessage,
    };
  }
}

async function getRagStatus() {
  const status = {
    storePath: ragStorePath,
    present: false,
    sizeBytes: 0,
    filesIndexed: 0,
    chunksIndexed: 0,
    indexedAt: null,
    schemaVersion: null,
    sourcePatterns: [],
    error: null,
  };

  try {
    const [raw, stats] = await Promise.all([
      fs.readFile(ragStorePath, 'utf8'),
      fs.stat(ragStorePath),
    ]);

    const parsed = JSON.parse(raw);
    status.present = true;
    status.sizeBytes = stats.size;
    status.filesIndexed = Array.isArray(parsed.files) ? parsed.files.length : 0;
    status.chunksIndexed = Array.isArray(parsed.chunks) ? parsed.chunks.length : 0;
    status.indexedAt = parsed.generated_at || null;
    status.schemaVersion = parsed.schema_version ?? null;
    status.sourcePatterns = Array.isArray(parsed.source_patterns) ? parsed.source_patterns : [];
  } catch (error) {
    if (error.code !== 'ENOENT') {
      status.error = String(error.message || error);
    }
  }

  return status;
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

function upsertCodexServerConfig(originalContent, serverPath, nodePath) {
  const block = [
    '[mcp_servers.blender]',
    `command = ${tomlValue(nodePath)}`,
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
    throw new Error('Only temp directory files can be read.');
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
  const ragStatus = await getRagStatus();
  const claudeDesktopPath = await detectInstalledApp(claudeDesktopAppCandidates);
  const chatgptDesktopPath = await detectInstalledApp(chatgptDesktopAppCandidates);
  const codexProbe = await probeCodexInstallation();

  const status = {
    paths: {
      repoRoot,
      mcpServerEntrypoint,
      ragStorePath,
      addonSource,
      claudeConfigPath,
      codexConfigPath,
      blenderAppPath,
      blenderDownloadUrl,
      claudeDesktopDownloadUrl,
      codexInstallDocsUrl,
      chatgptDesktopDownloadUrl,
      backupRoot: getBackupRoot(),
    },
    checks: {
      nodeInstalled: false,
      blenderInstalled: false,
      mcpDependenciesInstalled: false,
      addonSourcePresent: false,
      addonInstalled: false,
      claudeDesktopInstalled: false,
      codexCliInstalled: false,
      chatgptDesktopInstalled: false,
      claudeConfigExists: false,
      codexConfigExists: false,
      serverRunning: Boolean(serverProcess),
      ragIndexPresent: false,
    },
    details: {
      claudeBackups: claudeBackups.length,
      codexBackups: codexBackups.length,
      ragChunksIndexed: ragStatus.chunksIndexed,
      ragFilesIndexed: ragStatus.filesIndexed,
      ragIndexedAt: ragStatus.indexedAt,
      ragStoreSizeBytes: ragStatus.sizeBytes,
      ragStoreSchemaVersion: ragStatus.schemaVersion,
      ragStoreError: ragStatus.error,
      claudeDesktopPath,
      chatgptDesktopPath,
      codexPath: codexProbe.codexPath,
      codexVersion: codexProbe.codexVersion,
      codexInstallError: codexProbe.error,
    },
  };

  const nodeProbe = await probeNodeInstallation();
  status.checks.nodeInstalled = nodeProbe.installed;
  status.details.nodeVersion = nodeProbe.installed
    ? nodeProbe.nodeVersion
    : `Not installed (${nodeProbe.error})`;

  status.checks.blenderInstalled = await fileExists(blenderAppPath);
  status.checks.claudeDesktopInstalled = Boolean(claudeDesktopPath);
  status.checks.codexCliInstalled = codexProbe.installed;
  status.checks.chatgptDesktopInstalled = Boolean(chatgptDesktopPath);
  status.checks.mcpDependenciesInstalled = await fileExists(path.join(mcpServerDir, 'node_modules'));
  status.checks.addonSourcePresent = await fileExists(addonSource);
  status.checks.claudeConfigExists = await fileExists(claudeConfigPath);
  status.checks.codexConfigExists = await fileExists(codexConfigPath);
  status.checks.ragIndexPresent = ragStatus.present;

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
ipcMain.handle('rag:status', async () => getRagStatus());

ipcMain.handle('setup:install-deps', async () => {
  await ensureNodeInstalled();
  sendLog('Installing MCP server dependencies (npm install)...');
  const npm = await resolveToolPath('npm');
  const npmEnv = await envWithToolPath('npm');
  const result = await runCommand(npm, ['install'], { cwd: mcpServerDir, env: npmEnv });
  sendLog('Dependencies installed.');
  return result.stdout || 'Dependencies installed.';
});

ipcMain.handle('setup:install-node', async () => {
  if (nodeInstallJob) {
    return { started: false, alreadyRunning: true };
  }

  nodeInstallJob = (async () => {
    sendNodeInstallState({ installing: true, error: null, result: null });
    try {
      const result = await runNodeInstallFlow();
      sendNodeInstallState({
        installing: false,
        error: result.ok ? null : result.error || 'Node install failed.',
        result,
      });
      if (result.ok) {
        autoInstallDeps().catch((err) =>
          sendLog(`Auto dependency install after Node setup failed: ${String(err.message || err)}`)
        );
      }
    } catch (error) {
      const message = String(error.message || error);
      sendLog(`Node.js install job failed unexpectedly: ${message}`);
      sendNodeInstallState({
        installing: false,
        error: message,
        result: {
          ok: false,
          alreadyInstalled: false,
          method: 'manual',
          nodeVersion: null,
          nodePath: null,
          downloadUrl: nodeDownloadUrl,
          error: message,
        },
      });
    } finally {
      nodeInstallJob = null;
    }
  })();

  return { started: true, alreadyRunning: false };
});

ipcMain.handle('setup:install-codex-cli', async () => {
  const before = await probeCodexInstallation();
  if (before.installed) {
    sendLog(`Codex CLI already installed (${before.codexVersion || 'version unknown'}).`);
    return {
      ok: true,
      alreadyInstalled: true,
      method: 'existing',
      codexPath: before.codexPath,
      codexVersion: before.codexVersion,
      docsUrl: codexInstallDocsUrl,
      packageName: codexNpmPackage,
    };
  }

  try {
    await ensureNodeInstalled();
    const npm = await resolveToolPath('npm');
    const npmEnv = await envWithToolPath('npm');
    sendLog(`Installing Codex CLI with npm (${codexNpmPackage})...`);
    await runCommand(npm, ['install', '-g', codexNpmPackage], { env: npmEnv });

    delete toolPathCache.codex;
    const after = await probeCodexInstallation();
    if (!after.installed) {
      throw new Error('npm install completed, but codex command is still not available.');
    }

    sendLog(`Codex CLI installed (${after.codexVersion || 'version unknown'}).`);
    return {
      ok: true,
      alreadyInstalled: false,
      method: 'npm',
      codexPath: after.codexPath,
      codexVersion: after.codexVersion,
      docsUrl: codexInstallDocsUrl,
      packageName: codexNpmPackage,
    };
  } catch (error) {
    const message = String(error.message || error);
    sendLog(`Automatic Codex CLI install failed: ${message}`);
    try {
      await shell.openExternal(codexInstallDocsUrl);
      sendLog(`Opened Codex install docs: ${codexInstallDocsUrl}`);
    } catch (openError) {
      sendLog(`Failed to open Codex docs: ${String(openError.message || openError)}`);
    }
    return {
      ok: false,
      alreadyInstalled: false,
      method: 'manual',
      codexPath: null,
      codexVersion: null,
      docsUrl: codexInstallDocsUrl,
      packageName: codexNpmPackage,
      error: message,
    };
  }
});

ipcMain.handle('rag:index', async () => {
  sendLog('Building local RAG index...');
  const result = await runRagCli(['index', '--json']);
  const parsed = parseJsonOutput(result.stdout, 'rag:index');
  const ragStatus = await getRagStatus();
  sendLog(
    `RAG index complete (${parsed.files_indexed || ragStatus.filesIndexed} file(s), ${parsed.chunks_indexed || ragStatus.chunksIndexed} chunk(s)).`
  );
  return {
    indexResult: parsed,
    ragStatus,
  };
});

ipcMain.handle('rag:query', async (_event, options = {}) => {
  const query = String(options.query || '').trim();
  if (!query) {
    throw new Error('Query text is required.');
  }

  const requestedTopK = Number(options.topK);
  const topK = Number.isFinite(requestedTopK)
    ? Math.max(1, Math.min(20, Math.floor(requestedTopK)))
    : 5;

  sendLog(`Running RAG query (top_k=${topK}): ${query}`);
  const result = await runRagCli(['query', query, '--top-k', String(topK), '--json']);
  const parsed = parseJsonOutput(result.stdout, 'rag:query');
  sendLog(`RAG query complete (${Array.isArray(parsed.results) ? parsed.results.length : 0} result(s)).`);
  return parsed;
});

ipcMain.handle('setup:install-addon', async () => {
  const addonTarget = await detectBlenderAddonTarget();
  await fs.mkdir(addonTarget, { recursive: true });
  const targetFile = path.join(addonTarget, 'claude_modeling_tools.py');
  await fs.copyFile(addonSource, targetFile);
  sendLog(`Addon installed: ${targetFile}`);
  return targetFile;
});

ipcMain.handle('setup:install-assistant-packs', async () => {
  const codex = await installCodexSkillsFromPack();
  const claudeSkills = await installClaudeSkillsFromPack();
  const claudeLocalAgent = await installClaudeSkillsToLocalAgentSessionsFromPack();
  const claudeSubAgents = await installClaudeSubAgentsFromPack();

  if (!codex.installed && !claudeSkills.installed && !claudeSubAgents.installed && !claudeLocalAgent.totalCopies) {
    throw new Error('No assistant templates were installed.');
  }

  sendLog(
    `Assistant packs installed (Codex skills: ${codex.installed}, Claude skills: ${claudeSkills.installed}, Claude local-agent copies: ${claudeLocalAgent.totalCopies}, local-agent manifests updated: ${claudeLocalAgent.manifestsUpdated}, Claude sub-agents: ${claudeSubAgents.installed}).`
  );

  return {
    codex,
    claudeSkills,
    claudeLocalAgent,
    claudeSubAgents,
  };
});

ipcMain.handle('setup:export-claude-skills-zip', async () => {
  const result = await exportClaudeSkillsZipFromPack();
  sendLog(`Claude skills ZIP exported: ${result.zipPath} (${result.skillsIncluded} skill(s))`);
  return result;
});

ipcMain.handle('app:launch-blender', async () => {
  if (!(await fileExists(blenderAppPath))) {
    throw new Error(`Blender not found at ${blenderAppPath}`);
  }

  const openError = await shell.openPath(blenderAppPath);
  if (openError) {
    throw new Error(`Failed to launch Blender: ${openError}`);
  }
  sendLog('Blender launched.');
  return { launched: true, blenderAppPath };
});

ipcMain.handle('app:open-blender-download', async () => {
  await shell.openExternal(blenderDownloadUrl);
  sendLog(`Opened Blender download page: ${blenderDownloadUrl}`);
  return { opened: true, url: blenderDownloadUrl };
});

ipcMain.handle('app:open-claude-download', async () => {
  await shell.openExternal(claudeDesktopDownloadUrl);
  sendLog(`Opened Claude Desktop download page: ${claudeDesktopDownloadUrl}`);
  return { opened: true, url: claudeDesktopDownloadUrl };
});

ipcMain.handle('app:open-chatgpt-download', async () => {
  await shell.openExternal(chatgptDesktopDownloadUrl);
  sendLog(`Opened ChatGPT desktop download page: ${chatgptDesktopDownloadUrl}`);
  return { opened: true, url: chatgptDesktopDownloadUrl };
});

ipcMain.handle('app:open-codex-install-docs', async () => {
  await shell.openExternal(codexInstallDocsUrl);
  sendLog(`Opened Codex install docs: ${codexInstallDocsUrl}`);
  return { opened: true, url: codexInstallDocsUrl };
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

  const nodeProbe = await ensureNodeInstalled();
  const node = nodeProbe.nodePath;
  config.mcpServers.blender = {
    command: node,
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

  const nodeProbe = await ensureNodeInstalled();
  const node = nodeProbe.nodePath;
  const updated = upsertCodexServerConfig(original, mcpServerEntrypoint, node);
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

  const nodeProbe = await ensureNodeInstalled();
  const node = nodeProbe.nodePath;
  const nodeEnv = await envWithToolPath('node');
  serverProcess = spawn(node, [mcpServerEntrypoint], {
    cwd: mcpServerDir,
    env: { ...nodeEnv, ...env },
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
