const PROMPT_PROFILES_KEY = 'blenderMcpLauncher.promptProfiles.v1';

export function normalizePromptProvider(value) {
  return value === 'gemini' ? 'gemini' : 'openai';
}

export function normalizePromptRunner(value) {
  if (value === 'codex' || value === 'claude') {
    return value;
  }

  return 'direct';
}

export function defaultPromptModel(provider) {
  return normalizePromptProvider(provider) === 'gemini' ? 'gemini-2.5-flash' : 'gpt-4.1-mini';
}

export function formatPromptRunResult(result) {
  if (!result || typeof result !== 'object') {
    return 'Prompt run finished with an unknown response.';
  }

  const attempts = Array.isArray(result.attempts) ? result.attempts : [];
  const attemptsUsed = attempts.length;
  const blenderResult = result.blenderResult || {};
  const createdObjects = Array.isArray(blenderResult.objects_created)
    ? blenderResult.objects_created
    : [];
  const sceneObjects = Array.isArray(blenderResult.scene_objects)
    ? blenderResult.scene_objects
    : [];
  const ragMatches = Array.isArray(result.ragResult?.results) ? result.ragResult.results.length : 0;
  const historyCount = Number.isFinite(result.historyCount) ? result.historyCount : 0;
  const sceneObjectCount = Number.isFinite(result.sceneObjectCount) ? result.sceneObjectCount : 0;

  return [
    'In-app prompt finished.',
    `Provider: ${result.provider || '(unknown)'}`,
    `Model: ${result.model || '(unknown)'}`,
    `Execution mode: ${result.agentMode ? `agent loop (${attemptsUsed}/${result.maxAttempts || 1} attempt(s))` : 'single pass'}`,
    result.agentMode ? `Agent outcome: ${result.agentOutcome || '(unknown)'}` : null,
    `Request ID: ${result.requestId || '(unknown)'}`,
    `Watch file: ${result.watchFilePath || '(unknown)'}`,
    `Conversation history: ${historyCount ? `${historyCount} prior turn(s)` : 'off'}`,
    `Scene snapshot: ${result.sceneWarning ? `skipped — ${result.sceneWarning}` : (result.sceneSnapshotUsed ? `${sceneObjectCount} object(s)` : 'off')}`,
    `RAG context: ${result.ragWarning ? `skipped — ${result.ragWarning}` : (result.ragResult ? `${ragMatches} match(es)` : 'off')}`,
    result.failureMessage ? `Failure detail: ${result.failureMessage}` : null,
    result.pending
      ? 'Blender result: pending — make sure Blender is open and Auto-Execute is enabled.'
      : `Blender status: ${blenderResult.status || '(unknown)'}`,
    !result.pending && createdObjects.length
      ? `Objects created: ${createdObjects.join(', ')}`
      : null,
    !result.pending && blenderResult.error
      ? `Blender error: ${blenderResult.error}`
      : null,
    !result.pending && sceneObjects.length
      ? `Scene objects reported: ${sceneObjects.length}`
      : null,
  ].filter(Boolean).join('\n');
}

export function formatCodexRunResult(result) {
  if (!result || typeof result !== 'object') {
    return 'Codex CLI run finished with an unknown response.';
  }

  return [
    'Codex CLI run finished.',
    `Model: ${result.model || 'config default'}`,
    `Sandbox: ${result.sandbox || '(unknown)'}`,
    `Approval: ${result.approval || '(unknown)'}`,
    `Conversation history: ${result.historyCount ? `${result.historyCount} prior turn(s)` : 'off'}`,
    result.outputPath ? `Final message file: ${result.outputPath}` : null,
    result.finalMessage || result.stderr || result.stdout || null,
  ].filter(Boolean).join('\n');
}

export function formatClaudeRunResult(result) {
  if (!result || typeof result !== 'object') {
    return 'Claude Code CLI run finished with an unknown response.';
  }

  return [
    'Claude Code CLI run finished.',
    `Model: ${result.model || 'config default'}`,
    `Permission mode: ${result.permissionMode || '(unknown)'}`,
    `Blender MCP tools: ${result.allowBlenderTools ? 'pre-approved' : 'default Claude permissions'}`,
    `Conversation history: ${result.historyCount ? `${result.historyCount} prior turn(s)` : 'off'}`,
    result.finalMessage || result.stderr || result.stdout || null,
  ].filter(Boolean).join('\n');
}

export function formatPromptHistoryTimestamp(value) {
  if (!value) {
    return '';
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString();
}

export function formatPromptProviderLabel(provider) {
  if (provider === 'codex') {
    return 'Codex CLI';
  }

  if (provider === 'claude') {
    return 'Claude Code CLI';
  }

  return provider === 'gemini' ? 'Gemini AI Studio' : 'OpenAI';
}

export function formatPromptAttemptLabel(attempt) {
  if (!attempt || typeof attempt !== 'object') {
    return 'Attempt';
  }

  return `Attempt ${attempt.attempt || '?'} · ${attempt.status || 'unknown'}`;
}

export function formatPromptAttemptDetails(attempt) {
  if (!attempt || typeof attempt !== 'object') {
    return 'Attempt details unavailable.';
  }

  return [
    attempt.message ? `Message: ${attempt.message}` : null,
    Array.isArray(attempt.validationErrors) && attempt.validationErrors.length
      ? `Validation errors:\n- ${attempt.validationErrors.join('\n- ')}`
      : null,
    attempt.blenderSummary || null,
  ].filter(Boolean).join('\n\n');
}

export function readPromptProfiles() {
  try {
    const raw = window.localStorage.getItem(PROMPT_PROFILES_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((profile, index) => {
        const name = String(profile?.name || '').trim();
        if (!name) {
          return null;
        }

        const provider = normalizePromptProvider(profile?.provider);
        return {
          id: String(profile?.id || `prompt-profile-${index}`),
          name,
          runner: normalizePromptRunner(profile?.runner),
          provider,
          model: String(profile?.model || '').trim() || defaultPromptModel(provider),
          codexModel: String(profile?.codexModel || '').trim(),
          codexSandbox: String(profile?.codexSandbox || 'workspace-write'),
          codexApproval: String(profile?.codexApproval || 'never'),
          claudeModel: String(profile?.claudeModel || '').trim(),
          claudePermissionMode: String(profile?.claudePermissionMode || 'acceptEdits'),
          claudeAllowBlenderTools: profile?.claudeAllowBlenderTools !== false,
          context: String(profile?.context || ''),
          agentMode: Boolean(profile?.agentMode),
          maxAttempts: String(profile?.maxAttempts || '3'),
          useHistory: profile?.useHistory !== false,
          useSceneSnapshot: profile?.useSceneSnapshot !== false,
          useRag: Boolean(profile?.useRag),
          ragTopK: String(profile?.ragTopK || '5'),
          createdAt: String(profile?.createdAt || ''),
          updatedAt: String(profile?.updatedAt || ''),
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function writePromptProfiles(profiles) {
  try {
    window.localStorage.setItem(PROMPT_PROFILES_KEY, JSON.stringify(profiles));
  } catch {
    // Ignore localStorage errors.
  }
}
