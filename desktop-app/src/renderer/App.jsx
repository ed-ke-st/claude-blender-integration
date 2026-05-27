import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Database,
  FolderOpen,
  MessageSquareText,
  PlugZap,
  Server,
  Wrench,
  ChevronRight,
  ChevronLeft,
  X,
} from 'lucide-react';
import appIcon from './assets/app-icon.svg';
import { ChatWorkspace } from './components/ChatWorkspace.jsx';
import { WorkspaceHeader } from './components/WorkspaceHeader.jsx';
import { usePromptWorkspace } from './hooks/usePromptWorkspace';

const ONBOARDING_COMPLETE_KEY = 'blenderMcpLauncher.onboardingComplete.v1';

function formatSetupStatus(result) {
  const c = result.checks;
  const d = result.details;
  return [
    `Node installed: ${c.nodeInstalled ? 'yes' : 'no'} ${d.nodeVersion ? `(${d.nodeVersion})` : ''}`,
    `Blender installed (${result.paths.blenderAppPath}): ${c.blenderInstalled ? 'yes' : 'no'}`,
    `Claude Desktop installed: ${c.claudeDesktopInstalled ? 'yes' : 'no'} ${d.claudeDesktopPath ? `(${d.claudeDesktopPath})` : ''}`,
    `Codex CLI installed: ${c.codexCliInstalled ? 'yes' : 'no'} ${d.codexVersion ? `(${d.codexVersion})` : ''}`,
    `ChatGPT desktop installed: ${c.chatgptDesktopInstalled ? 'yes' : 'no'} ${d.chatgptDesktopPath ? `(${d.chatgptDesktopPath})` : ''}`,
    `MCP dependencies (mcp-server/node_modules): ${c.mcpDependenciesInstalled ? 'yes' : 'no'}`,
    `Addon source present: ${c.addonSourcePresent ? 'yes' : 'no'}`,
    `Addon installed in Blender: ${c.addonInstalled ? 'yes' : 'no'}`,
    `Claude config exists: ${c.claudeConfigExists ? 'yes' : 'no'}`,
    `Codex config exists: ${c.codexConfigExists ? 'yes' : 'no'}`,
    `Claude config backups: ${d.claudeBackups}`,
    `Codex config backups: ${d.codexBackups}`,
    `Server running: ${c.serverRunning ? 'yes' : 'no'}`,
    `RAG index present (${result.paths.ragStorePath}): ${c.ragIndexPresent ? 'yes' : 'no'}`,
    `RAG index chunks/files: ${d.ragChunksIndexed || 0}/${d.ragFilesIndexed || 0}`,
    `RAG indexed at: ${d.ragIndexedAt || '(not indexed yet)'}`,
    `RAG status error: ${d.ragStoreError || '(none)'}`,
    '',
    'Paths:',
    `- Repo: ${result.paths.repoRoot}`,
    `- Server: ${result.paths.mcpServerEntrypoint}`,
    `- RAG store: ${result.paths.ragStorePath}`,
    `- Addon source: ${result.paths.addonSource}`,
    `- Addon target: ${d.addonTarget || '(not detected)'}`,
    `- Blender download: ${result.paths.blenderDownloadUrl || 'https://www.blender.org/download/'}`,
    `- Claude Desktop download: ${result.paths.claudeDesktopDownloadUrl || 'https://claude.ai/download'}`,
    `- Codex install docs: ${result.paths.codexInstallDocsUrl || 'https://github.com/openai/codex#installation'}`,
    `- ChatGPT desktop download: ${result.paths.chatgptDesktopDownloadUrl || 'https://openai.com/chatgpt/desktop/'}`,
    `- Claude config: ${result.paths.claudeConfigPath}`,
    `- Codex config: ${result.paths.codexConfigPath}`,
    `- Backups root: ${result.paths.backupRoot}`,
  ].join('\n');
}

function formatRagStatus(result) {
  if (!result) {
    return 'RAG status unavailable.';
  }

  return [
    `Store path: ${result.storePath}`,
    `Present: ${result.present ? 'yes' : 'no'}`,
    `Indexed files/chunks: ${result.filesIndexed || 0}/${result.chunksIndexed || 0}`,
    `Indexed at: ${result.indexedAt || '(not indexed yet)'}`,
    `Schema version: ${result.schemaVersion ?? '(unknown)'}`,
    `Store size: ${result.sizeBytes || 0} bytes`,
    `Error: ${result.error || '(none)'}`,
  ].join('\n');
}

function buttonClass(isDanger) {
  return isDanger ? 'danger' : '';
}

function formatNodeInstallResult(result) {
  if (!result || typeof result !== 'object') {
    return 'Node install finished with an unknown response.';
  }

  if (result.ok && result.alreadyInstalled) {
    return `Node.js is already installed (${result.nodeVersion || 'version unknown'}).`;
  }

  if (result.ok) {
    const methodLabel = result.method === 'nvm'
      ? 'via nvm'
      : (result.method === 'winget' ? 'via winget' : '');
    return [
      `Node.js installed successfully ${methodLabel} (${result.nodeVersion || 'version unknown'}).`,
      result.nodePath ? `Path: ${result.nodePath}` : '',
    ].filter(Boolean).join('\n');
  }

  return [
    'Automatic Node.js installation did not complete.',
    result.error ? `Details: ${result.error}` : '',
    result.downloadUrl ? `Download Node.js manually: ${result.downloadUrl}` : '',
  ].filter(Boolean).join('\n');
}

function formatCodexInstallResult(result) {
  if (!result || typeof result !== 'object') {
    return 'Codex install finished with an unknown response.';
  }

  if (result.ok && result.alreadyInstalled) {
    return `Codex CLI is already installed (${result.codexVersion || 'version unknown'}).`;
  }

  if (result.ok) {
    return [
      `Codex CLI installed successfully (${result.codexVersion || 'version unknown'}).`,
      result.codexPath ? `Path: ${result.codexPath}` : '',
      result.packageName ? `Package: ${result.packageName}` : '',
    ].filter(Boolean).join('\n');
  }

  return [
    'Automatic Codex CLI installation did not complete.',
    result.error ? `Details: ${result.error}` : '',
    result.docsUrl ? `Install docs opened: ${result.docsUrl}` : '',
  ].filter(Boolean).join('\n');
}

