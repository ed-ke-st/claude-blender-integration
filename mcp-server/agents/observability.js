export function createRunRecord(userTask) {
  return {
    runId: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    userTask: String(userTask || "").slice(0, 4000),
    selectedSpecialists: [],
    modelClasses: [],
    proposedOperations: [],
    approvedOperations: [],
    rejectedOperations: [],
    errors: [],
    iterations: 0,
  };
}

export function finalizeRunRecord(record) {
  return { ...record, finishedAt: new Date().toISOString() };
}

export function logRun(record, config) {
  if (config?.debugLogging) {
    console.error(`[subagents] ${JSON.stringify(record)}`);
    return;
  }
  if (config?.usageLogging && record.usage) {
    console.error(`[subagents-usage] ${JSON.stringify({ runId: record.runId, usage: record.usage })}`);
  }
}
