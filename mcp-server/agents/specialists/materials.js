import { makeSubagentResult, SUBAGENT_DEFINITIONS } from "../types.js";

export function inspectMaterialsLocally(context) {
  const materials = Array.isArray(context?.materials) ? context.materials : [];
  const objects = Array.isArray(context?.objects) ? context.objects : [];
  const unassignedObjects = objects
    .filter((object) => object.type === "MESH" && !object.materials.some(Boolean))
    .slice(0, 30)
    .map((object) => object.name);
  const nonNodeMaterials = materials
    .filter((material) => !material.useNodes)
    .map((material) => material.name);

  return {
    materialCount: materials.length,
    materials,
    objectsWithoutMaterial: unassignedObjects,
    issues: [
      ...(unassignedObjects.length ? [`${unassignedObjects.length} mesh object(s) have no material assignment.`] : []),
      ...(nonNodeMaterials.length ? [`${nonNodeMaterials.length} material(s) do not use nodes.`] : []),
    ],
  };
}

function isMaterialFinding(value) {
  return value && typeof value === "object" && Number.isFinite(value.materialCount) && Array.isArray(value.materials);
}

/** A propose-only specialist. It never receives an execution function. */
export async function runMaterialSpecialist({ context, runAgent, model, mode = "host" } = {}) {
  const definition = SUBAGENT_DEFINITIONS.materials;
  const localFindings = inspectMaterialsLocally(context);
  if (mode === "host") {
    return makeSubagentResult({
      agentId: definition.id,
      summary: "Material Specialist produced a compact propose-only report for the subscription host.",
      findings: localFindings,
      warnings: ["Host-driven mode: use this report to plan material operations; no server-side API call was made."],
      confidence: 0.7,
    });
  }
  if (typeof runAgent !== "function" || !model) {
    return makeSubagentResult({
      agentId: definition.id,
      status: "partial",
      summary: "Material Specialist produced a compact local report; API model configuration is unavailable.",
      findings: localFindings,
      warnings: ["API mode requires AGENT_MODEL_STANDARD and OPENAI_API_KEY."],
      confidence: 0.7,
    });
  }
  try {
    const response = await runAgent({ definition, context, model });
    const findings = response?.findings || response;
    if (!isMaterialFinding(findings)) throw new Error("Material Specialist returned an invalid structured report.");
    return makeSubagentResult({
      agentId: definition.id,
      summary: "Material Specialist completed a propose-only material report.",
      findings,
      proposedOperations: response?.proposedOperations,
      usage: response?.usage,
      confidence: 0.8,
    });
  } catch (error) {
    return makeSubagentResult({
      agentId: definition.id,
      status: "partial",
      summary: "Material Specialist failed; director is using a compact local fallback.",
      findings: localFindings,
      warnings: [error.message],
      confidence: 0.6,
    });
  }
}
