/** Shared, provider-neutral contracts for the orchestration layer. */

export const MODEL_CLASSES = Object.freeze(["cheap", "standard", "strong", "vision"]);
export const TOOL_POLICIES = Object.freeze(["read-only", "propose", "mutate"]);
export const OPERATION_NAMES = Object.freeze([
  "transform_object",
  "create_object",
  "duplicate_object",
  "delete_object",
  "assign_material",
  "set_material_properties",
  "create_light",
  "update_light",
  "create_camera",
  "update_camera",
  "create_keyframes",
  "apply_modifier",
  "layout_objects",
  "render",
]);

export const SUBAGENT_DEFINITIONS = Object.freeze({
  "scene-inspector": {
    id: "scene-inspector",
    description: "Produces a compact structural summary of the current Blender scene.",
    instructions: "Inspect only the supplied compact scene packet. Return concise JSON findings.",
    capabilities: ["scene-summary", "object-inventory", "structural-issues"],
    toolPolicy: "read-only",
    modelClass: "cheap",
    maxIterations: 1,
  },
  geometry: {
    id: "geometry",
    description: "Proposes geometry work without mutating Blender.",
    instructions: "Propose validated geometry operations only.",
    capabilities: ["geometry-planning"],
    toolPolicy: "propose",
    modelClass: "cheap",
    maxIterations: 1,
  },
  materials: {
    id: "materials",
    description: "Proposes material work without mutating Blender.",
    instructions: "Propose validated material operations only.",
    capabilities: ["material-planning"],
    toolPolicy: "propose",
    modelClass: "standard",
    maxIterations: 1,
  },
  lighting: {
    id: "lighting",
    description: "Proposes lighting changes without mutating Blender.",
    instructions: "Propose validated lighting operations only.",
    capabilities: ["lighting-planning"],
    toolPolicy: "propose",
    modelClass: "standard",
    maxIterations: 1,
  },
  "camera-animation": {
    id: "camera-animation",
    description: "Proposes camera and animation work without mutating Blender.",
    instructions: "Propose validated camera or animation operations only.",
    capabilities: ["camera-planning", "animation-planning"],
    toolPolicy: "propose",
    modelClass: "standard",
    maxIterations: 1,
  },
  "visual-critic": {
    id: "visual-critic",
    description: "Evaluates rendered output without mutating Blender.",
    instructions: "Return concise ranked visual issues only.",
    capabilities: ["render-critique"],
    toolPolicy: "read-only",
    modelClass: "vision",
    maxIterations: 1,
  },
});

export function makeSubagentResult({
  agentId,
  status = "success",
  summary,
  findings,
  proposedOperations,
  warnings = [],
  confidence,
  usage,
} = {}) {
  return {
    agentId,
    status,
    summary: summary || "No summary provided.",
    ...(findings === undefined ? {} : { findings }),
    ...(proposedOperations === undefined ? {} : { proposedOperations }),
    ...(warnings.length ? { warnings } : {}),
    ...(Number.isFinite(confidence) ? { confidence } : {}),
    ...(usage && typeof usage === "object" ? { usage } : {}),
  };
}
