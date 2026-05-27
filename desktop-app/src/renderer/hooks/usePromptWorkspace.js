import { useEffect, useMemo, useState } from 'react';
import {
  defaultPromptModel,
  normalizePromptProvider,
  normalizePromptRunner,
  readPromptProfiles,
  writePromptProfiles,
} from '../promptWorkspace';

export function usePromptWorkspace() {
  const [promptRunner, setPromptRunner] = useState('direct');
  const [promptProvider, setPromptProvider] = useState('openai');
  const [promptText, setPromptText] = useState('');
  const [promptContext, setPromptContext] = useState('');
  const [promptApiKey, setPromptApiKey] = useState('');
  const [promptModel, setPromptModel] = useState('gpt-4.1-mini');
  const [codexModel, setCodexModel] = useState('');
  const [codexSandbox, setCodexSandbox] = useState('workspace-write');
  const [codexApproval, setCodexApproval] = useState('never');
  const [claudeModel, setClaudeModel] = useState('');
  const [claudePermissionMode, setClaudePermissionMode] = useState('acceptEdits');
  const [claudeAllowBlenderTools, setClaudeAllowBlenderTools] = useState(true);
  const [promptAgentMode, setPromptAgentMode] = useState(true);
  const [promptMaxAttempts, setPromptMaxAttempts] = useState('3');
  const [promptUseHistory, setPromptUseHistory] = useState(true);
  const [promptUseSceneSnapshot, setPromptUseSceneSnapshot] = useState(true);
  const [promptUseRag, setPromptUseRag] = useState(true);
  const [promptRagTopK, setPromptRagTopK] = useState('5');
  const [promptProfileName, setPromptProfileName] = useState('');
  const [promptProfiles, setPromptProfiles] = useState(() => readPromptProfiles());
  const [selectedPromptProfileId, setSelectedPromptProfileId] = useState('');
  const [promptStatus, setPromptStatus] = useState('Enter a Blender request and run it directly from the launcher.');
  const [promptCode, setPromptCode] = useState('');
  const [promptResultRaw, setPromptResultRaw] = useState('');
  const [promptAttemptTrace, setPromptAttemptTrace] = useState([]);
  const [promptConversation, setPromptConversation] = useState([]);

  const selectedPromptProfile = useMemo(
    () => promptProfiles.find((profile) => profile.id === selectedPromptProfileId) || null,
    [promptProfiles, selectedPromptProfileId]
  );

  useEffect(() => {
    writePromptProfiles(promptProfiles);
  }, [promptProfiles]);

  const applyPromptProfile = (profile) => {
    if (!profile) {
      return;
    }

    const provider = normalizePromptProvider(profile.provider);
    const runner = normalizePromptRunner(profile.runner);
    setSelectedPromptProfileId(profile.id);
    setPromptProfileName(profile.name);
    setPromptRunner(runner);
    setPromptProvider(provider);
    setPromptModel(profile.model || defaultPromptModel(provider));
    setCodexModel(profile.codexModel || '');
    setCodexSandbox(profile.codexSandbox || 'workspace-write');
    setCodexApproval(profile.codexApproval || 'never');
    setClaudeModel(profile.claudeModel || '');
    setClaudePermissionMode(profile.claudePermissionMode || 'acceptEdits');
    setClaudeAllowBlenderTools(profile.claudeAllowBlenderTools !== false);
    setPromptContext(profile.context || '');
    setPromptAgentMode(Boolean(profile.agentMode));
    setPromptMaxAttempts(String(profile.maxAttempts || '3'));
    setPromptUseHistory(profile.useHistory !== false);
    setPromptUseSceneSnapshot(profile.useSceneSnapshot !== false);
    setPromptUseRag(Boolean(profile.useRag));
    setPromptRagTopK(String(profile.ragTopK || '5'));
  };

  const buildPromptProfile = (existingProfile = null) => {
    const provider = normalizePromptProvider(promptProvider);
    const now = new Date().toISOString();
    return {
      id: existingProfile?.id || `prompt-profile-${Date.now()}`,
      name: promptProfileName.trim(),
      runner: promptRunner,
      provider,
      model: promptModel.trim() || defaultPromptModel(provider),
      codexModel: codexModel.trim(),
      codexSandbox: codexSandbox || 'workspace-write',
      codexApproval: codexApproval || 'never',
      claudeModel: claudeModel.trim(),
      claudePermissionMode: claudePermissionMode || 'acceptEdits',
      claudeAllowBlenderTools,
      context: promptContext,
      agentMode: promptAgentMode,
      maxAttempts: promptMaxAttempts || '3',
      useHistory: promptUseHistory,
      useSceneSnapshot: promptUseSceneSnapshot,
      useRag: promptUseRag,
      ragTopK: promptRagTopK || '5',
      createdAt: existingProfile?.createdAt || now,
      updatedAt: now,
    };
  };

  return {
    promptState: {
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
    },
    promptActions: {
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
    },
    applyPromptProfile,
    buildPromptProfile,
  };
}