function readOnboardingComplete() {
  try {
    return window.localStorage.getItem(ONBOARDING_COMPLETE_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeOnboardingComplete(value) {
  try {
    window.localStorage.setItem(ONBOARDING_COMPLETE_KEY, value ? 'true' : 'false');
  } catch {
    // Ignore localStorage errors.
  }
}

function statusPill(value, goodText = 'Ready', badText = 'Pending') {
  if (value) return <span className="pill good">{goodText}</span>;
  return <span className="pill">{badText}</span>;
}

function collectRemainingSetupItems(status) {
  const checks = status?.checks;
  if (!checks) return [];

  const remaining = [];

  if (!checks.nodeInstalled) {
    remaining.push('Install Node.js in setup (if prompted, install Xcode Command Line Tools first).');
  }

  if (!checks.blenderInstalled) {
    remaining.push('Install Blender from the official download page.');
  }

  if (checks.nodeInstalled && !checks.mcpDependenciesInstalled) {
    remaining.push('Install MCP server dependencies.');
  }

  if (!checks.addonInstalled) {
    remaining.push('Install the Blender addon, then enable "Claude Modelling Tools" in Blender.');
  }

  if (!checks.claudeDesktopInstalled) {
    remaining.push('Install Claude Desktop.');
  } else if (checks.nodeInstalled && !checks.claudeConfigExists) {
    remaining.push('Connect Claude Desktop from setup (writes launcher MCP config).');
  }

  if (checks.nodeInstalled && !checks.codexCliInstalled) {
    remaining.push('Install Codex CLI.');
  } else if (checks.nodeInstalled && checks.codexCliInstalled && !checks.codexConfigExists) {
    remaining.push('Connect Codex from setup (writes launcher MCP config).');
  }

  if (!checks.chatgptDesktopInstalled) {
    remaining.push('Install ChatGPT desktop app (optional).');
  }

  if (checks.nodeInstalled && !checks.ragIndexPresent) {
    remaining.push('Build the local RAG index.');
  }

  return remaining;
}

export function App() {
  const [setupStatus, setSetupStatus] = useState('Run "Refresh Status" to inspect your environment.');
  const [configStatus, setConfigStatus] = useState('Click a button to write/update config files.');
  const [serverStatus, setServerStatus] = useState('Server stopped.');
  const [serverLogs, setServerLogs] = useState('');
  const [ragStatus, setRagStatus] = useState('Click "Refresh RAG Status" to inspect local index state.');
  const [ragOutput, setRagOutput] = useState('');
  const [ragQueryText, setRagQueryText] = useState('delete token safeguards');
  const [ragTopK, setRagTopK] = useState('5');
  const [tmpStatus, setTmpStatus] = useState('Click "Refresh Temp Files" to load watched artifacts.');
  const [tmpContent, setTmpContent] = useState('');
  const [tmpFiles, setTmpFiles] = useState([]);
  const [selectedTmpFile, setSelectedTmpFile] = useState('');
  const [activeWorkspace, setActiveWorkspace] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarDrawerOpen, setSidebarDrawerOpen] = useState(false);
  const [isNarrowViewport, setIsNarrowViewport] = useState(false);
  const [setupData, setSetupData] = useState(null);

  const [transport, setTransport] = useState('stdio');
  const [host, setHost] = useState('127.0.0.1');
  const [port, setPort] = useState('3030');
  const [authToken, setAuthToken] = useState('');

  const [busy, setBusy] = useState({});

  const [installState, setInstallState] = useState(null);
  const [nodeInstallState, setNodeInstallState] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(() => !readOnboardingComplete());
  const [guideStep, setGuideStep] = useState(0);
  const [guideMessage, setGuideMessage] = useState('');
  const [guideError, setGuideError] = useState('');
  const [guideRunAllState, setGuideRunAllState] = useState(null);
  const nodeInstallStateRef = useRef(null);

  const api = useMemo(() => window.launcherApi, []);
  const promptWorkspace = usePromptWorkspace();

  const onboardingSteps = [
    {
      title: 'Welcome',
      body: 'This guide gets Blender MCP running end to end. You can complete it in a few clicks.',
    },
    {
      title: 'Prepare your machine',
      body: 'Verify your environment, install server dependencies, and copy the Blender addon.',
    },
    {
      title: 'Connect your AI apps',
      body: 'Write launcher-managed config entries for Claude Desktop and Codex.',
    },
    {
      title: 'Build local RAG index',
      body: 'Index the repository once so retrieve_context and launcher RAG queries are ready on first use.',
    },
    {
      title: 'Run and verify',
      body: 'Start the MCP server and confirm Blender communication from this launcher.',
    },
    {
      title: 'All set',
      body: 'You can now use the full control panel any time for maintenance or troubleshooting.',
    },
  ];

  const setBusyFlag = (key, value) => {
    setBusy((previous) => ({ ...previous, [key]: value }));
  };

  const refreshSetupStatus = async () => {
    const result = await api.checkSetup();
    setSetupStatus(formatSetupStatus(result));
    setSetupData(result);
    return result;
  };

  const refreshRagStatus = async () => {
    const result = await api.ragStatus();
    setRagStatus(formatRagStatus(result));
    return result;
  };

  const refreshTmpFiles = async () => {
    const files = await api.listTmpFiles();
    setTmpFiles(files);
    setTmpStatus(`Found ${files.length} relevant files in temp dir.`);
    if (!files.length) {
      setSelectedTmpFile('');
      return files;
    }

    setSelectedTmpFile((current) => {
      if (current && files.some((file) => file.path === current)) return current;
      return files[0].path;
    });
    return files;
  };

  useEffect(() => {
    const unsubscribe = api.onServerLog((line) => {
      if (!line) return;
      setServerLogs((current) => (current ? `${current}\n${line}` : line));
    });

    const unsubInstall = api.onInstallState((state) => {
      setInstallState(state);
      if (!state.installing && !state.error) {
        setTimeout(() => setInstallState(null), 3000);
      }
    });

    const unsubNodeInstall = api.onNodeInstallState((state) => {
      nodeInstallStateRef.current = state;
      setNodeInstallState(state);
      if (!state?.installing) {
        if (state?.result) {
          setSetupStatus(formatNodeInstallResult(state.result));
        }
        refreshSetupStatus().catch((error) => {
          setSetupStatus(String(error.message || error));
        });
        if (!state?.error) {
          setTimeout(() => setNodeInstallState(null), 3500);
        }
      }
    });

    refreshSetupStatus().catch((error) => {
      setSetupStatus(String(error.message || error));
    });

    refreshRagStatus().catch((error) => {
      setRagStatus(`Failed to read RAG status:\n${String(error.message || error)}`);
    });

    refreshTmpFiles().catch((error) => {
      setTmpStatus(`Failed to list temp files:\n${String(error.message || error)}`);
    });

    return () => {
      unsubscribe();
      unsubInstall();
      unsubNodeInstall();
    };
  }, [api]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 980px)');
    const applyViewportMode = (matches) => {
      setIsNarrowViewport(matches);
      if (matches) {
        setSidebarDrawerOpen(false);
      }
    };

    applyViewportMode(mediaQuery.matches);
    const handleChange = (event) => applyViewportMode(event.matches);

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  const runWithBusy = async (key, fn) => {
    setBusyFlag(key, true);
    try {
      await fn();
    } finally {
      setBusyFlag(key, false);
    }
  };

  const runGuideAction = async (key, successMessage, fn) => {
    setGuideError('');
    setGuideMessage('');
    await runWithBusy(key, async () => {
      try {
        const result = await fn();
        if (typeof successMessage === 'function') {
          setGuideMessage(successMessage(result));
        } else {
          setGuideMessage(successMessage);
        }
      } catch (error) {
        setGuideError(String(error.message || error));
      }
    });
  };

  const runGuideAllSteps = async () => {
    if (busy.guideRunAllSetup) return;
    setGuideError('');
    setGuideMessage('');

    await runWithBusy('guideRunAllSetup', async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const entries = [];

      let setup = await refreshSetupStatus();
      const runPlan = {
        installNode: !setup.checks.nodeInstalled,
        installDependencies: !setup.checks.mcpDependenciesInstalled,
        installAddon: !setup.checks.addonInstalled,
        installCodexCli: !setup.checks.codexCliInstalled,
        connectClaude: !setup.checks.claudeConfigExists,
        connectCodex: !setup.checks.codexConfigExists,
        buildRagIndex: !setup.checks.ragIndexPresent,
      };

      const plannedTasks = [
        'Check environment',
        runPlan.installNode ? 'Install Node.js' : null,
        runPlan.installDependencies ? 'Install dependencies' : null,
        runPlan.installAddon ? 'Install Blender addon' : null,
        runPlan.installCodexCli ? 'Install Codex CLI' : null,
        runPlan.connectClaude ? 'Connect Claude Desktop' : null,
        runPlan.connectCodex ? 'Connect Codex' : null,
        runPlan.buildRagIndex ? 'Build RAG index' : null,
        'Finalize checks',
      ].filter(Boolean);

      const total = plannedTasks.length;
      let completed = 0;
      setGuideRunAllState({
        running: true,
        current: 'Preparing setup plan…',
        total,
        completed,
        entries: [],
        remaining: [],
      });

      const pushEntry = (entry) => {
        entries.push(entry);
        completed += 1;
        setGuideRunAllState({
          running: true,
          current: entry.label,
          total,
          completed,
          entries: [...entries],
          remaining: [],
        });
      };

      const runTask = async (label, fn) => {
        setGuideRunAllState({
          running: true,
          current: label,
          total,
          completed,
          entries: [...entries],
          remaining: [],
        });
        try {
          await fn();
          pushEntry({ label, status: 'done', detail: '' });
        } catch (error) {
          pushEntry({ label, status: 'failed', detail: String(error.message || error) });
        }
      };

      await runTask('Check environment', async () => {
        setup = await refreshSetupStatus();
      });

      if (runPlan.installNode) {
        await runTask('Install Node.js', async () => {
          nodeInstallStateRef.current = { installing: true, error: null, result: null };
          await api.installNode();

          const timeoutMs = 9 * 60 * 1000;
          const startedAt = Date.now();
          while (Date.now() - startedAt < timeoutMs) {
            const nodeState = nodeInstallStateRef.current;
            if (nodeState && nodeState.installing === false && nodeState.error) {
              throw new Error(nodeState.error);
            }

            setup = await refreshSetupStatus();
            if (setup.checks.nodeInstalled) return;
            await wait(1500);
          }

          throw new Error('Timed out waiting for Node.js installation.');
        });
      }

      setup = await refreshSetupStatus();
      if (runPlan.installDependencies) {
        if (setup.checks.mcpDependenciesInstalled) {
          pushEntry({
            label: 'Install dependencies',
            status: 'skipped',
            detail: 'Skipped because dependencies were already installed.',
          });
        } else if (!setup.checks.nodeInstalled) {
          pushEntry({
            label: 'Install dependencies',
            status: 'skipped',
            detail: 'Skipped because Node.js is not installed.',
          });
        } else {
          await runTask('Install dependencies', async () => {
            await api.installDependencies();
            setup = await refreshSetupStatus();
          });
        }
      }

      setup = await refreshSetupStatus();
      if (runPlan.installAddon) {
        if (setup.checks.addonInstalled) {
          pushEntry({
            label: 'Install Blender addon',
            status: 'skipped',
            detail: 'Skipped because addon is already installed.',
          });
        } else {
          await runTask('Install Blender addon', async () => {
            await api.installAddon();
            setup = await refreshSetupStatus();
          });
        }
      }

      setup = await refreshSetupStatus();
      if (runPlan.installCodexCli) {
        if (setup.checks.codexCliInstalled) {
          pushEntry({
            label: 'Install Codex CLI',
            status: 'skipped',
            detail: 'Skipped because Codex CLI is already installed.',
          });
        } else if (!setup.checks.nodeInstalled) {
          pushEntry({
            label: 'Install Codex CLI',
            status: 'skipped',
            detail: 'Skipped because Node.js is not installed.',
          });
        } else {
          await runTask('Install Codex CLI', async () => {
            const result = await api.installCodexCli();
            if (result && result.ok === false) {
              throw new Error(result.error || 'Automatic Codex CLI installation did not complete.');
            }
            setup = await refreshSetupStatus();
          });
        }
      }

      setup = await refreshSetupStatus();
      if (runPlan.connectClaude) {
        if (setup.checks.claudeConfigExists) {
          pushEntry({
            label: 'Connect Claude Desktop',
            status: 'skipped',
            detail: 'Skipped because Claude Desktop is already connected.',
          });
        } else if (!setup.checks.nodeInstalled) {
          pushEntry({
            label: 'Connect Claude Desktop',
            status: 'skipped',
            detail: 'Skipped because Node.js is not installed.',
          });
        } else if (!setup.checks.claudeDesktopInstalled) {
          pushEntry({
            label: 'Connect Claude Desktop',
            status: 'skipped',
            detail: 'Skipped because Claude Desktop is not installed.',
          });
        } else {
          await runTask('Connect Claude Desktop', async () => {
            await api.configureClaude();
            setup = await refreshSetupStatus();
          });
        }
      }

      setup = await refreshSetupStatus();
      if (runPlan.connectCodex) {
        if (setup.checks.codexConfigExists) {
          pushEntry({
            label: 'Connect Codex',
            status: 'skipped',
            detail: 'Skipped because Codex is already connected.',
          });
        } else if (!setup.checks.nodeInstalled) {
          pushEntry({
            label: 'Connect Codex',
            status: 'skipped',
            detail: 'Skipped because Node.js is not installed.',
          });
        } else if (!setup.checks.codexCliInstalled) {
          pushEntry({
            label: 'Connect Codex',
            status: 'skipped',
            detail: 'Skipped because Codex CLI is not installed.',
          });
        } else {
          await runTask('Connect Codex', async () => {
            await api.configureCodex();
            setup = await refreshSetupStatus();
          });
        }
      }

      setup = await refreshSetupStatus();
      if (runPlan.buildRagIndex) {
        if (setup.checks.ragIndexPresent) {
          pushEntry({
            label: 'Build RAG index',
            status: 'skipped',
            detail: 'Skipped because a RAG index is already present.',
          });
        } else if (!setup.checks.nodeInstalled) {
          pushEntry({
            label: 'Build RAG index',
            status: 'skipped',
            detail: 'Skipped because Node.js is not installed.',
          });
        } else {
          await runTask('Build RAG index', async () => {
            await api.ragIndex();
            await refreshRagStatus();
            setup = await refreshSetupStatus();
          });
        }
      }

      await runTask('Finalize checks', async () => {
        setup = await refreshSetupStatus();
      });

      const remaining = collectRemainingSetupItems(setup);
      setGuideRunAllState({
        running: false,
        current: remaining.length
          ? 'Automated setup finished with manual follow-up items.'
          : 'Automated setup finished.',
        total,
        completed,
        entries: [...entries],
        remaining,
      });

      if (remaining.length) {
        setGuideMessage('Run-all finished. Review remaining manual items below.');
      } else {
        setGuideMessage('Run-all finished. Your environment looks ready.');
      }
    });
  };

  const selectedTmpLabel = useMemo(() => {
    const current = tmpFiles.find((file) => file.path === selectedTmpFile);
    return current ? `${current.name} (${current.size} bytes, ${current.modifiedAt})` : '';
  }, [tmpFiles, selectedTmpFile]);

  const completeOnboarding = () => {
    writeOnboardingComplete(true);
    setShowOnboarding(false);
  };

  const setupChecks = setupData?.checks;
  const nodeReady = Boolean(setupChecks?.nodeInstalled);
  const nodeRequiredHint = 'Node.js is not detected. Click "Install Node.js" first to enable Node-dependent actions.';
  const blenderReady = Boolean(setupChecks?.blenderInstalled);
  const blenderRequiredHint = 'Blender is not detected. Click "Download Blender" to open the official installer page, then install Blender and refresh status.';
  const claudeDesktopReady = Boolean(setupChecks?.claudeDesktopInstalled);
  const codexReady = Boolean(setupChecks?.codexCliInstalled);
  const chatgptDesktopReady = Boolean(setupChecks?.chatgptDesktopInstalled);
  const promptingReady = Boolean(setupChecks?.mcpDependenciesInstalled && setupChecks?.addonInstalled);
  const promptingRequiredHint = [
    !setupChecks?.mcpDependenciesInstalled ? 'Install MCP dependencies before using in-app prompting.' : null,
    !setupChecks?.addonInstalled ? 'Install and enable the Blender addon before sending prompts to Blender.' : null,
    !setupChecks?.blenderInstalled ? 'Blender is not detected. Launch or install Blender first.' : null,
  ].filter(Boolean).join('\n');
  const aiHostsRequiredHint = [
    !claudeDesktopReady ? 'Claude Desktop not detected. Use "Get Claude Desktop".' : null,
    !codexReady ? 'Codex CLI not detected. Use "Install Codex CLI" (or open install docs).' : null,
    !chatgptDesktopReady ? 'ChatGPT desktop not detected. Use "Get ChatGPT Desktop".' : null,
  ].filter(Boolean).join('\n');
  const guideAutomationRunning = Boolean(busy.guideRunAllSetup);
  const guideRunAllPercent = guideRunAllState && guideRunAllState.total > 0
    ? Math.round((guideRunAllState.completed / guideRunAllState.total) * 100)
    : 0;
  const currentWorkspace = activeWorkspace || (promptingReady ? 'chat' : 'setup');
  const sidebarExpanded = isNarrowViewport ? sidebarDrawerOpen : !sidebarCollapsed;
  const workspaceMeta = {
    chat: {
      title: 'Chat Workspace',
      description: 'Prompt Blender directly from the launcher, review attempt traces, and manage session conversation in one place.',
    },
    setup: {
      title: 'Setup',
      description: 'Install prerequisites, verify Blender/addon readiness, and keep the local environment healthy.',
    },
    connections: {
      title: 'Connections',
      description: 'Configure Claude Desktop, Codex, and local agent templates from one screen.',
    },
    server: {
      title: 'Server',
      description: 'Start, stop, and inspect the MCP server runtime and logs.',
    },
    rag: {
      title: 'RAG',
      description: 'Build and query the local repository index used by retrieval-grounded prompting.',
    },
    files: {
      title: 'Temp Files',
      description: 'Inspect Blender watch files, result files, and live scene snapshots.',
    },
  }[currentWorkspace] || {
    title: 'Blender MCP Launcher',
    description: 'Desktop control panel for setup, prompting, and maintenance.',
  };
  const workspaceItems = [
    {
      id: 'chat',
      icon: MessageSquareText,
      label: 'Chat',
      helper: promptingReady ? 'Ready' : 'Needs setup',
      target: promptingReady ? 'chat' : 'setup',
    },
    {
      id: 'setup',
      icon: Wrench,
      label: 'Setup',
      helper: setupChecks?.addonInstalled ? 'Maintained' : 'Action needed',
      target: 'setup',
    },
    {
      id: 'connections',
      icon: PlugZap,
      label: 'Connections',
      helper: claudeDesktopReady || codexReady ? 'Configured' : 'Optional',
      target: 'connections',
    },
    {
      id: 'server',
      icon: Server,
      label: 'Server',
      helper: setupChecks?.serverRunning ? 'Running' : 'Stopped',
      target: 'server',
    },
    {
      id: 'rag',
      icon: Database,
      label: 'RAG',
      helper: setupChecks?.ragIndexPresent ? 'Indexed' : 'Not indexed',
      target: 'rag',
    },
    {
      id: 'files',
      icon: FolderOpen,
      label: 'Files',
      helper: tmpFiles.length ? `${tmpFiles.length} found` : 'No files',
      target: 'files',
    },
  ];

  const handleStartServerFromHeader = (busyKey = 'headerStartServer') => runWithBusy(busyKey, async () => {
    try {
      const result = await api.startServer({
        transport,
        host: host.trim(),
        port: port.trim(),
        authToken,
      });
      if (result.alreadyRunning) {
        setServerStatus('Server already running.');
      } else {
        setServerStatus(`Server started (${result.transport}).`);
      }

      const status = await api.serverStatus();
      if (!status.running) {
        setServerStatus('Server failed to start.');
      }
      await refreshSetupStatus();
    } catch (error) {
      setServerStatus(`Start failed:\n${String(error.message || error)}`);
    }
  });

  const addonActivationSteps = (
    <div className="addon-steps">
      <strong>After installing, activate in Blender:</strong>
      <ol>
        <li>Edit → Preferences → Add-ons → search <code>Cla</code><br />
          <span className="addon-steps-hint">(If not listed, click the refresh icon next to the tag icon → "Refresh Local")</span>
        </li>
        <li>Enable <strong>Claude Modelling Tools</strong></li>
        <li>Open the sidebar in the 3D Viewport <span className="addon-steps-hint">(press N)</span> → press <strong>Enable Auto-Execute</strong></li>
      </ol>
    </div>
  );

  const installBanner = installState && (
    <div className={`install-banner${installState.error ? ' error' : ''}`}>
      {installState.installing && <span className="install-spinner" />}
      <span>
        {installState.installing && 'Installing MCP server dependencies — this only runs once…'}
        {!installState.installing && !installState.error && installState.skipped && installState.reason === 'node-missing'
          && 'Automatic dependency install skipped until Node.js is installed.'}
        {!installState.installing && !installState.error && !installState.skipped && 'Dependencies installed successfully.'}
        {installState.error && `Dependency install failed: ${installState.error}`}
      </span>
      {!installState.installing && (
        <button className="ghost" onClick={() => setInstallState(null)}>Dismiss</button>
      )}
    </div>
  );

  const nodeInstallBanner = nodeInstallState && (
    <div className={`install-banner${nodeInstallState.error ? ' error' : ''}`}>
      {nodeInstallState.installing && <span className="install-spinner" />}
      <span>
        {nodeInstallState.installing && 'Installing Node.js in background...'}
        {!nodeInstallState.installing && !nodeInstallState.error && 'Node.js install finished.'}
        {nodeInstallState.error && `Node.js install failed: ${nodeInstallState.error}`}
      </span>
      {!nodeInstallState.installing && (
        <button className="ghost" onClick={() => setNodeInstallState(null)}>Dismiss</button>
      )}
    </div>
  );

  if (showOnboarding) {
    return (
      <>
        {installBanner}
        {nodeInstallBanner}
        <main className="onboarding-layout">
        <section className="onboarding-hero">
          <div className="title-with-icon">
            <img src={appIcon} alt="" className="app-title-icon" />
            <div>
              <h1>Blender MCP Launcher</h1>
              <p>First-time setup wizard</p>
            </div>
          </div>
          <button className="ghost" onClick={completeOnboarding}>Skip guide</button>
        </section>

        <section className="onboarding-card">
          <div className="stepper">
            {onboardingSteps.map((step, index) => (
              <button
                key={step.title}
                className={index === guideStep ? 'step active' : 'step'}
                disabled={guideAutomationRunning}
                onClick={() => setGuideStep(index)}
              >
                <span className="step-number">{index + 1}</span>
                <span>{step.title}</span>
              </button>
            ))}
          </div>

          <div className="guide-panel">
            <h2>{onboardingSteps[guideStep].title}</h2>
            <p>{onboardingSteps[guideStep].body}</p>
            <div className="guide-run-all">
              <button
                disabled={guideAutomationRunning}
                onClick={runGuideAllSteps}
              >
                {guideAutomationRunning ? 'Running full setup…' : 'Run all setup steps'}
              </button>
              <span className="guide-run-all-label">
                {guideRunAllState
                  ? `${guideRunAllState.completed}/${guideRunAllState.total} step(s) processed`
                  : 'Runs all non-interactive setup steps in order.'}
              </span>
            </div>

            {guideRunAllState && (
              <div className="guide-progress">
                <div className="guide-progress-head">
                  <strong>{guideRunAllState.current || 'Preparing…'}</strong>
                  <span>{guideRunAllPercent}%</span>
                </div>
                <div
                  className="guide-progress-track"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={guideRunAllPercent}
                >
                  <div className="guide-progress-fill" style={{ width: `${guideRunAllPercent}%` }} />
                </div>
                {guideRunAllState.entries.length > 0 && (
                  <div className="guide-progress-entries">
                    {guideRunAllState.entries.slice(-7).map((entry, index) => (
                      <div key={`${entry.label}-${index}`} className={`guide-progress-entry ${entry.status}`}>
                        <span>{entry.label}</span>
                        <span>{entry.status}</span>
                        {entry.detail && <small>{entry.detail}</small>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {guideStep === 0 && (
              <div className="guide-actions">
                <button disabled={guideAutomationRunning} onClick={() => setGuideStep(1)}>Start setup</button>
              </div>
            )}

            {guideStep === 1 && (
              <>
                <div className="checklist">
                  <div className="check-item">
                    <span>Node available</span>
                    {statusPill(setupChecks?.nodeInstalled)}
                  </div>
                  <div className="check-item">
                    <span>Blender found on this computer</span>
                    {statusPill(setupChecks?.blenderInstalled)}
                  </div>
                  <div className="check-item">
                    <span>MCP dependencies installed</span>
                    {statusPill(setupChecks?.mcpDependenciesInstalled)}
                  </div>
                  <div className="check-item">
                    <span>Blender addon installed</span>
                    {statusPill(setupChecks?.addonInstalled)}
                  </div>
                </div>
                <div className="guide-actions">
                  <button
                    disabled={Boolean(busy.guideRefreshSetup)}
                    onClick={() => runGuideAction('guideRefreshSetup', 'Environment check complete.', async () => {
                      await refreshSetupStatus();
                    })}
                  >
                    Check environment
                  </button>
                  <button
                    disabled={Boolean(busy.guideInstallNode)}
                    onClick={() => runGuideAction('guideInstallNode', (result) => {
                      if (result?.alreadyRunning) {
                        return 'Node.js install is already running in the background.';
                      }
                      return 'Node.js install started in background. You can continue setup while it runs.';
                    }, async () => {
                      const result = await api.installNode();
                      return result;
                    })}
                  >
                    Install Node.js
                  </button>
                  <button
                    disabled={!nodeReady || Boolean(busy.guideInstallDeps) || Boolean(installState?.installing)}
                    onClick={() => runGuideAction('guideInstallDeps', 'Server dependencies installed.', async () => {
                      await api.installDependencies();
                      await refreshSetupStatus();
                    })}
                  >
                    {installState?.installing ? 'Installing…' : 'Install dependencies'}
                  </button>
                  <button
                    disabled={Boolean(busy.guideInstallAddon)}
                    onClick={() => runGuideAction('guideInstallAddon', 'Blender addon installed.', async () => {
                      await api.installAddon();
                      await refreshSetupStatus();
                    })}
                  >
                    Install addon
                  </button>
                  <button
                    disabled={!blenderReady || Boolean(busy.guideLaunchBlender)}
                    onClick={() => runGuideAction('guideLaunchBlender', 'Blender launch requested.', async () => {
                      await api.launchBlender();
                    })}
                  >
                    Launch Blender
                  </button>
                  <button
                    disabled={Boolean(busy.guideDownloadBlender)}
                    onClick={() => runGuideAction(
                      'guideDownloadBlender',
                      (result) => `Opened Blender download page:\n${result.url}`,
                      async () => api.openBlenderDownload()
                    )}
                  >
                    Download Blender
                  </button>
                </div>
                {!nodeReady && <div className="guide-note error">{nodeRequiredHint}</div>}
                {!blenderReady && <div className="guide-note error">{blenderRequiredHint}</div>}
                {addonActivationSteps}
              </>
            )}

            {guideStep === 2 && (
              <>
                <div className="checklist">
                  <div className="check-item">
                    <span>Claude Desktop app installed</span>
                    {statusPill(claudeDesktopReady)}
                  </div>
                  <div className="check-item">
                    <span>Codex CLI installed</span>
                    {statusPill(codexReady)}
                  </div>
                  <div className="check-item">
                    <span>ChatGPT desktop app installed</span>
                    {statusPill(chatgptDesktopReady)}
                  </div>
                  <div className="check-item">
                    <span>Claude Desktop config connected</span>
                    {statusPill(setupChecks?.claudeConfigExists)}
                  </div>
                  <div className="check-item">
                    <span>Codex config connected</span>
                    {statusPill(setupChecks?.codexConfigExists)}
                  </div>
                </div>
                <div className="guide-actions">
                  <button
                    disabled={Boolean(busy.guideGetClaudeDesktop)}
                    onClick={() => runGuideAction(
                      'guideGetClaudeDesktop',
                      (result) => `Opened Claude Desktop download page:\n${result.url}`,
                      async () => api.openClaudeDownload()
                    )}
                  >
                    Get Claude Desktop
                  </button>
                  <button
                    disabled={!nodeReady || Boolean(busy.guideInstallCodexCli)}
                    onClick={() => runGuideAction(
                      'guideInstallCodexCli',
                      (result) => formatCodexInstallResult(result),
                      async () => {
                        const result = await api.installCodexCli();
                        await refreshSetupStatus();
                        return result;
                      }
                    )}
                  >
                    Install Codex CLI
                  </button>
                  <button
                    disabled={Boolean(busy.guideOpenCodexDocs)}
                    onClick={() => runGuideAction(
                      'guideOpenCodexDocs',
                      (result) => `Opened Codex install docs:\n${result.url}`,
                      async () => api.openCodexInstallDocs()
                    )}
                  >
                    Open Codex Install Docs
                  </button>
                  <button
                    disabled={Boolean(busy.guideGetChatgptDesktop)}
                    onClick={() => runGuideAction(
                      'guideGetChatgptDesktop',
                      (result) => `Opened ChatGPT desktop download page:\n${result.url}`,
                      async () => api.openChatgptDownload()
                    )}
                  >
                    Get ChatGPT Desktop
                  </button>
                  <button
                    disabled={!nodeReady || !claudeDesktopReady || Boolean(busy.guideConfigureClaude)}
                    onClick={() => runGuideAction('guideConfigureClaude', 'Claude Desktop config updated.', async () => {
                      await api.configureClaude();
                      await refreshSetupStatus();
                    })}
                  >
                    Connect Claude Desktop
                  </button>
                  <button
                    disabled={!nodeReady || !codexReady || Boolean(busy.guideConfigureCodex)}
                    onClick={() => runGuideAction('guideConfigureCodex', 'Codex config updated.', async () => {
                      await api.configureCodex();
                      await refreshSetupStatus();
                    })}
                  >
                    Connect Codex
                  </button>
                  <button
                    disabled={Boolean(busy.guideInstallAssistantPacks)}
                    onClick={() => runGuideAction('guideInstallAssistantPacks', 'Assistant templates installed.', async () => {
                      const result = await api.installAssistantPacks();
                      setGuideMessage(
                        [
                          `Assistant templates installed.`,
                          `Codex skills: ${result.codex.installed} -> ${result.codex.targetRoot}`,
                          `Claude skills: ${result.claudeSkills.installed} -> ${result.claudeSkills.targetRoot}`,
                          `Claude app local-agent copies: ${result.claudeLocalAgent.totalCopies} across ${result.claudeLocalAgent.sessionsFound} session(s)`,
                          `Claude app manifests updated: ${result.claudeLocalAgent.manifestsUpdated}`,
                          `Claude sub-agents: ${result.claudeSubAgents.installed} -> ${result.claudeSubAgents.targetRoot}`,
                        ].join('\n')
                      );
                    })}
                  >
                    Install Agents/Skills
                  </button>
                  <button
                    disabled={Boolean(busy.guideExportClaudeSkillsZip)}
                    onClick={() => runGuideAction('guideExportClaudeSkillsZip', 'Claude skills ZIP exported.', async () => {
                      const result = await api.exportClaudeSkillsZip();
                      setGuideMessage(
                        [
                          'Claude skills ZIP exported.',
                          `File: ${result.zipPath}`,
                          `Skills included: ${result.skillsIncluded}`,
                        ].join('\n')
                      );
                    })}
                  >
                    Export Claude Skills ZIP
                  </button>
                  <button
                    disabled={Boolean(busy.guideRefreshSetup2)}
                    onClick={() => runGuideAction('guideRefreshSetup2', 'Config status refreshed.', async () => {
                      await refreshSetupStatus();
                    })}
                  >
                    Refresh status
                  </button>
                </div>
                {!nodeReady && <div className="guide-note error">{nodeRequiredHint}</div>}
                {aiHostsRequiredHint && <div className="guide-note error">{aiHostsRequiredHint}</div>}
              </>
            )}

            {guideStep === 3 && (
              <>
                <div className="checklist">
                  <div className="check-item">
                    <span>RAG index file present</span>
                    {statusPill(setupChecks?.ragIndexPresent, 'Indexed', 'Not indexed')}
                  </div>
                  <div className="check-item">
                    <span>RAG chunks indexed</span>
                    {statusPill((setupData?.details?.ragChunksIndexed || 0) > 0, 'Ready', 'Empty')}
                  </div>
                </div>
                <div className="guide-actions">
                  <button
                    disabled={Boolean(busy.guideRefreshRag)}
                    onClick={() => runGuideAction('guideRefreshRag', 'RAG status refreshed.', async () => {
                      await refreshRagStatus();
                      await refreshSetupStatus();
                    })}
                  >
                    Refresh RAG status
                  </button>
                  <button
                    disabled={!nodeReady || Boolean(busy.guideBuildRag)}
                    onClick={() => runGuideAction('guideBuildRag', 'RAG index built.', async () => {
                      await api.ragIndex();
                      await refreshRagStatus();
                      await refreshSetupStatus();
                    })}
                  >
                    Build RAG index
                  </button>
                  <button
                    disabled={!nodeReady || Boolean(busy.guideRagSmoke)}
                    onClick={() => runGuideAction(
                      'guideRagSmoke',
                      ({ smokeQuery, result }) => {
                        const hitCount = Array.isArray(result?.results) ? result.results.length : 0;
                        const topHit = hitCount > 0 ? result.results[0] : null;
                        const summaryLines = [
                          `RAG smoke query complete (${hitCount} result(s)).`,
                          `Query: ${smokeQuery}`,
                        ];
                        if (topHit) {
                          summaryLines.push(
                            `Top hit: ${topHit.file_path}:${topHit.start_line}-${topHit.end_line} (score ${topHit.score})`
                          );
                        }
                        return summaryLines.join('\n');
                      },
                      async () => {
                        const smokeQuery = 'delete token safeguards';
                        const result = await api.ragQuery({
                          query: smokeQuery,
                          topK: 3,
                        });
                        return { smokeQuery, result };
                      }
                    )}
                  >
                    Run smoke query
                  </button>
                </div>
                {!nodeReady && <div className="guide-note error">{nodeRequiredHint}</div>}
                <pre className="status-box">{ragStatus}</pre>
              </>
            )}

            {guideStep === 4 && (
              <>
                <div className="checklist">
                  <div className="check-item">
                    <span>MCP server process</span>
                    {statusPill(setupChecks?.serverRunning, 'Running', 'Stopped')}
                  </div>
                  <div className="check-item">
                    <span>Watch files detected in temp dir</span>
                    {statusPill(tmpFiles.length > 0, 'Detected', 'Not yet')}
                  </div>
                </div>
                <div className="guide-actions">
                  <button
                    disabled={!nodeReady || Boolean(busy.guideStartServer)}
                    onClick={() => runGuideAction('guideStartServer', 'Server started in stdio mode.', async () => {
                      await api.startServer({
                        transport: 'stdio',
                        host: '127.0.0.1',
                        port: '3030',
                        authToken: '',
                      });
                      await refreshSetupStatus();
                    })}
                  >
                    Start server
                  </button>
                  <button
                    className={buttonClass(true)}
                    disabled={Boolean(busy.guideStopServer)}
                    onClick={() => runGuideAction('guideStopServer', 'Stop signal sent to server.', async () => {
                      await api.stopServer();
                      await refreshSetupStatus();
                    })}
                  >
                    Stop server
                  </button>
                  <button
                    disabled={Boolean(busy.guideFetchSnapshot)}
                    onClick={() => runGuideAction('guideFetchSnapshot', 'Snapshot request complete.', async () => {
                      await api.fetchSceneSnapshot();
                      await refreshTmpFiles();
                    })}
                  >
                    Fetch scene snapshot
                  </button>
                </div>
                {!nodeReady && <div className="guide-note error">{nodeRequiredHint}</div>}
              </>
            )}

            {guideStep === 5 && (
              <div className="guide-actions">
                <button onClick={completeOnboarding}>Open full control panel</button>
              </div>
            )}

            {guideMessage && <div className="guide-note success">{guideMessage}</div>}
            {guideError && <div className="guide-note error">{guideError}</div>}
            {guideRunAllState && !guideRunAllState.running && guideRunAllState.remaining.length > 0 && (
              <div className="guide-note error">
                <strong>Still needed:</strong>
                <ul className="guide-remaining-list">
                  {guideRunAllState.remaining.map((item, index) => (
                    <li key={`${item}-${index}`}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="guide-nav">
              <button
                className="ghost"
                disabled={guideStep === 0 || guideAutomationRunning}
                onClick={() => setGuideStep((current) => Math.max(0, current - 1))}
              >
                Back
              </button>
              <button
                disabled={guideStep === onboardingSteps.length - 1 || guideAutomationRunning}
                onClick={() => setGuideStep((current) => Math.min(onboardingSteps.length - 1, current + 1))}
              >
                Next
              </button>
            </div>
          </div>
        </section>
      </main>
      </>
    );
  }

  return (
    <>
      {installBanner}
      {nodeInstallBanner}
      <main className="app-shell">
        <div className={`app-shell-body${sidebarCollapsed && !isNarrowViewport ? ' sidebar-collapsed' : ''}`}>
          {isNarrowViewport && sidebarDrawerOpen && (
            <button
              className="sidebar-backdrop"
              aria-label="Close sidebar"
              onClick={() => setSidebarDrawerOpen(false)}
            />
          )}
          <aside className={`sidebar card${sidebarExpanded ? ' expanded' : ' collapsed'}${isNarrowViewport && sidebarDrawerOpen ? ' mobile-open' : ''}`}>
            <div className="sidebar-brand">
              <div className="title-with-icon">
                <img src={appIcon} alt="" className="app-title-icon" />
                <div className="sidebar-brand-copy">
                  <h1>Blender MCP Launcher</h1>
                  <p>{promptingReady ? 'Chat-first workspace' : 'Setup-first workspace'}</p>
                </div>
              </div>
              <button
                className="ghost sidebar-toggle"
                onClick={() => {
                  if (isNarrowViewport) {
                    setSidebarDrawerOpen(false);
                  } else {
                    setSidebarCollapsed((current) => !current);
                  }
                }}
              >
                {isNarrowViewport ? <X size={24}/> : (sidebarCollapsed ? <ChevronRight size={24}/> : <ChevronLeft size={24}/>)}
              </button>
            </div>

            <div className="sidebar-status">
              <div className="sidebar-status-row">
                <span>Prompting</span>
                {statusPill(promptingReady)}
              </div>
              <div className="sidebar-status-row">
                <span>Blender</span>
                {statusPill(blenderReady)}
              </div>
              <div className="sidebar-status-row">
                <span>Server</span>
                {statusPill(setupChecks?.serverRunning, 'Running', 'Stopped')}
              </div>
              <div className="sidebar-status-row">
                <span>RAG</span>
                {statusPill(setupChecks?.ragIndexPresent, 'Indexed', 'Not indexed')}
              </div>
            </div>

            <nav className="sidebar-nav" aria-label="Launcher navigation">
              {workspaceItems.map((item) => {
                const ItemIcon = item.icon;
                return (
                <button
                  key={item.id}
                  className={currentWorkspace === item.id ? 'sidebar-nav-button active' : 'sidebar-nav-button'}
                  aria-label={item.label}
                  title={sidebarCollapsed && !isNarrowViewport ? item.label : undefined}
                  onClick={() => {
                    setActiveWorkspace(item.target);
                    if (isNarrowViewport) {
                      setSidebarDrawerOpen(false);
                    }
                  }}
                >
                  <ItemIcon className="sidebar-nav-icon" aria-hidden="true" />
                  <div className="sidebar-nav-copy">
                    <span className="sidebar-nav-label">{item.label}</span>
                    <small>{item.helper}</small>
                  </div>
                </button>
                );
              })}
            </nav>

            <div className="sidebar-footer">
              <button
                className="ghost"
                onClick={() => {
                  setShowOnboarding(true);
                  setSidebarDrawerOpen(false);
                }}
              >
                {sidebarCollapsed && !isNarrowViewport ? 'Guide' : 'Show onboarding'}
              </button>
            </div>
          </aside>

          <section className="workspace-area">
            <WorkspaceHeader
              title={workspaceMeta.title}
              description={workspaceMeta.description}
              promptingReady={promptingReady}
              blenderReady={blenderReady}
              serverRunning={Boolean(setupChecks?.serverRunning)}
              ragReady={Boolean(setupChecks?.ragIndexPresent)}
              nodeReady={nodeReady}
              serverBusy={busy.headerStartServer}
              refreshBusy={busy.workspaceRefresh}
              isNarrowViewport={isNarrowViewport}
              sidebarDrawerOpen={sidebarDrawerOpen}
              onToggleSidebar={() => setSidebarDrawerOpen((current) => !current)}
              onStartServer={handleStartServerFromHeader}
              onRefreshWorkspace={() => runWithBusy('workspaceRefresh', async () => {
                try {
                  await refreshSetupStatus();
                  await refreshRagStatus();
                  await refreshTmpFiles();
                } catch (error) {
                  setSetupStatus(`Workspace refresh failed:\n${String(error.message || error)}`);
                }
              })}
            />

            <div className="workspace-content">
              {currentWorkspace === 'setup' && (
                <section className="card">
                  <div className="section-title">
                    {/* <span className="section-number">1</span> */}
                    <h2>Setup Checks</h2>
                  </div>
                  <div className="card-content">
                    <div className="actions">
                      <button
                        disabled={Boolean(busy.checkSetup)}
                        onClick={() => runWithBusy('checkSetup', async () => {
                          try {
                            await refreshSetupStatus();
                          } catch (error) {
                            setSetupStatus(String(error.message || error));
                          }
                        })}
                      >
                        Refresh Status
                      </button>
                      <button
                        disabled={!blenderReady || Boolean(busy.launchBlender)}
                        onClick={() => runWithBusy('launchBlender', async () => {
                          try {
                            const result = await api.launchBlender();
                            setSetupStatus(`Blender launch requested:\n${result.blenderAppPath}`);
                            await refreshSetupStatus();
                          } catch (error) {
                            setSetupStatus(`Blender launch failed:\n${String(error.message || error)}`);
                          }
                        })}
                      >
                        Launch Blender
                      </button>
                      <button
                        disabled={Boolean(busy.downloadBlender)}
                        onClick={() => runWithBusy('downloadBlender', async () => {
                          try {
                            const result = await api.openBlenderDownload();
                            setSetupStatus(`Opened Blender download page:\n${result.url}`);
                          } catch (error) {
                            setSetupStatus(`Failed to open Blender download page:\n${String(error.message || error)}`);
                          }
                        })}
                      >
                        Download Blender
                      </button>
                      <button
                        disabled={Boolean(busy.installNode)}
                        onClick={() => runWithBusy('installNode', async () => {
                          try {
                            const result = await api.installNode();
                            if (result?.alreadyRunning) {
                              setSetupStatus('Node.js install is already running in the background.');
                            } else {
                              setSetupStatus('Node.js install started in background. You can continue using the launcher while it runs.');
                            }
                          } catch (error) {
                            setSetupStatus(`Node install failed:\n${String(error.message || error)}`);
                          }
                        })}
                      >
                        Install Node.js
                      </button>
                      <button
                        disabled={!nodeReady || Boolean(busy.installDeps) || Boolean(installState?.installing)}
                        onClick={() => runWithBusy('installDeps', async () => {
                          try {
                            const output = await api.installDependencies();
                            setSetupStatus(`Dependencies installed.\n\n${output}`);
                            await refreshSetupStatus();
                          } catch (error) {
                            setSetupStatus(`Dependency install failed:\n${String(error.message || error)}`);
                          }
                        })}
                      >
                        {installState?.installing ? 'Installing…' : 'Install MCP Dependencies'}
                      </button>
                      <button
                        disabled={Boolean(busy.installAddon)}
                        onClick={() => runWithBusy('installAddon', async () => {
                          try {
                            const file = await api.installAddon();
                            setSetupStatus(`Addon installed to:\n${file}`);
                            await refreshSetupStatus();
                          } catch (error) {
                            setSetupStatus(`Addon install failed:\n${String(error.message || error)}`);
                          }
                        })}
                      >
                        Install Blender Addon
                      </button>
                    </div>
                    {!blenderReady && <pre className="status-hint">{blenderRequiredHint}</pre>}
                    {!nodeReady && <pre className="status-hint">{nodeRequiredHint}</pre>}
                    {addonActivationSteps}
                    {promptingReady && <pre className="status-hint workspace-note">Setup looks ready — use Chat in the sidebar to start prompting Blender.</pre>}
                    <pre className="status-box">{setupStatus}</pre>
                  </div>
                </section>
              )}

              {currentWorkspace === 'connections' && (
                <section className="card">
                  <div className="section-title">
                    {/* <span className="section-number">2</span> */}
                    <h2>Configure Hosts</h2>
                  </div>
                  <div className="card-content">
                    <div className="checklist">
                      <div className="check-item">
                        <span>Claude Desktop app installed</span>
                        {statusPill(claudeDesktopReady)}
                      </div>
                      <div className="check-item">
                        <span>Codex CLI installed</span>
                        {statusPill(codexReady)}
                      </div>
                      <div className="check-item">
                        <span>ChatGPT desktop app installed</span>
                        {statusPill(chatgptDesktopReady)}
                      </div>
                    </div>
                    <div className="actions">
                      <button
                        disabled={Boolean(busy.getClaudeDesktop)}
                        onClick={() => runWithBusy('getClaudeDesktop', async () => {
                          try {
                            const result = await api.openClaudeDownload();
                            setConfigStatus(`Opened Claude Desktop download page:\n${result.url}`);
                          } catch (error) {
                            setConfigStatus(`Failed to open Claude Desktop download page:\n${String(error.message || error)}`);
                          }
                        })}
                      >
                        Get Claude Desktop
                      </button>
                      <button
                        disabled={!nodeReady || Boolean(busy.installCodexCli)}
                        onClick={() => runWithBusy('installCodexCli', async () => {
                          try {
                            const result = await api.installCodexCli();
                            setConfigStatus(formatCodexInstallResult(result));
                            await refreshSetupStatus();
                          } catch (error) {
                            setConfigStatus(`Codex install failed:\n${String(error.message || error)}`);
                          }
                        })}
                      >
                        Install Codex CLI
                      </button>
                      <button
                        disabled={Boolean(busy.openCodexDocs)}
                        onClick={() => runWithBusy('openCodexDocs', async () => {
                          try {
                            const result = await api.openCodexInstallDocs();
                            setConfigStatus(`Opened Codex install docs:\n${result.url}`);
                          } catch (error) {
                            setConfigStatus(`Failed to open Codex install docs:\n${String(error.message || error)}`);
                          }
                        })}
                      >
                        Open Codex Install Docs
                      </button>
                      <button
                        disabled={Boolean(busy.getChatgptDesktop)}
                        onClick={() => runWithBusy('getChatgptDesktop', async () => {
                          try {
                            const result = await api.openChatgptDownload();
                            setConfigStatus(`Opened ChatGPT desktop download page:\n${result.url}`);
                          } catch (error) {
                            setConfigStatus(`Failed to open ChatGPT download page:\n${String(error.message || error)}`);
                          }
                        })}
                      >
                        Get ChatGPT Desktop
                      </button>
                      <button
                        disabled={!nodeReady || !claudeDesktopReady || Boolean(busy.configureClaude)}
                        onClick={() => runWithBusy('configureClaude', async () => {
                          try {
                            const result = await api.configureClaude();
                            const backupNote = result.backupPath
                              ? `\nBackup created:\n${result.backupPath}`
                              : '\nNo previous file existed, so no backup was created.';
                            setConfigStatus(`Claude Desktop config updated:\n${result.path}${backupNote}\n\nRestart Claude Desktop to reload MCP servers.`);
                            await refreshSetupStatus();
                          } catch (error) {
                            setConfigStatus(`Failed to configure Claude:\n${String(error.message || error)}`);
                          }
                        })}
                      >
                        Configure Claude Desktop
                      </button>
                      <button
                        disabled={Boolean(busy.restoreClaude)}
                        onClick={() => runWithBusy('restoreClaude', async () => {
                          try {
                            const result = await api.restoreClaudeConfig();
                            setConfigStatus(`Claude config restored:\n${result.path}\n\nRestored from:\n${result.restoredFrom}`);
                            await refreshSetupStatus();
                          } catch (error) {
                            setConfigStatus(`Failed to restore Claude config:\n${String(error.message || error)}`);
                          }
                        })}
                      >
                        Restore Claude Backup
                      </button>
                      <button
                        disabled={!nodeReady || !codexReady || Boolean(busy.configureCodex)}
                        onClick={() => runWithBusy('configureCodex', async () => {
                          try {
                            const result = await api.configureCodex();
                            const backupNote = result.backupPath
                              ? `\nBackup created:\n${result.backupPath}`
                              : '\nNo previous file existed, so no backup was created.';
                            setConfigStatus(`Codex config updated:\n${result.path}${backupNote}`);
                            await refreshSetupStatus();
                          } catch (error) {
                            setConfigStatus(`Failed to configure Codex:\n${String(error.message || error)}`);
                          }
                        })}
                      >
                        Configure Codex
                      </button>
                      <button
                        disabled={Boolean(busy.restoreCodex)}
                        onClick={() => runWithBusy('restoreCodex', async () => {
                          try {
                            const result = await api.restoreCodexConfig();
                            setConfigStatus(`Codex config restored:\n${result.path}\n\nRestored from:\n${result.restoredFrom}`);
                            await refreshSetupStatus();
                          } catch (error) {
                            setConfigStatus(`Failed to restore Codex config:\n${String(error.message || error)}`);
                          }
                        })}
                      >
                        Restore Codex Backup
                      </button>
                      <button
                        disabled={Boolean(busy.installAssistantPacks)}
                        onClick={() => runWithBusy('installAssistantPacks', async () => {
                          try {
                            const result = await api.installAssistantPacks();
                            setConfigStatus(
                              [
                                'Assistant templates installed.',
                                '',
                                `Codex skills: ${result.codex.installed}`,
                                `Target: ${result.codex.targetRoot}`,
                                '',
                                `Claude skills: ${result.claudeSkills.installed}`,
                                `Target: ${result.claudeSkills.targetRoot}`,
                                '',
                                `Claude app local-agent copies: ${result.claudeLocalAgent.totalCopies}`,
                                `Sessions detected: ${result.claudeLocalAgent.sessionsFound}`,
                                `Manifests updated: ${result.claudeLocalAgent.manifestsUpdated}`,
                                '',
                                `Claude sub-agents: ${result.claudeSubAgents.installed}`,
                                `Target: ${result.claudeSubAgents.targetRoot}`,
                              ].join('\n')
                            );
                          } catch (error) {
                            setConfigStatus(`Failed to install assistant templates:\n${String(error.message || error)}`);
                          }
                        })}
                      >
                        Install Agents/Skills
                      </button>
                      <button
                        disabled={Boolean(busy.exportClaudeSkillsZip)}
                        onClick={() => runWithBusy('exportClaudeSkillsZip', async () => {
                          try {
                            const result = await api.exportClaudeSkillsZip();
                            setConfigStatus(
                              [
                                'Claude skills ZIP exported.',
                                '',
                                `File: ${result.zipPath}`,
                                `Skills included: ${result.skillsIncluded}`,
                                `Source: ${result.sourceRoot}`,
                              ].join('\n')
                            );
                          } catch (error) {
                            setConfigStatus(`Failed to export Claude skills ZIP:\n${String(error.message || error)}`);
                          }
                        })}
                      >
                        Export Claude Skills ZIP
                      </button>
                    </div>
                    {!nodeReady && <pre className="status-hint">{nodeRequiredHint}</pre>}
                    {aiHostsRequiredHint && <pre className="status-hint">{aiHostsRequiredHint}</pre>}
                    <pre className="status-box">{configStatus}</pre>
                  </div>
                </section>
              )}

              {currentWorkspace === 'server' && (
                <section className="card">
                  <div className="section-title">
                    {/* <span className="section-number">3</span> */}
                    <h2>Server Control</h2>
                  </div>
                  <div className="card-content">
                    <div className="server-form">
                      <label>
                        Transport
                        <select value={transport} onChange={(event) => setTransport(event.target.value)}>
                          <option value="stdio">stdio (Claude/Codex)</option>
                          <option value="http">http (ChatGPT connector)</option>
                        </select>
                      </label>
                      <label>
                        Host
                        <input value={host} onChange={(event) => setHost(event.target.value)} />
                      </label>
                      <label>
                        Port
                        <input value={port} onChange={(event) => setPort(event.target.value)} />
                      </label>
                      <label>
                        Auth Token (optional)
                        <input
                          placeholder="MCP_AUTH_TOKEN"
                          value={authToken}
                          onChange={(event) => setAuthToken(event.target.value)}
                        />
                      </label>
                    </div>
                    <div className="actions">
                      <button
                        disabled={!nodeReady || Boolean(busy.startServer)}
                        onClick={() => handleStartServerFromHeader('startServer')}
                      >
                        Start Server
                      </button>
                      <button
                        className={buttonClass(true)}
                        disabled={Boolean(busy.stopServer)}
                        onClick={() => runWithBusy('stopServer', async () => {
                          try {
                            await api.stopServer();
                            setServerStatus('Stop signal sent.');
                            await refreshSetupStatus();
                          } catch (error) {
                            setServerStatus(`Stop failed:\n${String(error.message || error)}`);
                          }
                        })}
                      >
                        Stop Server
                      </button>
                    </div>
                    {!nodeReady && <pre className="status-hint">{nodeRequiredHint}</pre>}
                    <pre className="status-box">{serverStatus}</pre>
                    <pre className="log-box">{serverLogs}</pre>
                  </div>
                </section>
              )}

              {currentWorkspace === 'rag' && (
                <section className="card">
                  <div className="section-title">
                    {/* <span className="section-number">4</span> */}
                    <h2>RAG Control</h2>
                  </div>
                  <div className="card-content">
                    <div className="server-form">
                      <label>
                        Query text
                        <input
                          value={ragQueryText}
                          onChange={(event) => setRagQueryText(event.target.value)}
                          placeholder="What are the Blender delete safeguards?"
                        />
                      </label>
                      <label>
                        Top K
                        <input
                          value={ragTopK}
                          onChange={(event) => setRagTopK(event.target.value)}
                          placeholder="5"
                        />
                      </label>
                    </div>
                    <div className="actions">
                      <button
                        disabled={Boolean(busy.ragRefreshStatus)}
                        onClick={() => runWithBusy('ragRefreshStatus', async () => {
                          try {
                            await refreshRagStatus();
                          } catch (error) {
                            setRagStatus(`Failed to read RAG status:\n${String(error.message || error)}`);
                          }
                        })}
                      >
                        Refresh RAG Status
                      </button>
                      <button
                        disabled={!nodeReady || Boolean(busy.ragIndex)}
                        onClick={() => runWithBusy('ragIndex', async () => {
                          try {
                            const result = await api.ragIndex();
                            setRagStatus(formatRagStatus(result.ragStatus));
                            setRagOutput(
                              [
                                'RAG index complete.',
                                '',
                                `Store: ${result.ragStatus?.storePath || '(unknown)'}`,
                                `Files indexed: ${result.indexResult?.files_indexed ?? result.ragStatus?.filesIndexed ?? 0}`,
                                `Chunks indexed: ${result.indexResult?.chunks_indexed ?? result.ragStatus?.chunksIndexed ?? 0}`,
                                `Indexed at: ${result.indexResult?.indexed_at || result.ragStatus?.indexedAt || '(unknown)'}`,
                                `Missing patterns: ${(result.indexResult?.missing_patterns || []).join(', ') || '(none)'}`,
                              ].join('\n')
                            );
                            await refreshSetupStatus();
                          } catch (error) {
                            setRagOutput(`RAG index failed:\n${String(error.message || error)}`);
                          }
                        })}
                      >
                        Build/Refresh RAG Index
                      </button>
                      <button
                        disabled={!nodeReady || Boolean(busy.ragQuery)}
                        onClick={() => runWithBusy('ragQuery', async () => {
                          try {
                            const topKValue = Number(ragTopK);
                            const topK = Number.isFinite(topKValue) ? topKValue : 5;
                            const result = await api.ragQuery({
                              query: ragQueryText,
                              topK,
                            });

                            setRagOutput(JSON.stringify(result, null, 2));
                          } catch (error) {
                            setRagOutput(`RAG query failed:\n${String(error.message || error)}`);
                          }
                        })}
                      >
                        Run RAG Query
                      </button>
                    </div>
                    {!nodeReady && <pre className="status-hint">{nodeRequiredHint}</pre>}
                    <pre className="status-box">{ragStatus}</pre>
                    <pre className="log-box">{ragOutput}</pre>
                  </div>
                </section>
              )}

              {currentWorkspace === 'chat' && (
                <ChatWorkspace
                  api={api}
                  busy={busy}
                  promptingReady={promptingReady}
                  promptingRequiredHint={promptingRequiredHint}
                  runWithBusy={runWithBusy}
                  refreshTmpFiles={refreshTmpFiles}
                  setSelectedTmpFile={setSelectedTmpFile}
                  {...promptWorkspace}
                />
              )}

              {currentWorkspace === 'files' && (
                <section className="card">
                  <div className="section-title">
                    {/* <span className="section-number">6</span> */}
                    <h2>Temp File Inspector</h2>
                  </div>
                  <div className="card-content">
                    <div className="actions">
                      <button
                        disabled={Boolean(busy.tmpRefresh)}
                        onClick={() => runWithBusy('tmpRefresh', async () => {
                          try {
                            await refreshTmpFiles();
                          } catch (error) {
                            setTmpStatus(`Failed to list temp files:\n${String(error.message || error)}`);
                          }
                        })}
                      >
                        Refresh Temp Files
                      </button>
                      <button
                        disabled={Boolean(busy.tmpOpen)}
                        onClick={() => runWithBusy('tmpOpen', async () => {
                          try {
                            if (!selectedTmpFile) {
                              setTmpStatus('No /tmp file is selected.');
                              return;
                            }
                            const result = await api.readTmpFile(selectedTmpFile);
                            setTmpStatus(result.truncated
                              ? `Opened ${result.path} (${result.size} bytes, showing first 307200 bytes)`
                              : `Opened ${result.path} (${result.size} bytes)`);
                            setTmpContent(result.content || '(file is empty)');
                          } catch (error) {
                            setTmpStatus(`Failed to read /tmp file:\n${String(error.message || error)}`);
                          }
                        })}
                      >
                        Open Selected File
                      </button>
                      <button
                        disabled={Boolean(busy.tmpFetchSnapshot)}
                        onClick={() => runWithBusy('tmpFetchSnapshot', async () => {
                          try {
                            setTmpStatus('Requesting live scene snapshot from Blender...');
                            const response = await api.fetchSceneSnapshot();
                            const files = await refreshTmpFiles();
                            const hasResultFile = files.some((file) => file.path === response.path);
                            if (hasResultFile) {
                              setSelectedTmpFile(response.path);
                            }

                            const sceneCount = Array.isArray(response.result.scene_objects) ? response.result.scene_objects.length : 0;
                            setTmpStatus(`Fetched snapshot (${sceneCount} scene object(s), request_id=${response.requestId}).`);
                            setTmpContent(JSON.stringify(response.result, null, 2));
                          } catch (error) {
                            setTmpStatus(`Failed to fetch scene snapshot:\n${String(error.message || error)}`);
                          }
                        })}
                      >
                        Fetch Scene Snapshot
                      </button>
                      <button
                        className={buttonClass(true)}
                        disabled={Boolean(busy.tmpResetResult)}
                        onClick={() => runWithBusy('tmpResetResult', async () => {
                          try {
                            const result = await api.resetResultFile();
                            const files = await refreshTmpFiles();
                            const hasResultFile = files.some((file) => file.path === result.path);
                            if (hasResultFile) {
                              setSelectedTmpFile(result.path);
                            }
                            setTmpStatus(`Reset ${result.path}`);
                            setTmpContent(JSON.stringify(result.payload, null, 2));
                          } catch (error) {
                            setTmpStatus(`Failed to reset result file:\n${String(error.message || error)}`);
                          }
                        })}
                      >
                        Reset blender_result.json
                      </button>
                    </div>
                    <label>
                      Relevant temp file
                      <select value={selectedTmpFile} onChange={(event) => setSelectedTmpFile(event.target.value)}>
                        {tmpFiles.length === 0 && (
                          <option value="">No relevant files found in temp dir</option>
                        )}
                        {tmpFiles.map((file) => (
                          <option key={file.path} value={file.path}>
                            {`${file.name} (${file.size} bytes, ${file.modifiedAt})`}
                          </option>
                        ))}
                      </select>
                    </label>
                    <pre className="status-box">{tmpStatus}</pre>
                    <pre className="status-hint">{selectedTmpLabel}</pre>
                    <pre className="log-box">{tmpContent}</pre>
                  </div>
                </section>
              )}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
