import { useEffect, useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import {
  defaultPromptModel,
  formatClaudeRunResult,
  formatCodexRunResult,
  formatPromptAttemptDetails,
  formatPromptAttemptLabel,
  formatPromptHistoryTimestamp,
  formatPromptProviderLabel,
  formatPromptRunResult,
} from '../promptWorkspace';

function ChatTurnDetails({ entry }) {
  const attempts = Array.isArray(entry.attempts) ? entry.attempts : [];
  const progressEvents = Array.isArray(entry.progressEvents) ? entry.progressEvents : [];

  if (entry.status === 'running') {
    return (
      <>
        <div className="chat-message-note">{entry.summary || 'Running...'}</div>
        <ChatProgressEvents events={progressEvents} />
      </>
    );
  }

  if (entry.status === 'error') {
    return <pre className="chat-message-summary">{entry.summary}</pre>;
  }

  return (
    <>
      <pre className="chat-message-summary">{entry.summary}</pre>
      {(progressEvents.length > 0 || attempts.length > 0 || entry.code || entry.blenderResultText) && (
        <details className="chat-details">
          <summary>Execution details</summary>
          <ChatProgressEvents events={progressEvents} />
          {attempts.length > 0 && (
            <div className="history-panel">
              <div className="history-header">
                <strong>Agent attempt trace</strong>
                <span>{attempts.length} attempt(s)</span>
              </div>
              <div className="history-list">
                {attempts.map((attempt, index) => (
                  <div className="history-item" key={`${attempt.requestId || attempt.status || 'attempt'}-${index}`}>
                    <div className="history-meta">
                      <strong>{formatPromptAttemptLabel(attempt)}</strong>
                      <span>{attempt.requestId || attempt.stage || 'no request id'}</span>
                    </div>
                    <pre className="history-summary">{formatPromptAttemptDetails(attempt)}</pre>
                  </div>
                ))}
              </div>
            </div>
          )}
          {entry.code && <pre className="log-box">{entry.code}</pre>}
          {entry.blenderResultText && <pre className="log-box">{entry.blenderResultText}</pre>}
        </details>
      )}
    </>
  );
}

function ChatProgressEvents({ events }) {
  if (!events.length) {
    return null;
  }

  return (
    <div className="chat-progress-list">
      {events.slice(-12).map((event, index) => (
        <div className={`chat-progress-item ${event.type || 'event'}`} key={`${event.timestamp || 'event'}-${index}`}>
          <span className="chat-progress-dot" />
          <span>{event.message || 'Working...'}</span>
        </div>
      ))}
    </div>
  );
}

const SAMPLE_BLENDER_PROMPT = `Create a simple animated Blender scene:

1. Add two smooth spheres side by side, centered near the origin.
2. Make the left sphere blue glass with high transparency, low roughness, and IOR around 1.45.
3. Make the right sphere brushed gold metal with high metallic value and medium roughness.
4. Animate both spheres floating gently up and down over frames 1-120, with the motion offset so they do not move in sync.
5. Add a camera looking at both spheres and frame them clearly.
6. Add soft area lighting and a simple neutral floor.
7. Set the scene frame range to 1-120 and, if possible, start playback after creating the animation.`;

function ChatMessageList({ promptConversation, onUseSamplePrompt }) {
  if (!promptConversation.length) {
    return (
      <div className="chat-empty">
        <div className="chat-empty-content">
          <strong>Start a Blender chat</strong>
          <span>Clear step-by-step prompts usually work best. Include object details, materials, animation, camera, lighting, and any constraints.</span>
          <div className="chat-empty-tips">
            <span>Good prompt shape:</span>
            <code>Create [objects], apply [materials], animate [motion/timing], add [camera/lights], set [constraints].</code>
          </div>
          <div className="chat-empty-sample">
            <span>Sample prompt</span>
            <pre>{SAMPLE_BLENDER_PROMPT}</pre>
            <button className="ghost" onClick={onUseSamplePrompt}>Use sample prompt</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-message-list">
      {promptConversation.map((entry) => (
        <div className="chat-turn" key={entry.id}>
          <div className="chat-message user">
            <div className="chat-message-meta">
              <strong>You</strong>
              <span>{formatPromptHistoryTimestamp(entry.timestamp)}</span>
            </div>
            <pre>{entry.prompt}</pre>
          </div>
          <div className={`chat-message assistant ${entry.status || 'done'}`}>
            <div className="chat-message-meta">
              <strong>
                {formatPromptProviderLabel(entry.provider)}
                {entry.model ? ` · ${entry.model}` : ''}
              </strong>
              <span>{entry.status === 'running' ? 'running' : formatPromptHistoryTimestamp(entry.completedAt || entry.timestamp)}</span>
            </div>
            <ChatTurnDetails entry={entry} />
          </div>
        </div>
      ))}
    </div>
  );
}

function formatActiveAgentLabel({
  promptRunner,
  promptProvider,
  promptModel,
  codexModel,
  claudeModel,
}) {
  if (promptRunner === 'codex') {
    return `Codex CLI${codexModel ? ` · ${codexModel}` : ''}`;
  }

  if (promptRunner === 'claude') {
    return `Claude Code CLI${claudeModel ? ` · ${claudeModel}` : ''}`;
  }

  return `${formatPromptProviderLabel(promptProvider)} · ${promptModel || 'default model'}`;
}

export function ChatWorkspace({
  api,
  busy,
  promptingReady,
  promptingRequiredHint,
  runWithBusy,
  refreshTmpFiles,
  setSelectedTmpFile,
  promptState,
  promptActions,
  applyPromptProfile,
  buildPromptProfile,
}) {
  const {
    promptRunner,
    promptText,
    promptContext,
    promptProvider,
    promptApiKey,
    promptModel,
    codexModel,
    codexSandbox,
    codexApproval,
    claudeModel,
    claudePermissionMode,
    claudeAllowBlenderTools,
    promptAgentMode,
    promptMaxAttempts,
    promptUseHistory,
    promptUseSceneSnapshot,
    promptUseRag,
    promptRagTopK,
    promptProfileName,
    promptProfiles,
    selectedPromptProfile,
    selectedPromptProfileId,
    promptStatus,
    promptCode,
    promptResultRaw,
    promptAttemptTrace,
    promptConversation,
  } = promptState;

  const {
    setPromptRunner,
    setPromptText,
    setPromptContext,
    setPromptProvider,
    setPromptApiKey,
    setPromptModel,
    setCodexModel,
    setCodexSandbox,
    setCodexApproval,
    setClaudeModel,
    setClaudePermissionMode,
    setClaudeAllowBlenderTools,
    setPromptAgentMode,
    setPromptMaxAttempts,
    setPromptUseHistory,
    setPromptUseSceneSnapshot,
    setPromptUseRag,
    setPromptRagTopK,
    setPromptProfileName,
    setPromptProfiles,
    setSelectedPromptProfileId,
    setPromptStatus,
    setPromptCode,
    setPromptResultRaw,
    setPromptAttemptTrace,
    setPromptConversation,
  } = promptActions;

  const isCodexRunner = promptRunner === 'codex';
  const isClaudeRunner = promptRunner === 'claude';
  const isCliRunner = isCodexRunner || isClaudeRunner;
  const promptApiKeyLabel = promptProvider === 'gemini' ? 'Gemini AI Studio API Key' : 'OpenAI API Key';
  const promptApiKeyPlaceholder = promptProvider === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY';
  const promptProviderHint = isCliRunner
    ? `${isCodexRunner ? 'Codex' : 'Claude Code'} mode runs the local ${isCodexRunner ? 'Codex' : 'Claude Code'} CLI from this app, using your installed CLI auth, config, and MCP setup.`
    : (promptProvider === 'gemini'
      ? 'Gemini mode uses the Google AI Studio Gemini API directly from the launcher.'
      : 'OpenAI mode uses the OpenAI API directly from the launcher.');
  const canRunPrompt = isCliRunner || promptingReady;
  const activeAgentLabel = formatActiveAgentLabel({
    promptRunner,
    promptProvider,
    promptModel,
    codexModel,
    claudeModel,
  });
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (typeof api.onAgentRunProgress !== 'function') {
      return undefined;
    }

    return api.onAgentRunProgress((progressEvent) => {
      const requestId = String(progressEvent?.requestId || '');
      if (!requestId) {
        return;
      }

      setPromptConversation((current) => current.map((entry) => {
        if (entry.id !== requestId) {
          return entry;
        }

        const progressEvents = [
          ...(Array.isArray(entry.progressEvents) ? entry.progressEvents : []),
          progressEvent,
        ].slice(-40);

        return {
          ...entry,
          progressEvents,
          summary: entry.status === 'running' && progressEvent.message
            ? progressEvent.message
            : entry.summary,
        };
      }));
    });
  }, [api, setPromptConversation]);

  const handlePromptProfileChange = (event) => {
    const nextId = event.target.value;
    if (!nextId) {
      setSelectedPromptProfileId('');
      setPromptProfileName('');
      return;
    }

    const profile = promptProfiles.find((entry) => entry.id === nextId);
    if (profile) {
      applyPromptProfile(profile);
      setPromptStatus(`Applied saved profile "${profile.name}". API keys are still session-only.`);
    }
  };

  const handleProviderChange = (event) => {
    const nextProvider = event.target.value;
    setPromptProvider(nextProvider);
    setPromptModel(defaultPromptModel(nextProvider));
  };

  const handleRunPrompt = () => runWithBusy('runPrompt', async () => {
    const trimmedPrompt = promptText.trim();
    if (!trimmedPrompt) {
      return;
    }

    const requestId = `prompt-${Date.now()}`;
    const timestamp = new Date().toISOString();

    setPromptAttemptTrace([]);
    setPromptCode('');
    setPromptResultRaw('');
    const initialStatus = isCliRunner
      ? `Running ${isCodexRunner ? 'Codex' : 'Claude Code'} CLI: sending the request to your local ${isCodexRunner ? 'Codex' : 'Claude Code'} installation...`
      : (promptAgentMode
        ? 'Running agent loop: collecting prompt context, generating Blender Python, executing it in Blender, and retrying if needed...'
        : 'Collecting prompt context, generating Blender Python, and sending it to Blender...');
    const pendingSummary = isCliRunner
      ? `Running ${isCodexRunner ? 'Codex' : 'Claude Code'} CLI from the launcher...`
      : 'Generating Blender Python and executing it in Blender...';

    setPromptStatus(initialStatus);
    setPromptConversation((current) => [
      ...current,
      {
        id: requestId,
        prompt: trimmedPrompt,
        provider: isCodexRunner ? 'codex' : (isClaudeRunner ? 'claude' : promptProvider),
        model: isCodexRunner ? (codexModel || 'config default') : (isClaudeRunner ? (claudeModel || 'config default') : promptModel),
        timestamp,
        status: 'running',
        summary: pendingSummary,
        progressEvents: [
          {
            requestId,
            type: 'status',
            message: initialStatus,
            timestamp,
          },
        ],
      },
    ].slice(-8));
    setPromptText('');

    try {
      const result = isCodexRunner
        ? await api.runCodexPrompt({
          requestId,
          prompt: trimmedPrompt,
          context: promptContext,
          model: codexModel,
          sandbox: codexSandbox,
          approval: codexApproval,
          useHistory: promptUseHistory,
          history: promptConversation,
        })
        : (isClaudeRunner
          ? await api.runClaudePrompt({
            requestId,
            prompt: trimmedPrompt,
            context: promptContext,
            model: claudeModel,
            permissionMode: claudePermissionMode,
            allowBlenderTools: claudeAllowBlenderTools,
            useHistory: promptUseHistory,
            history: promptConversation,
          })
          : await api.runPrompt({
            requestId,
            provider: promptProvider,
            prompt: trimmedPrompt,
            context: promptContext,
            apiKey: promptApiKey,
            model: promptModel,
            agentMode: promptAgentMode,
            maxAttempts: promptMaxAttempts,
            useHistory: promptUseHistory,
            useSceneSnapshot: promptUseSceneSnapshot,
            useRag: promptUseRag,
            ragTopK: promptRagTopK,
            history: promptConversation,
          }));
      const summary = isCodexRunner
        ? formatCodexRunResult(result)
        : (isClaudeRunner ? formatClaudeRunResult(result) : formatPromptRunResult(result));
      const attempts = Array.isArray(result.attempts) ? result.attempts : [];
      const completedAt = new Date().toISOString();

      setPromptStatus(summary);
      setPromptCode(result.code || '');
      setPromptResultRaw(result.blenderResultText || '');
      setPromptAttemptTrace(attempts);
      setPromptConversation((current) => current.map((entry) => (
        entry.id === requestId
          ? {
            ...entry,
            id: result.requestId || entry.id,
            provider: result.provider || (isCodexRunner ? 'codex' : (isClaudeRunner ? 'claude' : promptProvider)),
            model: result.model || (isCodexRunner ? (codexModel || 'config default') : (isClaudeRunner ? (claudeModel || 'config default') : promptModel)),
            completedAt,
            status: result.pending ? 'pending' : 'done',
            summary,
            code: result.code || '',
            blenderResultText: result.blenderResultText || '',
            attempts,
            progressEvents: Array.isArray(entry.progressEvents) ? entry.progressEvents : [],
          }
          : entry
      )));
      if (!isCliRunner) {
        await refreshTmpFiles();
      }
      if (result.watchFilePath) {
        setSelectedTmpFile((current) => current || result.watchFilePath);
      }
    } catch (error) {
      const message = `In-app prompt failed:\n${String(error.message || error)}`;
      setPromptAttemptTrace([]);
      setPromptStatus(message);
      setPromptConversation((current) => current.map((entry) => (
        entry.id === requestId
          ? {
            ...entry,
            completedAt: new Date().toISOString(),
            status: 'error',
            summary: message,
          }
          : entry
      )));
    }
  });

  const handleSaveProfile = () => {
    const profile = buildPromptProfile();
    setPromptProfiles((current) => [profile, ...current.filter((entry) => entry.id !== profile.id)]);
    setSelectedPromptProfileId(profile.id);
    setPromptProfileName(profile.name);
    setPromptStatus(`Saved prompt profile "${profile.name}". API keys and conversation history are not stored.`);
  };

  const handleUpdateProfile = () => {
    if (!selectedPromptProfile) {
      return;
    }

    const updatedProfile = buildPromptProfile(selectedPromptProfile);
    setPromptProfiles((current) => current.map((entry) => (
      entry.id === updatedProfile.id ? updatedProfile : entry
    )));
    setPromptProfileName(updatedProfile.name);
    setPromptStatus(`Updated prompt profile "${updatedProfile.name}".`);
  };

  const handleDeleteProfile = () => {
    if (!selectedPromptProfile) {
      return;
    }

    const deletedName = selectedPromptProfile.name;
    setPromptProfiles((current) => current.filter((entry) => entry.id !== selectedPromptProfile.id));
    setSelectedPromptProfileId('');
    setPromptProfileName('');
    setPromptStatus(`Deleted prompt profile "${deletedName}".`);
  };

  const handleClearConversation = () => {
    setPromptConversation([]);
    setPromptAttemptTrace([]);
    setPromptCode('');
    setPromptResultRaw('');
    setPromptStatus('In-app prompt conversation cleared for this launcher session.');
  };

  const handleComposerKeyDown = (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      if (canRunPrompt && promptText.trim() && !busy.runPrompt) {
        handleRunPrompt();
      }
    }
  };

  return (
    <section className="card chat-workspace">
      <div className="section-title chat-title">
        <div>
          <h2>Chat</h2>
          <p>{promptProviderHint}</p>
        </div>
        <button
          className="ghost"
          disabled={!promptConversation.length || Boolean(busy.runPrompt)}
          onClick={handleClearConversation}
        >
          Clear Conversation
        </button>
      </div>

      <div className={`chat-layout${settingsOpen ? ' settings-open' : ''}`}>
        {settingsOpen && (
          <button
            className="chat-settings-backdrop"
            aria-label="Close chat settings"
            onClick={() => setSettingsOpen(false)}
          />
        )}
        <div className="chat-main">
          {!isCliRunner && !promptingReady && <pre className="status-hint">{promptingRequiredHint}</pre>}
          <ChatMessageList
            promptConversation={promptConversation}
            onUseSamplePrompt={() => setPromptText(SAMPLE_BLENDER_PROMPT)}
          />
          <div className="chat-composer">
            <label>
              Blender prompt
              <textarea
                value={promptText}
                onChange={(event) => setPromptText(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder="Create a simple cube at the origin"
                rows={3}
              />
            </label>
            <div className="chat-composer-actions">
              <button
                className="ghost chat-agent-button"
                onClick={() => setSettingsOpen(true)}
              >
                <SlidersHorizontal size={16} aria-hidden="true" />
                <span>{activeAgentLabel}</span>
              </button>
              <span>{promptUseHistory ? `${promptConversation.length} turn(s) in context` : 'History off'}</span>
              <button
                disabled={!canRunPrompt || !promptText.trim() || Boolean(busy.runPrompt)}
                onClick={handleRunPrompt}
              >
                {busy.runPrompt ? 'Running Prompt…' : 'Generate in Blender'}
              </button>
            </div>
          </div>
        </div>

        <aside className={`chat-settings${settingsOpen ? ' open' : ''}`} aria-hidden={!settingsOpen}>
          <div className="chat-settings-head">
            <h3>Settings</h3>
            <button
              className="ghost chat-settings-close"
              aria-label="Close chat settings"
              onClick={() => setSettingsOpen(false)}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <div className="chat-settings-section">
            <h3>Prompt Settings</h3>
            <div className="server-form compact">
              <label className="field-span-full">
                Agent
                <select value={promptRunner} onChange={(event) => setPromptRunner(event.target.value)}>
                  <option value="direct">Direct Blender prompt</option>
                  <option value="codex">Codex CLI</option>
                  <option value="claude">Claude Code CLI</option>
                </select>
              </label>
              <label className="field-span-full">
                Extra context
                <textarea
                  value={promptContext}
                  onChange={(event) => setPromptContext(event.target.value)}
                  placeholder="Scene units are meters. Keep geometry lightweight."
                  rows={4}
                />
              </label>
              {!isCliRunner && (
                <>
                  <label>
                    Provider
                    <select value={promptProvider} onChange={handleProviderChange}>
                      <option value="openai">OpenAI</option>
                      <option value="gemini">Gemini AI Studio</option>
                    </select>
                  </label>
                  <label>
                    Model
                    <input
                      value={promptModel}
                      onChange={(event) => setPromptModel(event.target.value)}
                      placeholder="gpt-4.1-mini"
                    />
                  </label>
                  <label className="field-span-full">
                    {promptApiKeyLabel}
                    <input
                      type="password"
                      placeholder={promptApiKeyPlaceholder}
                      value={promptApiKey}
                      onChange={(event) => setPromptApiKey(event.target.value)}
                    />
                  </label>
                  <label>
                    Agent loop
                    <select value={promptAgentMode ? 'yes' : 'no'} onChange={(event) => setPromptAgentMode(event.target.value === 'yes')}>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </label>
                  <label>
                    Max attempts
                    <input
                      value={promptMaxAttempts}
                      onChange={(event) => setPromptMaxAttempts(event.target.value)}
                      placeholder="3"
                    />
                  </label>
                </>
              )}
              {isCodexRunner && (
                <>
                  <label className="field-span-full">
                    Codex model
                    <input
                      value={codexModel}
                      onChange={(event) => setCodexModel(event.target.value)}
                      placeholder="Use Codex config default"
                    />
                  </label>
                  <label>
                    Sandbox
                    <select value={codexSandbox} onChange={(event) => setCodexSandbox(event.target.value)}>
                      <option value="workspace-write">Workspace write</option>
                      <option value="read-only">Read only</option>
                      <option value="danger-full-access">Danger full access</option>
                    </select>
                  </label>
                  <label>
                    Approval
                    <select value={codexApproval} onChange={(event) => setCodexApproval(event.target.value)}>
                      <option value="never">Never</option>
                      <option value="on-request">On request</option>
                      <option value="untrusted">Untrusted</option>
                    </select>
                  </label>
                </>
              )}
              {isClaudeRunner && (
                <>
                  <label className="field-span-full">
                    Claude model
                    <input
                      value={claudeModel}
                      onChange={(event) => setClaudeModel(event.target.value)}
                      placeholder="Use Claude config default"
                    />
                  </label>
                  <label className="field-span-full">
                    Permission mode
                    <select value={claudePermissionMode} onChange={(event) => setClaudePermissionMode(event.target.value)}>
                      <option value="acceptEdits">Accept edits</option>
                      <option value="auto">Auto</option>
                      <option value="default">Default</option>
                      <option value="dontAsk">Don't ask</option>
                      <option value="plan">Plan</option>
                      <option value="bypassPermissions">Bypass permissions</option>
                    </select>
                  </label>
                  <label className="field-span-full">
                    Auto-allow Blender MCP tools
                    <select value={claudeAllowBlenderTools ? 'yes' : 'no'} onChange={(event) => setClaudeAllowBlenderTools(event.target.value === 'yes')}>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </label>
                </>
              )}
              <label>
                History
                <select value={promptUseHistory ? 'yes' : 'no'} onChange={(event) => setPromptUseHistory(event.target.value === 'yes')}>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>
              {!isCliRunner && (
                <>
                  <label>
                    Scene snapshot
                    <select value={promptUseSceneSnapshot ? 'yes' : 'no'} onChange={(event) => setPromptUseSceneSnapshot(event.target.value === 'yes')}>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </label>
                  <label>
                    Local RAG
                    <select value={promptUseRag ? 'yes' : 'no'} onChange={(event) => setPromptUseRag(event.target.value === 'yes')}>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </label>
                  <label>
                    RAG Top K
                    <input
                      value={promptRagTopK}
                      onChange={(event) => setPromptRagTopK(event.target.value)}
                      placeholder="5"
                    />
                  </label>
                </>
              )}
            </div>
          </div>

          <div className="chat-settings-section">
            <h3>Profiles</h3>
            <div className="server-form compact">
              <label className="field-span-full">
                Saved profile
                <select value={selectedPromptProfileId} onChange={handlePromptProfileChange}>
                  <option value="">Custom / unsaved</option>
                  {promptProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name} ({formatPromptProviderLabel(profile.provider)})
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-span-full">
                Profile name
                <input
                  value={promptProfileName}
                  onChange={(event) => setPromptProfileName(event.target.value)}
                  placeholder="Gemini scene-aware default"
                />
              </label>
            </div>
            <div className="actions">
              <button
                className="ghost"
                disabled={!promptProfileName.trim() || Boolean(busy.runPrompt)}
                onClick={handleSaveProfile}
              >
                Save
              </button>
              <button
                className="ghost"
                disabled={!selectedPromptProfile || !promptProfileName.trim() || Boolean(busy.runPrompt)}
                onClick={handleUpdateProfile}
              >
                Update
              </button>
              <button
                className="ghost"
                disabled={!selectedPromptProfile || Boolean(busy.runPrompt)}
                onClick={handleDeleteProfile}
              >
                Delete
              </button>
            </div>
            <pre className="status-hint">Saved profiles persist provider/model/context/toggles across relaunches. API keys and conversation history stay in memory for this launcher session only.</pre>
          </div>

          <div className="chat-settings-section">
            <h3>Latest Run</h3>
            <pre className="status-box">{promptStatus}</pre>
            <details className="chat-details" open={Boolean(promptAttemptTrace.length)}>
              <summary>Latest execution artifacts</summary>
              {promptAttemptTrace.length > 0 && (
                <div className="history-panel">
                  <div className="history-header">
                    <strong>Agent attempt trace</strong>
                    <span>{promptAttemptTrace.length} attempt(s)</span>
                  </div>
                  <div className="history-list">
                    {promptAttemptTrace.map((attempt, index) => (
                      <div className="history-item" key={`${attempt.requestId || attempt.status || 'attempt'}-${index}`}>
                        <div className="history-meta">
                          <strong>{formatPromptAttemptLabel(attempt)}</strong>
                          <span>{attempt.requestId || attempt.stage || 'no request id'}</span>
                        </div>
                        <pre className="history-summary">{formatPromptAttemptDetails(attempt)}</pre>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <pre className="log-box">{promptCode || 'Generated Blender Python will appear here.'}</pre>
              <pre className="log-box">{promptResultRaw || 'Latest Blender execution result will appear here when available.'}</pre>
            </details>
          </div>
        </aside>
      </div>
    </section>
  );
}
