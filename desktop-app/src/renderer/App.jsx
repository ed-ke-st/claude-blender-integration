import { useEffect, useMemo, useState } from 'react';
import appIcon from './assets/app-icon.svg';

const ONBOARDING_COMPLETE_KEY = 'blenderMcpLauncher.onboardingComplete.v1';

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
  const [setupData, setSetupData] = useState(null);

  const [transport, setTransport] = useState('stdio');
  const [host, setHost] = useState('127.0.0.1');
  const [port, setPort] = useState('3030');
  const [authToken, setAuthToken] = useState('');

  const [busy, setBusy] = useState({});

  const [installState, setInstallState] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(() => !readOnboardingComplete());
  const [guideStep, setGuideStep] = useState(0);
  const [guideMessage, setGuideMessage] = useState('');
  const [guideError, setGuideError] = useState('');

  const api = useMemo(() => window.launcherApi, []);

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
    };
  }, [api]);

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
        await fn();
        setGuideMessage(successMessage);
      } catch (error) {
        setGuideError(String(error.message || error));
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
        {!installState.installing && !installState.error && 'Dependencies installed successfully.'}
        {installState.error && `Dependency install failed: ${installState.error}`}
      </span>
      {!installState.installing && (
        <button className="ghost" onClick={() => setInstallState(null)}>Dismiss</button>
      )}
    </div>
  );

  if (showOnboarding) {
    return (
      <>
        {installBanner}
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

            {guideStep === 0 && (
              <div className="guide-actions">
                <button onClick={() => setGuideStep(1)}>Start setup</button>
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
                    <span>Blender found on this Mac</span>
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
                    disabled={Boolean(busy.guideInstallDeps) || Boolean(installState?.installing)}
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
                    disabled={Boolean(busy.guideLaunchBlender)}
                    onClick={() => runGuideAction('guideLaunchBlender', 'Blender launch requested.', async () => {
                      await api.launchBlender();
                    })}
                  >
                    Launch Blender
                  </button>
                </div>
                {addonActivationSteps}
              </>
            )}

            {guideStep === 2 && (
              <>
                <div className="checklist">
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
                    disabled={Boolean(busy.guideConfigureClaude)}
                    onClick={() => runGuideAction('guideConfigureClaude', 'Claude Desktop config updated.', async () => {
                      await api.configureClaude();
                      await refreshSetupStatus();
                    })}
                  >
                    Connect Claude Desktop
                  </button>
                  <button
                    disabled={Boolean(busy.guideConfigureCodex)}
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
              </>
            )}

            {guideStep === 3 && (
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
                    disabled={Boolean(busy.guideStartServer)}
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
              </>
            )}

            {guideStep === 4 && (
              <div className="guide-actions">
                <button onClick={completeOnboarding}>Open full control panel</button>
              </div>
            )}

            {guideMessage && <div className="guide-note success">{guideMessage}</div>}
            {guideError && <div className="guide-note error">{guideError}</div>}

            <div className="guide-nav">
              <button
                className="ghost"
                disabled={guideStep === 0}
                onClick={() => setGuideStep((current) => Math.max(0, current - 1))}
              >
                Back
              </button>
              <button
                disabled={guideStep === onboardingSteps.length - 1}
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
      <main>
      <header className="app-header">
        <div className="title-with-icon">
          <img src={appIcon} alt="" className="app-title-icon" />
          <div>
            <h1>Blender MCP Launcher</h1>
            <p>Mac control panel for setup, configuration, and MCP server runtime.</p>
          </div>
        </div>
        <button className="ghost" onClick={() => setShowOnboarding(true)}>Show onboarding</button>
      </header>

      <section className="card">
        <div className="section-title">
          <span className="section-number">1</span>
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
              disabled={Boolean(busy.launchBlender)}
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
              disabled={Boolean(busy.installDeps) || Boolean(installState?.installing)}
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
          {addonActivationSteps}
          <pre className="status-box">{setupStatus}</pre>
        </div>
      </section>

      <section className="card">
        <div className="section-title">
          <span className="section-number">2</span>
          <h2>Configure Hosts</h2>
        </div>
        <div className="card-content">
          <div className="actions">
            <button
              disabled={Boolean(busy.configureClaude)}
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
              disabled={Boolean(busy.configureCodex)}
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
          <pre className="status-box">{configStatus}</pre>
        </div>
      </section>

      <section className="card">
        <div className="section-title">
          <span className="section-number">3</span>
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
              disabled={Boolean(busy.startServer)}
              onClick={() => runWithBusy('startServer', async () => {
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
              })}
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
          <pre className="status-box">{serverStatus}</pre>
          <pre className="log-box">{serverLogs}</pre>
        </div>
      </section>

      <section className="card">
        <div className="section-title">
          <span className="section-number">4</span>
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
              disabled={Boolean(busy.ragIndex)}
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
              disabled={Boolean(busy.ragQuery)}
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
          <pre className="status-box">{ragStatus}</pre>
          <pre className="log-box">{ragOutput}</pre>
        </div>
      </section>

      <section className="card">
        <div className="section-title">
          <span className="section-number">5</span>
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
    </main>
    </>
  );
}
