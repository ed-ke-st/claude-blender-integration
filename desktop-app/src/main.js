const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { spawn } = require('child_process');
const fsSync = require('fs');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { pathToFileURL } = require('url');

const isWindows = process.platform === 'win32';
const repoRoot = path.resolve(__dirname, '../..');
const mcpServerDir = path.join(repoRoot, 'mcp-server');
const mcpServerEntrypoint = path.join(mcpServerDir, 'index.js');
const ragStorePath = path.join(repoRoot, '.rag', 'vector-store.json');
const addonSource = path.join(repoRoot, 'blender-addon', 'claude_modeling_tools.py');
const assistantPacksRepoDir = path.join(repoRoot, 'assistant-packs');
const assistantPacksResourceDir = path.join(process.resourcesPath || '', 'assistant-packs');

const windowsRoamingAppData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const windowsLocalAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
const windowsProgramFiles = process.env.ProgramFiles || 'C:\\Program Files';
const windowsProgramFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

const claudeConfigPath = isWindows
  ? path.join(windowsRoamingAppData, 'Claude', 'claude_desktop_config.json')
  : path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
const codexConfigPath = path.join(os.homedir(), '.codex', 'config.toml');
const claudeLocalAgentSkillsPluginRoot = isWindows
  ? path.join(windowsRoamingAppData, 'Claude', 'local-agent-mode-sessions', 'skills-plugin')
  : path.join(
    os.homedir(),
    'Library',
    'Application Support',
    'Claude',
    'local-agent-mode-sessions',
    'skills-plugin'
  );
const blenderScriptsRoot = isWindows
  ? path.join(windowsRoamingAppData, 'Blender Foundation', 'Blender')
  : path.join(os.homedir(), 'Library', 'Application Support', 'Blender');

const blenderWindowsVersionCandidates = ['5.0', '4.5', '4.4', '4.3', '4.2', '4.1', '4.0'];
const blenderWindowsInstallRoots = [
  path.join(windowsProgramFiles, 'Blender Foundation'),
  path.join(windowsProgramFilesX86, 'Blender Foundation'),
  path.join(windowsLocalAppData, 'Programs', 'Blender Foundation'),
];
const blenderWindowsAppCandidates = [];
for (const root of blenderWindowsInstallRoots) {
  blenderWindowsAppCandidates.push(path.join(root, 'Blender', 'blender.exe'));
  for (const version of blenderWindowsVersionCandidates) {
    blenderWindowsAppCandidates.push(path.join(root, `Blender ${version}`, 'blender.exe'));
  }
}

const blenderAppCandidates = isWindows
  ? blenderWindowsAppCandidates
  : ['/Applications/Blender.app'];
const blenderAppPath = blenderAppCandidates[0];
const blenderDownloadUrl = 'https://www.blender.org/download/';
const claudeDesktopDownloadUrl = 'https://claude.ai/download';
const codexInstallDocsUrl = 'https://github.com/openai/codex#installation';
const codexNpmPackage = '@openai/codex';
const chatgptDesktopDownloadUrl = 'https://openai.com/chatgpt/desktop/';
const claudeDesktopAppCandidates = isWindows
  ? [
    path.join(windowsLocalAppData, 'Programs', 'Claude', 'Claude.exe'),
    path.join(windowsProgramFiles, 'Claude', 'Claude.exe'),
    path.join(windowsProgramFilesX86, 'Claude', 'Claude.exe'),
  ]
  : [
    '/Applications/Claude.app',
    '/Applications/Claude Desktop.app',
  ];
const chatgptDesktopAppCandidates = isWindows
  ? [
    path.join(windowsLocalAppData, 'Programs', 'ChatGPT', 'ChatGPT.exe'),
    path.join(windowsProgramFiles, 'ChatGPT', 'ChatGPT.exe'),
    path.join(windowsProgramFilesX86, 'ChatGPT', 'ChatGPT.exe'),
  ]
  : ['/Applications/ChatGPT.app'];
// Use the OS per-user temp dir — avoids EACCES collisions when multiple macOS
// users run the app (sticky bit on /tmp prevents cross-user file writes).
const tmpRoot = os.tmpdir();
const tmpReadLimitBytes = 300 * 1024;
const blenderClaudeWatchFile = path.join(tmpRoot, 'blender_claude_execute.py');
const blenderResultFile = path.join(tmpRoot, 'blender_result.json');
const nodeDownloadUrl = 'https://nodejs.org/en/download';
const nvmReleaseBaseUrl = 'https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4';
const nvmNodeMajor = '24';
const wingetNodePackageId = 'OpenJS.NodeJS.LTS';

let mainWindow = null;
let serverProcess = null;
let nodeInstallJob = null;
const appDisplayName = 'Blender MCP Launcher';

// Electron only inherits the minimal system PATH (/usr/bin:/bin etc.), so npm/node
// installed via NVM, Homebrew, or other managers won't be found with shell: false.
// Resolve the real path once by asking a login shell, then cache it.
const toolPathCache = {};

