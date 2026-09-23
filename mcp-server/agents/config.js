import { MODEL_CLASSES } from "./types.js";

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function boolean(value, fallback) {
  if (value === undefined || value === "") return fallback;
  return /^(1|true|yes|on)$/i.test(String(value));
}

function executionMode(value) {
  return String(value || "host").toLowerCase() === "api" ? "api" : "host";
}

export function loadSubagentConfig(env = process.env) {
  const models = Object.fromEntries(
    MODEL_CLASSES.map((modelClass) => [
      modelClass,
      String(env[`AGENT_MODEL_${modelClass.toUpperCase()}`] || "").trim(),
    ])
  );

  return {
    enabled: boolean(env.SUBAGENTS_ENABLED, true),
    maxCalls: positiveInteger(env.SUBAGENT_MAX_CALLS, 2),
    maxIterations: positiveInteger(env.SUBAGENT_MAX_ITERATIONS, 1),
    concurrency: positiveInteger(env.SUBAGENT_CONCURRENCY, 1),
    mutationPolicy: String(env.SUBAGENT_MUTATION_POLICY || "director-approved"),
    debugLogging: boolean(env.SUBAGENT_DEBUG_LOGGING, false),
    usageLogging: boolean(env.SUBAGENT_USAGE_LOGGING, false),
    executionMode: executionMode(env.SUBAGENT_EXECUTION_MODE),
    models,
  };
}

export function resolveModel(modelClass, config = loadSubagentConfig()) {
  return config.models?.[modelClass] || "";
}
