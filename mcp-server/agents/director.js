import { loadSubagentConfig, resolveModel } from "./config.js";
import { createMaterialContextPacket, createSceneContextPacket } from "./context.js";
import { createRunRecord, finalizeRunRecord, logRun } from "./observability.js";
import { prepareExecution } from "./execution.js";
import { createOpenAIJsonRunner } from "./provider.js";
import { runSceneInspector } from "./specialists/scene-inspector.js";
import { runMaterialSpecialist } from "./specialists/materials.js";

const DETERMINISTIC_PATTERN = /^(?:move|translate|rotate|scale|rename|delete|duplicate|align|space|parent|unparent|assign)\b/i;
const MATERIAL_PATTERN = /\b(?:material|chrome|metal|metallic|roughness|glass|wood|paint|texture|colour|color|shader)\b/i;

export function classifyTask(userTask) {
  const task = String(userTask || "").trim();
  if (!task) return { kind: "invalid", reason: "A non-empty task is required.", specialists: [] };
  if (DETERMINISTIC_PATTERN.test(task)) {
    return {
      kind: "deterministic",
      reason: "The task starts with an explicit deterministic Blender action.",
      specialists: [],
    };
  }
  const specialists = ["scene-inspector"];
  if (MATERIAL_PATTERN.test(task)) specialists.push("materials");
  return {
    kind: "inspect-and-plan",
    reason: "The task benefits from a compact scene summary before planning.",
    specialists,
  };
}

function createHostBrief({ userTask, classification, context, inspection, materialContext, materialInspection }) {
  return {
    role: "subscription-host-director",
    userIntent: String(userTask || ""),
    classification: classification.kind,
    sceneInspectorReport: inspection.findings,
    isolatedSceneContext: context,
    ...(materialInspection
      ? {
          materialSpecialistReport: materialInspection.findings,
          isolatedMaterialContext: materialContext,
        }
      : {}),
    nextActions: [
      "Use the compact Scene Inspector report to decide the smallest safe plan.",
      "Use existing deterministic Blender MCP tools for approved execution; do not grant this inspector mutation access.",
      "Call get_blender_result after mutation to verify Blender's reported result.",
    ],
  };
}

/**
 * The director is deliberately conservative in the first slice. It can inspect
 * and plan, but it never lets a specialist mutate Blender or invent executable
 * Python. Existing MCP mutation tools remain the single execution path.
 */
export async function orchestrateTask({ userTask, sceneSnapshot, config, runAgent } = {}) {
  const effectiveConfig = config || loadSubagentConfig();
  const record = createRunRecord(userTask);
  const classification = classifyTask(userTask);
  record.plan = classification;

  if (classification.kind !== "inspect-and-plan" || !effectiveConfig.enabled) {
    if (!effectiveConfig.enabled && classification.kind === "inspect-and-plan") {
      record.errors.push("Subagents are disabled by configuration.");
    }
    const result = {
      status: classification.kind === "invalid" ? "failed" : "success",
      classification,
      selectedSpecialists: [],
      results: [],
      proposedOperations: [],
      execution: { status: "not-requested", reason: "No mutation occurs in the first orchestration slice." },
      run: finalizeRunRecord(record),
    };
    logRun(result.run, effectiveConfig);
    return result;
  }

  const context = createSceneContextPacket({ userIntent: userTask, snapshot: sceneSnapshot });
  const model = resolveModel("cheap", effectiveConfig);
  const inspectorRunner =
    effectiveConfig.executionMode === "api" && runAgent === undefined
      ? createOpenAIJsonRunner()
      : runAgent;
  record.selectedSpecialists.push("scene-inspector");
  record.modelClasses.push({ agentId: "scene-inspector", modelClass: "cheap", model: model || null });
  record.iterations = 1;

  const inspection = await runSceneInspector({
    context,
    runAgent: inspectorRunner,
    model,
    mode: effectiveConfig.executionMode,
  });
  let materialContext;
  let materialInspection;
  if (classification.specialists.includes("materials") && record.selectedSpecialists.length < effectiveConfig.maxCalls) {
    materialContext = createMaterialContextPacket({ userIntent: userTask, snapshot: sceneSnapshot });
    const materialModel = resolveModel("standard", effectiveConfig);
    record.selectedSpecialists.push("materials");
    record.modelClasses.push({ agentId: "materials", modelClass: "standard", model: materialModel || null });
    materialInspection = await runMaterialSpecialist({
      context: materialContext,
      runAgent: inspectorRunner,
      model: materialModel,
      mode: effectiveConfig.executionMode,
    });
  }
  const proposedOperations = [
    ...(inspection.proposedOperations || []),
    ...(materialInspection?.proposedOperations || []),
  ];
  const validation = prepareExecution({ operations: proposedOperations });
  record.proposedOperations = proposedOperations;
  record.approvedOperations = validation.valid;
  record.rejectedOperations = validation.rejected;
  if (inspection.usage || materialInspection?.usage) {
    record.usage = {
      ...(inspection.usage ? { "scene-inspector": inspection.usage } : {}),
      ...(materialInspection?.usage ? { materials: materialInspection.usage } : {}),
    };
  }
  if (inspection.status === "failed") record.errors.push(inspection.summary);

  const result = {
    status: inspection.status === "failed" ? "partial" : "success",
    classification,
    selectedSpecialists: record.selectedSpecialists,
    results: [inspection, ...(materialInspection ? [materialInspection] : [])],
    ...(effectiveConfig.executionMode === "host"
      ? { hostBrief: createHostBrief({ userTask, classification, context, inspection, materialContext, materialInspection }) }
      : {}),
    proposedOperations: validation.valid,
    rejectedOperations: validation.rejected,
    execution: validation.execution,
    run: finalizeRunRecord(record),
  };
  logRun(result.run, effectiveConfig);
  return result;
}