async function runLoginShell(command, options = {}) {
  if (isWindows) {
    throw new Error('Login shell execution is not supported on Windows.');
  }

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

  if (isWindows) {
    try {
      const whereResult = await runCommand('where.exe', [tool]);
      const whereCandidates = (whereResult.stdout || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      for (const candidate of whereCandidates) {
        if (fsSync.existsSync(candidate)) {
          toolPathCache[tool] = candidate;
          return candidate;
        }
      }
    } catch {
      // Fall through to known locations.
    }
  }

  if (!isWindows && (tool === 'node' || tool === 'npm' || tool === 'codex' || tool === 'claude')) {
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

  if (!isWindows) {
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
  }

  // Fall back to common install locations
  const fallbacks = isWindows
    ? {
      npm: [
        path.join(windowsProgramFiles, 'nodejs', 'npm.cmd'),
        path.join(windowsProgramFilesX86, 'nodejs', 'npm.cmd'),
        path.join(windowsLocalAppData, 'Programs', 'nodejs', 'npm.cmd'),
      ],
      node: [
        path.join(windowsProgramFiles, 'nodejs', 'node.exe'),
        path.join(windowsProgramFilesX86, 'nodejs', 'node.exe'),
        path.join(windowsLocalAppData, 'Programs', 'nodejs', 'node.exe'),
      ],
      codex: [
        path.join(windowsRoamingAppData, 'npm', 'codex.cmd'),
        path.join(windowsProgramFiles, 'nodejs', 'codex.cmd'),
      ],
      claude: [
        path.join(windowsRoamingAppData, 'npm', 'claude.cmd'),
        path.join(os.homedir(), '.local', 'bin', 'claude'),
      ],
      winget: ['C:\\Windows\\System32\\winget.exe'],
    }
    : {
      npm: ['/opt/homebrew/bin/npm', '/usr/local/bin/npm', '/usr/bin/npm'],
      node: ['/opt/homebrew/bin/node', '/usr/local/bin/node', '/usr/bin/node'],
      codex: ['/opt/homebrew/bin/codex', '/usr/local/bin/codex', '/usr/bin/codex'],
      claude: [path.join(os.homedir(), '.local', 'bin', 'claude'), '/opt/homebrew/bin/claude', '/usr/local/bin/claude', '/usr/bin/claude'],
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

// Build an env that prepends resolved tool bin directories to PATH so that
// npm-installed CLIs and their shebangs can find sibling binaries even when
// Electron's inherited PATH is minimal.
async function envWithToolPath(tool, companionTools = []) {
  const requestedTools = [tool, ...companionTools];
  const resolvedTools = await Promise.all(requestedTools.map(resolveToolPath));
  const binDirs = resolvedTools
    .filter((resolved, index) => resolved !== requestedTools[index])
    .map((resolved) => path.dirname(resolved))
    .filter((binDir, index, all) => all.indexOf(binDir) === index);
  const base = process.env.PATH || '';
  const segments = base.split(path.delimiter);
  const missingSegments = binDirs.filter((binDir) => !segments.includes(binDir));
  const augmented = missingSegments.length
    ? `${missingSegments.join(path.delimiter)}${path.delimiter}${base}`
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

function sendAgentRunProgress(requestId, type, message, extra = {}) {
  if (!requestId || !mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('agent-run-progress', {
    requestId,
    type,
    message: String(message || ''),
    timestamp: new Date().toISOString(),
    ...extra,
  });
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

    if (isWindows) {
      const windowsZipPath = zipPath.replace(/\//g, '\\');
      await runCommand(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `Compress-Archive -Path 'claude-skills' -DestinationPath '${windowsZipPath.replace(/'/g, "''")}' -Force`,
        ],
        { cwd: stagingRoot }
      );
    } else {
      const zip = await resolveToolPath('zip');
      await runCommand(zip, ['-r', zipPath, 'claude-skills'], { cwd: stagingRoot });
    }

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
    const npmNeedsShell = isWindows && /\.(cmd|bat)$/i.test(npm);
    await new Promise((resolve, reject) => {
      const child = spawn(npm, ['install'], {
        cwd: mcpServerDir,
        env: npmEnv,
        shell: npmNeedsShell,
      });
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

function loadMcpServerModule(relativePath) {
  return import(pathToFileURL(path.join(mcpServerDir, relativePath)).href);
}

function normalizePromptTopK(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 5;
  }
  return Math.max(1, Math.min(8, Math.floor(parsed)));
}

function normalizePromptProvider(value) {
  return value === 'gemini' ? 'gemini' : 'openai';
}

function normalizeCodexSandbox(value) {
  return ['read-only', 'workspace-write', 'danger-full-access'].includes(value)
    ? value
    : 'workspace-write';
}

function normalizeCodexApproval(value) {
  return ['untrusted', 'on-request', 'never'].includes(value)
    ? value
    : 'never';
}

function normalizeClaudePermissionMode(value) {
  return ['acceptEdits', 'auto', 'bypassPermissions', 'default', 'dontAsk', 'plan'].includes(value)
    ? value
    : 'acceptEdits';
}

function blenderClaudeAllowedTools() {
  return [
    'mcp__blender__create_in_blender',
    'mcp__blender__get_blender_result',
    'mcp__blender__debug_blender_error',
    'mcp__blender__retrieve_context',
  ];
}

function defaultPromptModel(provider) {
  return provider === 'gemini' ? 'gemini-2.5-flash' : 'gpt-4.1-mini';
}

function formatRetrievedChunksForPrompt(result) {
  if (!result || !Array.isArray(result.results) || result.results.length === 0) {
    return '';
  }

  return [
    'Repository context:',
    ...result.results.map((item, index) => (
      `[${index + 1}] ${item.file_path}:${item.start_line}-${item.end_line}\n${item.chunk_text || item.excerpt || ''}`
    )),
  ].join('\n\n');
}

function normalizePromptHistory(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      const prompt = String(entry?.prompt || '').trim();
      const summary = String(entry?.summary || '').trim();
      const provider = String(entry?.provider || '').trim() || 'openai';
      const model = String(entry?.model || '').trim();
      const timestamp = String(entry?.timestamp || '').trim();

      if (!prompt && !summary) {
        return null;
      }

      return {
        prompt,
        summary,
        provider,
        model,
        timestamp,
      };
    })
    .filter(Boolean)
    .slice(-6);
}

function formatConversationHistoryForPrompt(history) {
  if (!Array.isArray(history) || history.length === 0) {
    return '';
  }

  return history.map((entry, index) => {
    const lines = [
      `[${index + 1}] User request: ${entry.prompt || '(missing prompt)'}`,
    ];

    if (entry.summary) {
      lines.push(`Outcome:\n${entry.summary}`);
    }

    if (entry.provider || entry.model) {
      lines.push(`Provider/model: ${entry.provider}${entry.model ? ` / ${entry.model}` : ''}`);
    }

    if (entry.timestamp) {
      lines.push(`Timestamp: ${entry.timestamp}`);
    }

    return lines.join('\n');
  }).join('\n\n');
}

function formatNumberList(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return '(unknown)';
  }

  return values.map((value) => (
    Number.isFinite(value) ? Number(value).toFixed(4).replace(/\.?0+$/, '') : String(value)
  )).join(', ');
}

function formatSceneObjectForPrompt(object, index) {
  const name = String(object?.name || `Object ${index + 1}`);
  const type = String(object?.type || 'UNKNOWN');
  const parts = [`${index + 1}. ${name} (${type})`];

  if (Array.isArray(object?.location)) {
    parts.push(`location=[${formatNumberList(object.location)}]`);
  }
  if (Array.isArray(object?.dimensions)) {
    parts.push(`dimensions=[${formatNumberList(object.dimensions)}]`);
  }
  if (Number.isFinite(object?.vertices)) {
    parts.push(`verts=${object.vertices}`);
  }
  if (Number.isFinite(object?.faces)) {
    parts.push(`faces=${object.faces}`);
  }

  return parts.join(', ');
}

function formatSceneSnapshotForPrompt(snapshot) {
  const result = snapshot?.result;
  if (!result || typeof result !== 'object') {
    return '';
  }

  const sceneObjects = Array.isArray(result.scene_objects) ? result.scene_objects : [];
  const collections = Array.isArray(result.collections) ? result.collections : [];
  const sceneConventions = result.scene_conventions || {};
  const visibleObjects = sceneObjects.slice(0, 20);
  const lines = [
    `Scene status: ${result.status || 'unknown'}`,
    `Scene object count: ${sceneObjects.length}`,
    `Collections: ${collections.length ? collections.slice(0, 12).join(', ') : '(none)'}`,
  ];

  if (collections.length > 12) {
    lines.push(`Additional collections omitted: ${collections.length - 12}`);
  }

  if (sceneConventions && typeof sceneConventions === 'object') {
    lines.push(
      `Scene conventions: up=${sceneConventions.up_axis || '?'}, forward=${sceneConventions.forward_axis || '?'}, right=${sceneConventions.right_axis || '?'}, units=${sceneConventions.units || '?'}, scale=${sceneConventions.unit_scale ?? '?'}`
    );
  }

  if (visibleObjects.length > 0) {
    lines.push('Objects:');
    lines.push(...visibleObjects.map((object, index) => formatSceneObjectForPrompt(object, index)));
  } else {
    lines.push('Objects: (scene is empty)');
  }

  if (sceneObjects.length > visibleObjects.length) {
    lines.push(`Additional objects omitted: ${sceneObjects.length - visibleObjects.length}`);
  }

  return lines.join('\n');
}

function normalizeAgentMaxAttempts(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 3;
  }
  return Math.max(1, Math.min(4, Math.floor(parsed)));
}

function summarizeBlenderResultForAttempt(result) {
  if (!result || typeof result !== 'object') {
    return 'Blender result payload was not available.';
  }

  const createdObjects = Array.isArray(result.objects_created) ? result.objects_created : [];
  const sceneObjects = Array.isArray(result.scene_objects) ? result.scene_objects : [];
  return [
    `Blender status: ${result.status || 'unknown'}`,
    result.message ? `Message: ${result.message}` : null,
    result.error ? `Error: ${result.error}` : null,
    createdObjects.length ? `Objects created: ${createdObjects.join(', ')}` : null,
    `Scene objects reported: ${sceneObjects.length}`,
  ].filter(Boolean).join('\n');
}

function formatAttemptTraceForPrompt(attempts) {
  if (!Array.isArray(attempts) || attempts.length === 0) {
    return '';
  }

  return attempts.map((attempt) => [
    `ATTEMPT ${attempt.attempt}/${attempt.maxAttempts}: ${attempt.status}`,
    attempt.message ? `Message: ${attempt.message}` : null,
    Array.isArray(attempt.validationErrors) && attempt.validationErrors.length
      ? `Validation errors:\n- ${attempt.validationErrors.join('\n- ')}`
      : null,
    attempt.blenderSummary || null,
  ].filter(Boolean).join('\n')).join('\n\n');
}

function buildAttemptContext({ userContext = '', attemptNumber, maxAttempts, attempts = [] }) {
  const parts = [];

  if (userContext) {
    parts.push(userContext);
  }

  parts.push(
    `Agent loop mode is enabled. You are generating attempt ${attemptNumber} of ${maxAttempts}. Return a complete Blender Python script for this attempt.`
  );

  if (attempts.length > 0) {
    parts.push(`Previous tool results:\n${formatAttemptTraceForPrompt(attempts)}`);
    parts.push('Fix the exact failure from the previous attempt. Do not repeat the same broken approach.');
  }

  return parts.join('\n\n');
}

function buildAttemptTraceEntry({
  attemptNumber,
  maxAttempts,
  stage = 'execution',
  execution = null,
  error = null,
} = {}) {
  const validationErrors = Array.isArray(error?.validationErrors) ? error.validationErrors : [];
  const pending = Boolean(execution?.pending);
  const blenderResult = execution?.result || null;
  const blenderStatus = pending ? 'pending' : String(blenderResult?.status || '');
  const status = error
    ? (stage === 'generation'
      ? 'generation_error'
      : (validationErrors.length ? 'validation_error' : 'execution_error'))
    : (pending ? 'pending' : (blenderStatus || 'unknown'));
  const message = error
    ? String(error.message || error)
    : String(blenderResult?.error || blenderResult?.message || '');

  return {
    attempt: attemptNumber,
    maxAttempts,
    stage,
    status,
    message,
    requestId: execution?.requestId || '',
    pending,
    validationErrors,
    blenderStatus,
    blenderSummary: pending
      ? 'Blender result is pending.'
      : summarizeBlenderResultForAttempt(blenderResult),
  };
}

async function runInAppPrompt(options = {}) {
  const progressRequestId = String(options.requestId || '').trim();
  const progress = (type, message, extra) => sendAgentRunProgress(progressRequestId, type, message, extra);
  const provider = normalizePromptProvider(options.provider);
  const prompt = String(options.prompt || '').trim();
  const userContext = String(options.context || '').trim();
  const apiKey = String(
    options.apiKey || (provider === 'gemini' ? process.env.GEMINI_API_KEY : process.env.OPENAI_API_KEY) || ''
  ).trim();
  const useRag = Boolean(options.useRag);
  const useHistory = options.useHistory !== false;
  const useSceneSnapshot = options.useSceneSnapshot !== false;
  const agentMode = Boolean(options.agentMode);
  const maxAttempts = agentMode ? normalizeAgentMaxAttempts(options.maxAttempts) : 1;
  const model = String(options.model || '').trim() || defaultPromptModel(provider);
  const conversationHistory = useHistory ? normalizePromptHistory(options.history) : [];

  if (!prompt) {
    throw new Error('Prompt text is required.');
  }

  if (!apiKey) {
    throw new Error(provider === 'gemini'
      ? 'Gemini API key is required for in-app prompting.'
      : 'OpenAI API key is required for in-app prompting.');
  }

  if (!(await fileExists(path.join(mcpServerDir, 'node_modules')))) {
    throw new Error('MCP server dependencies are not installed yet. Run "Install MCP Dependencies" first.');
  }

  progress('status', 'Preparing direct Blender prompt run.');

  let ragResult = null;
  let ragContext = '';
  let ragWarning = '';
  let sceneSnapshot = null;
  let sceneSnapshotContext = '';
  let sceneWarning = '';
  if (useRag) {
    progress('status', 'Retrieving local RAG context.');
    if (await fileExists(ragStorePath)) {
      const queryText = [prompt, userContext].filter(Boolean).join('\n\n');
      const { retrieveContext } = await loadMcpServerModule(path.join('rag', 'retriever.js'));
      ragResult = await retrieveContext({
        query: queryText,
        topK: normalizePromptTopK(options.ragTopK),
        repoRoot,
      });
      ragContext = formatRetrievedChunksForPrompt(ragResult);
      progress('status', `Retrieved ${Array.isArray(ragResult?.results) ? ragResult.results.length : 0} RAG match(es).`);
    } else {
      ragWarning = `Local RAG index not found at ${ragStorePath}. Build the index from the launcher to include repository context.`;
      sendLog(`In-app prompt RAG skipped: ${ragWarning}`);
      progress('warning', 'RAG skipped because no local index was found.');
    }
  }

  if (useSceneSnapshot) {
    try {
      progress('status', 'Collecting live Blender scene snapshot.');
      sceneSnapshot = await fetchLiveSceneSnapshot();
      sceneSnapshotContext = formatSceneSnapshotForPrompt(sceneSnapshot);
      progress('status', `Scene snapshot collected (${Array.isArray(sceneSnapshot?.result?.scene_objects) ? sceneSnapshot.result.scene_objects.length : 0} object(s)).`);
    } catch (error) {
      sceneWarning = `Live Blender scene snapshot failed: ${String(error.message || error)}`;
      sendLog(`In-app prompt scene snapshot skipped: ${sceneWarning}`);
      progress('warning', 'Scene snapshot skipped; Blender did not return a live snapshot.');
    }
  }

  const historyContext = formatConversationHistoryForPrompt(conversationHistory);

  sendLog(`In-app prompt started (provider=${provider}, model=${model}, rag=${useRag ? 'on' : 'off'}, history=${conversationHistory.length}, snapshot=${useSceneSnapshot ? 'on' : 'off'}, agent=${agentMode ? `on/${maxAttempts}` : 'off'}).`);

  const generationModule = provider === 'gemini'
    ? 'gemini-generation.js'
    : 'openai-generation.js';
  const { generateCode } = await loadMcpServerModule(generationModule);
  const { executeCreateInBlender } = await loadMcpServerModule('blender-exec.js');
  const attempts = [];
  let code = '';
  let execution = null;
  let failureMessage = '';
  let agentOutcome = agentMode ? 'pending' : 'single_pass';

  for (let attemptNumber = 1; attemptNumber <= maxAttempts; attemptNumber += 1) {
    const attemptContext = agentMode
      ? buildAttemptContext({
        userContext,
        attemptNumber,
        maxAttempts,
        attempts,
      })
      : userContext;

    sendLog(`In-app prompt attempt ${attemptNumber}/${maxAttempts}: generating Blender code.`);
    progress('status', `Attempt ${attemptNumber}/${maxAttempts}: generating Blender Python.`);

    try {
      code = await generateCode({
        description: prompt,
        context: attemptContext,
        conversationHistory: historyContext,
        sceneSnapshot: sceneSnapshotContext,
        ragContext,
        model,
        apiKey,
      });
    } catch (error) {
      const attemptEntry = buildAttemptTraceEntry({
        attemptNumber,
        maxAttempts,
        stage: 'generation',
        error,
      });
      attempts.push(attemptEntry);
      failureMessage = attemptEntry.message;
      sendLog(`In-app prompt attempt ${attemptNumber}/${maxAttempts} generation failed: ${attemptEntry.message}`);
      progress('error', `Attempt ${attemptNumber}/${maxAttempts}: generation failed.`);
      if (!agentMode || attemptNumber === maxAttempts) {
        if (!agentMode) {
          throw error;
        }
        agentOutcome = attemptEntry.status;
        break;
      }
      continue;
    }

    sendLog(`In-app prompt attempt ${attemptNumber}/${maxAttempts}: executing in Blender.`);
    progress('status', `Attempt ${attemptNumber}/${maxAttempts}: executing in Blender.`);

    try {
      execution = await executeCreateInBlender({
        code,
        watchFilePath: blenderClaudeWatchFile,
      });
      const attemptEntry = buildAttemptTraceEntry({
        attemptNumber,
        maxAttempts,
        stage: 'execution',
        execution,
      });
      attempts.push(attemptEntry);

      const blenderStatus = execution.pending ? 'pending' : String(execution.result?.status || '');
      sendLog(`In-app prompt attempt ${attemptNumber}/${maxAttempts} completed with ${attemptEntry.status}.`);
      progress(
        execution.pending || blenderStatus === 'success' ? 'success' : 'warning',
        `Attempt ${attemptNumber}/${maxAttempts}: Blender returned ${attemptEntry.status}.`
      );

      if (execution.pending || blenderStatus === 'success') {
        agentOutcome = execution.pending ? 'pending' : 'success';
        break;
      }

      failureMessage = attemptEntry.message || attemptEntry.blenderSummary;
      agentOutcome = blenderStatus || 'execution_error';

      if (useSceneSnapshot) {
        if (execution.result) {
          sceneSnapshotContext = formatSceneSnapshotForPrompt({ result: execution.result });
        } else {
          try {
            sceneSnapshot = await fetchLiveSceneSnapshot();
            sceneSnapshotContext = formatSceneSnapshotForPrompt(sceneSnapshot);
            progress('status', 'Updated scene snapshot after Blender feedback.');
          } catch (error) {
            sceneWarning = `Live Blender scene snapshot failed: ${String(error.message || error)}`;
            sendLog(`In-app prompt scene snapshot skipped: ${sceneWarning}`);
            progress('warning', 'Could not update scene snapshot after Blender feedback.');
          }
        }
      }
    } catch (error) {
      const attemptEntry = buildAttemptTraceEntry({
        attemptNumber,
        maxAttempts,
        stage: 'execution',
        error,
      });
      attempts.push(attemptEntry);
      failureMessage = attemptEntry.message;
      sendLog(`In-app prompt attempt ${attemptNumber}/${maxAttempts} execution failed: ${attemptEntry.message}`);
      progress('error', `Attempt ${attemptNumber}/${maxAttempts}: execution failed.`);
      if (!agentMode || attemptNumber === maxAttempts) {
        if (!agentMode) {
          throw error;
        }
        agentOutcome = attemptEntry.status;
        break;
      }
      continue;
    }
  }

  const finalExecution = execution;
  const finalBlenderResult = finalExecution?.result || null;
  const finalBlenderResultText = finalExecution?.resultText || (failureMessage ? `${failureMessage}\n` : '');
  const finalRequestId = finalExecution?.requestId || '';
  const finalWatchFilePath = finalExecution?.watchFilePath || blenderClaudeWatchFile;

  if (agentMode && finalExecution && !finalExecution.pending && finalExecution.result?.status !== 'success' && attempts.length >= maxAttempts) {
    agentOutcome = 'exhausted';
  }

  if (agentMode && !finalExecution && !failureMessage) {
    failureMessage = 'Agent loop finished without producing a Blender execution result.';
  }

  sendLog(
    `In-app prompt finished (provider=${provider}, request_id=${finalRequestId || 'n/a'}, blender_result=${finalExecution?.pending ? 'pending' : (finalBlenderResult?.status || agentOutcome)}).`
  );
  progress('done', `Direct Blender prompt finished with ${finalExecution?.pending ? 'pending result' : (finalBlenderResult?.status || agentOutcome)}.`);

  return {
    provider,
    prompt,
    model,
    code,
    contextUsed: userContext,
    ragResult,
    ragWarning,
    historyCount: conversationHistory.length,
    sceneObjectCount: Array.isArray(sceneSnapshot?.result?.scene_objects) ? sceneSnapshot.result.scene_objects.length : 0,
    sceneSnapshotUsed: Boolean(sceneSnapshotContext),
    sceneWarning,
    agentMode,
    maxAttempts,
    agentOutcome,
    attempts,
    failureMessage,
    requestId: finalRequestId,
    watchFilePath: finalWatchFilePath,
    pending: Boolean(finalExecution?.pending),
    blenderResult: finalBlenderResult || (failureMessage
      ? { status: 'error', error: failureMessage, message: failureMessage }
      : null),
    blenderResultText: finalBlenderResultText,
  };
}

function buildCodexAgentPrompt({
  prompt,
  userContext,
  historyContext,
}) {
  return [
    'You are running from Blender MCP Launcher as a non-interactive Codex CLI agent.',
    'Use the local repository and configured MCP tools when they are relevant. If the user asks to create or modify Blender content, prefer the configured Blender MCP tools instead of only describing the work.',
    'Keep the final response concise and include the important files, commands, or Blender result details.',
    historyContext ? `Conversation history:\n${historyContext}` : '',
    userContext ? `Extra context:\n${userContext}` : '',
    `User request:\n${prompt}`,
  ].filter(Boolean).join('\n\n');
}

async function runCodexAgentPrompt(options = {}) {
  const progressRequestId = String(options.requestId || '').trim();
  const progress = (type, message, extra) => sendAgentRunProgress(progressRequestId, type, message, extra);
  const prompt = String(options.prompt || '').trim();
  const userContext = String(options.context || '').trim();
  const useHistory = options.useHistory !== false;
  const conversationHistory = useHistory ? normalizePromptHistory(options.history) : [];
  const historyContext = formatConversationHistoryForPrompt(conversationHistory);
  const model = String(options.model || '').trim();
  const sandbox = normalizeCodexSandbox(options.sandbox);
  const approval = normalizeCodexApproval(options.approval);

  if (!prompt) {
    throw new Error('Prompt text is required.');
  }

  const codexProbe = await probeCodexInstallation();
  if (!codexProbe.installed) {
    throw new Error(`Codex CLI is not installed or not available to the launcher. ${codexProbe.error || ''}`.trim());
  }

  const codexEnv = await envWithToolPath('codex', ['node']);
  const outputPath = path.join(tmpRoot, `blender_mcp_codex_${Date.now()}.txt`);
  const args = [
    '--ask-for-approval',
    approval,
    'exec',
    '--json',
    '--color',
    'never',
    '-C',
    repoRoot,
    '-s',
    sandbox,
    '-o',
    outputPath,
  ];

  if (model) {
    args.push('-m', model);
  }

  args.push('-');

  sendLog(`Codex agent run started (model=${model || 'config default'}, sandbox=${sandbox}, approval=${approval}).`);
  progress('status', 'Starting Codex CLI run.');

  let codexLineBuffer = '';
  const commandResult = await runCommandWithInput(
    codexProbe.codexPath,
    args,
    buildCodexAgentPrompt({ prompt, userContext, historyContext }),
    {
      cwd: repoRoot,
      env: codexEnv,
      onStdout: (chunk) => {
        codexLineBuffer = parseJsonLinesFromChunk(codexLineBuffer, chunk, (event, rawLine) => {
          const message = event
            ? summarizeAgentJsonEvent('Codex', event)
            : (rawLine ? `Codex: ${rawLine.slice(0, 240)}` : '');
          if (message) {
            progress('event', message, { source: 'codex' });
          }
        });
      },
      onStderr: (chunk) => {
        const message = chunk.trim();
        if (message) {
          progress('stderr', `Codex: ${message.slice(0, 240)}`, { source: 'codex' });
        }
      },
    }
  );

  let finalMessage = '';
  try {
    finalMessage = (await fs.readFile(outputPath, 'utf8')).trim();
  } catch {
    finalMessage = '';
  }

  sendLog(`Codex agent run finished (output=${outputPath}).`);
  progress('done', 'Codex CLI run finished.');

  return {
    provider: 'codex',
    prompt,
    model: model || codexProbe.codexVersion || 'config default',
    sandbox,
    approval,
    historyCount: conversationHistory.length,
    outputPath,
    finalMessage,
    stdout: commandResult.stdout || '',
    stderr: commandResult.stderr || '',
    code: '',
    blenderResultText: finalMessage || commandResult.stdout || commandResult.stderr || '',
    attempts: [],
  };
}

function buildClaudeAgentPrompt({
  prompt,
  userContext,
  historyContext,
}) {
  return [
    'You are running from Blender MCP Launcher as a non-interactive Claude Code CLI agent.',
    'Use the local repository and configured MCP tools when they are relevant. If the user asks to create or modify Blender content, prefer the configured Blender MCP tools instead of only describing the work.',
    'Keep the final response concise and include the important files, commands, or Blender result details.',
    historyContext ? `Conversation history:\n${historyContext}` : '',
    userContext ? `Extra context:\n${userContext}` : '',
    `User request:\n${prompt}`,
  ].filter(Boolean).join('\n\n');
}

function summarizeAgentJsonEvent(source, event) {
  if (!event || typeof event !== 'object') {
    return '';
  }

  const type = String(event.type || event.event || event.kind || event.msg?.type || '').trim();
  const toolName = event.name
    || event.tool
    || event.tool_name
    || event.toolCall?.name
    || event.tool_call?.name
    || event.item?.name
    || event.message?.name
    || '';
  const command = event.command || event.cmd || event.call?.command || event.item?.command || '';
  const text = event.message
    || event.text
    || event.delta
    || event.result
    || event.error
    || event.item?.text
    || '';

  if (/tool|mcp/i.test(type) && toolName) {
    return `${source}: using ${toolName}`;
  }

  if (/exec|command|bash|shell/i.test(type) && command) {
    return `${source}: running ${command}`;
  }

  if (/error|failed/i.test(type) && text) {
    return `${source}: ${String(text).slice(0, 240)}`;
  }

  if (type === 'result' && text) {
    return `${source}: final response ready`;
  }

  if (/assistant|message|output/i.test(type) && typeof text === 'string' && text.trim()) {
    return `${source}: ${text.trim().slice(0, 240)}`;
  }

  if (type && !/delta|chunk|token/i.test(type)) {
    return `${source}: ${type}`;
  }

  return '';
}

function extractClaudeTextFromEvent(event) {
  if (!event || typeof event !== 'object') {
    return '';
  }

  if (event.type === 'result' && typeof event.result === 'string') {
    return event.result.trim();
  }

  const content = event.message?.content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return item;
        if (typeof item?.text === 'string') return item.text;
        return '';
      })
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  if (typeof event.message === 'string') {
    return event.message.trim();
  }

  return '';
}

function parseJsonLinesFromChunk(buffer, chunk, onJsonLine) {
  const combined = `${buffer}${chunk}`;
  const lines = combined.split(/\r?\n/);
  const nextBuffer = lines.pop() || '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      onJsonLine(JSON.parse(trimmed), trimmed);
    } catch {
      onJsonLine(null, trimmed);
    }
  }

  return nextBuffer;
}

