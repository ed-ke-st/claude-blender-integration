import { makeSubagentResult, SUBAGENT_DEFINITIONS } from "../types.js";

function importantObjects(objects) {
  return [...objects]
    .sort((left, right) => {
      const leftVolume = left.dimensions.reduce((total, value) => total * Math.max(value, 0), 1);
      const rightVolume = right.dimensions.reduce((total, value) => total * Math.max(value, 0), 1);
      return rightVolume - leftVolume;
    })
    .slice(0, 20)
    .map(({ name, type, dimensions }) => ({ name, type, dimensions }));
}

export function inspectSceneLocally(context) {
  const objects = Array.isArray(context?.objects) ? context.objects : [];
  const issues = [];
  if (context?.objectCount > objects.length) {
    issues.push(`Scene inventory was capped at ${objects.length} objects for context safety.`);
  }
  if (!objects.length) issues.push("Scene contains no reported objects.");
  if (!context?.objectTypes?.CAMERA) issues.push("No camera was reported in the scene snapshot.");

  return {
    sceneBounds: context?.sceneScale || [0, 0, 0],
    importantObjects: importantObjects(objects),
    objectCount: context?.objectCount || 0,
    objectTypes: context?.objectTypes || {},
    collections: context?.collections || [],
    cameras: context?.objectTypes?.CAMERA || 0,
    lights: context?.objectTypes?.LIGHT || 0,
    issues,
  };
}

function isInspectionFinding(value) {
  return value && typeof value === "object" && Array.isArray(value.sceneBounds) && Array.isArray(value.importantObjects);
}

/**
 * Runs with exactly one compact context packet. It has no executor argument by
 * design, making mutation impossible even when a provider is configured.
 */
export async function runSceneInspector({ context, runAgent, model, mode = "host" } = {}) {
  const definition = SUBAGENT_DEFINITIONS["scene-inspector"];
  const localFindings = inspectSceneLocally(context);
  if (mode === "host") {
    return makeSubagentResult({
      agentId: definition.id,
      summary: "Scene Inspector produced a compact read-only report for the subscription host.",
      findings: localFindings,
      warnings: ["Host-driven mode: the connected Codex or Claude host performs the reasoning; no server-side API call was made."],
      confidence: 0.7,
    });
  }
  if (typeof runAgent !== "function" || !model) {
    return makeSubagentResult({
      agentId: definition.id,
      status: "partial",
      summary: "Scene Inspector produced a compact local report; no configured model was invoked.",
      findings: localFindings,
      warnings: ["API mode requires AGENT_MODEL_CHEAP and OPENAI_API_KEY for model-assisted inspection."],
      confidence: 0.7,
    });
  }

  try {
    const response = await runAgent({ definition, context, model });
    const findings = response?.findings || response;
    if (!isInspectionFinding(findings)) throw new Error("Scene Inspector returned an invalid structured report.");
    return makeSubagentResult({
      agentId: definition.id,
      summary: "Scene Inspector completed a compact read-only scene report.",
      findings,
      confidence: 0.8,
      usage: response?.usage,
    });
  } catch (error) {
    return makeSubagentResult({
      agentId: definition.id,
      status: "partial",
      summary: "Scene Inspector failed; director is using a compact local fallback.",
      findings: localFindings,
      warnings: [error.message],
      confidence: 0.6,
    });
  }
}