async function probeClaudeCodeInstallation() {
  try {
    const claudePath = await resolveToolPath('claude');
    const claudeEnv = await envWithToolPath('claude', ['node']);
    const result = await runCommand(claudePath, ['--version'], { env: claudeEnv });
    const version = (result.stdout || result.stderr || '').trim().split('\n').filter(Boolean).slice(-1)[0] || null;
    return {
      installed: true,
      claudePath,
      claudeVersion: version,
      error: null,
    };
  } catch (error) {
    return {
      installed: false,
      claudePath: null,
      claudeVersion: null,
      error: String(error.message || error),
    };
  }
}

async function runClaudeAgentPrompt(options = {}) {
  const progressRequestId = String(options.requestId || '').trim();
  const progress = (type, message, extra) => sendAgentRunProgress(progressRequestId, type, message, extra);
  const prompt = String(options.prompt || '').trim();
  const userContext = String(options.context || '').trim();
  const useHistory = options.useHistory !== false;
  const conversationHistory = useHistory ? normalizePromptHistory(options.history) : [];
  const historyContext = formatConversationHistoryForPrompt(conversationHistory);
  const model = String(options.model || '').trim();
  const permissionMode = normalizeClaudePermissionMode(options.permissionMode);
  const allowBlenderTools = options.allowBlenderTools !== false;

  if (!prompt) {
    throw new Error('Prompt text is required.');
  }

  const claudeProbe = await probeClaudeCodeInstallation();
  if (!claudeProbe.installed) {
    throw new Error(`Claude Code CLI is not installed or not available to the launcher. ${claudeProbe.error || ''}`.trim());
  }

  const claudeEnv = await envWithToolPath('claude', ['node']);
  const args = [
    '-p',
    '--output-format',
    'stream-json',
    '--permission-mode',
    permissionMode,
    '--no-session-persistence',
  ];

  if (model) {
    args.push('--model', model);
  }

  if (allowBlenderTools) {
    args.push('--allowedTools', blenderClaudeAllowedTools().join(','));
  }

  sendLog(`Claude Code agent run started (model=${model || 'config default'}, permission=${permissionMode}, blender_tools=${allowBlenderTools ? 'allowed' : 'default'}).`);
  progress('status', 'Starting Claude Code CLI run.');

  let claudeLineBuffer = '';
  let finalMessage = '';
  const commandResult = await runCommandWithInput(
    claudeProbe.claudePath,
    args,
    buildClaudeAgentPrompt({ prompt, userContext, historyContext }),
    {
      cwd: repoRoot,
      env: claudeEnv,
      onStdout: (chunk) => {
        claudeLineBuffer = parseJsonLinesFromChunk(claudeLineBuffer, chunk, (event, rawLine) => {
          if (event) {
            const eventText = extractClaudeTextFromEvent(event);
            if (event.type === 'result' && eventText) {
              finalMessage = eventText;
            }
            const message = summarizeAgentJsonEvent('Claude', event);
            if (message) {
              progress('event', message, { source: 'claude' });
            }
          } else if (rawLine) {
            progress('stdout', `Claude: ${rawLine.slice(0, 240)}`, { source: 'claude' });
          }
        });
      },
      onStderr: (chunk) => {
        const message = chunk.trim();
        if (message) {
          progress('stderr', `Claude: ${message.slice(0, 240)}`, { source: 'claude' });
        }
      },
    }
  );

  if (!finalMessage) {
    const lines = (commandResult.stdout || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    for (const line of lines) {
      try {
        const event = JSON.parse(line);
        const eventText = extractClaudeTextFromEvent(event);
        if (event.type === 'result' && eventText) {
          finalMessage = eventText;
        }
      } catch {
        // Ignore non-JSON output.
      }
    }
  }

  if (!finalMessage) {
    finalMessage = (commandResult.stdout || '').trim();
  }

  sendLog('Claude Code agent run finished.');
  progress('done', 'Claude Code CLI run finished.');

  return {
    provider: 'claude',
    prompt,
    model: model || claudeProbe.claudeVersion || 'config default',
    permissionMode,
    allowBlenderTools,
    historyCount: conversationHistory.length,
    finalMessage,
    stdout: commandResult.stdout || '',
    stderr: commandResult.stderr || '',
    code: '',
    blenderResultText: finalMessage || commandResult.stderr || '',
    attempts: [],
  };
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

async function detectBlenderInstallation() {
  const candidate = await detectInstalledApp(blenderAppCandidates);
  if (candidate) return candidate;

  if (!isWindows) return null;

  try {
    const whereResult = await runCommand('where.exe', ['blender.exe']);
    const whereCandidates = (whereResult.stdout || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    for (const found of whereCandidates) {
      if (await fileExists(found)) {
        return found;
      }
    }
  } catch {
    // Blender command not found on PATH.
  }

  return null;
}

async function probeCodexInstallation() {
  try {
    const codexPath = await resolveToolPath('codex');
    const codexEnv = await envWithToolPath('codex', ['node']);
    const result = await runCommand(codexPath, ['--version'], { env: codexEnv });
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

async function runWindowsNodeInstallFlow() {
  try {
    sendLog(`Installing Node.js with winget package ${wingetNodePackageId}...`);
    const winget = await resolveToolPath('winget');
    await runCommand(winget, [
      'install',
      '--id',
      wingetNodePackageId,
      '--exact',
      '--silent',
      '--accept-package-agreements',
      '--accept-source-agreements',
    ]);

    delete toolPathCache.node;
    delete toolPathCache.npm;

    const after = await probeNodeInstallation();
    if (!after.installed) {
      throw new Error('winget install completed, but node is still not available to the launcher.');
    }

    sendLog(`Node.js installed via winget (${after.nodeVersion}).`);
    return {
      ok: true,
      alreadyInstalled: false,
      method: 'winget',
      nodeVersion: after.nodeVersion,
      nodePath: after.nodePath,
      downloadUrl: nodeDownloadUrl,
    };
  } catch (error) {
    const message = String(error.message || error);
    const wingetMissing = /winget|not recognized|ENOENT|not found/i.test(message);
    const friendlyMessage = wingetMissing
      ? 'winget is unavailable. Install Node.js manually from the official download page.'
      : message;

    sendLog(`winget Node.js install attempt failed: ${friendlyMessage}`);
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

  if (isWindows) {
    return runWindowsNodeInstallFlow();
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
    const shellOverride = Object.prototype.hasOwnProperty.call(options, 'shell')
      ? options.shell
      : (isWindows && /\.(cmd|bat)$/i.test(command));

    const child = spawn(command, args, {
      ...options,
      env: { ...process.env, ...(options.env || {}) },
      shell: shellOverride,
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

function runCommandWithInput(command, args, input, options = {}) {
  return new Promise((resolve, reject) => {
    const {
      onStdout,
      onStderr,
      ...spawnOptions
    } = options;
    const shellOverride = Object.prototype.hasOwnProperty.call(options, 'shell')
      ? options.shell
      : (isWindows && /\.(cmd|bat)$/i.test(command));

    const child = spawn(command, args, {
      ...spawnOptions,
      env: { ...process.env, ...(options.env || {}) },
      shell: shellOverride,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      if (typeof onStdout === 'function') {
        onStdout(text);
      }
    });

    child.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      if (typeof onStderr === 'function') {
        onStderr(text);
      }
    });

    child.on('error', reject);

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr, code });
      } else {
        const detail = (stderr || stdout || `Command failed with code ${code}`).trim();
        const error = new Error(detail);
        error.stdout = stdout;
        error.stderr = stderr;
        error.code = code;
        reject(error);
      }
    });

    child.stdin.end(input);
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
  const blenderDetectedPath = await detectBlenderInstallation();
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
      blenderDetectedPath,
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

  status.paths.blenderAppPath = blenderDetectedPath || blenderAppPath;
  status.checks.blenderInstalled = Boolean(blenderDetectedPath);
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
ipcMain.handle('prompt:run', async (_event, options = {}) => runInAppPrompt(options));
ipcMain.handle('agent:codex-run', async (_event, options = {}) => runCodexAgentPrompt(options));
ipcMain.handle('agent:claude-run', async (_event, options = {}) => runClaudeAgentPrompt(options));
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
  const detectedPath = await detectBlenderInstallation();
  if (!detectedPath) {
    const attempted = blenderAppCandidates.slice(0, 8).join('\n');
    throw new Error(`Blender not found. Checked common locations:\n${attempted}`);
  }

  const openError = await shell.openPath(detectedPath);
  if (openError) {
    throw new Error(`Failed to launch Blender: ${openError}`);
  }
  sendLog('Blender launched.');
  return { launched: true, blenderAppPath: detectedPath };
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
