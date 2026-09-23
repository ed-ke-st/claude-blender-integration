import test from "node:test";
import assert from "node:assert/strict";

import { loadSubagentConfig, resolveModel } from "../agents/config.js";
import { createSceneContextPacket } from "../agents/context.js";
import { classifyTask, orchestrateTask } from "../agents/director.js";
import { prepareExecution } from "../agents/execution.js";
import { validateOperations } from "../agents/operations.js";
import { buildRenderPreviewScript, DEFAULT_RENDER_OUTPUT } from "../render-preview.js";
import { SUBAGENT_DEFINITIONS } from "../agents/types.js";

const snapshot = {
  scene_objects: [
    { name: "GalleryWall", type: "MESH", location: [0, 0, 1.5], dimensions: [8, 0.2, 3] },
    { name: "MainCamera", type: "CAMERA", location: [0, -5, 1.6], dimensions: [0, 0, 0] },
    { name: "KeyLight", type: "LIGHT", location: [2, -2, 3], dimensions: [0, 0, 0] },
  ],
  collections: ["Gallery"],
  materials: [{
    name: "WallPaint",
    use_nodes: true,
    node_types: ["ShaderNodeBsdfPrincipled"],
    principled: { base_color: [0.8, 0.8, 0.8, 1], metallic: 0, roughness: 0.5 },
  }],
  last_code: "must never reach a specialist",
};

function configured() {
  return loadSubagentConfig({
    SUBAGENTS_ENABLED: "true",
    AGENT_MODEL_CHEAP: "test-cheap-model",
    SUBAGENT_EXECUTION_MODE: "api",
    SUBAGENT_MAX_CALLS: "2",
  });
}

test("an explicit deterministic task bypasses every specialist", async () => {
  let calls = 0;
  const result = await orchestrateTask({
    userTask: "Move Cube 2 meters on X.", sceneSnapshot: snapshot, config: configured(),
    runAgent: async () => { calls += 1; return {}; },
  });
  assert.equal(result.classification.kind, "deterministic");
  assert.equal(calls, 0);
  assert.deepEqual(result.selectedSpecialists, []);
});

test("host mode uses the subscription host brief and makes no server-side agent call", async () => {
  let calls = 0;
  const result = await orchestrateTask({
    userTask: "Make this room feel like a professionally lit contemporary gallery.",
    sceneSnapshot: snapshot,
    config: loadSubagentConfig({ SUBAGENTS_ENABLED: "true", SUBAGENT_EXECUTION_MODE: "host" }),
    runAgent: async () => { calls += 1; return {}; },
  });
  assert.equal(calls, 0);
  assert.equal(result.results[0].status, "success");
  assert.equal(result.hostBrief.role, "subscription-host-director");
  assert.equal(result.hostBrief.isolatedSceneContext.objects.length, 3);
  assert.match(result.results[0].warnings[0], /no server-side API call/);
});

test("an ambiguous visual task delegates only an isolated compact context packet", async () => {
  let received;
  const result = await orchestrateTask({
    userTask: "Make this room feel like a professionally lit contemporary gallery.",
    sceneSnapshot: snapshot,
    config: configured(),
    runAgent: async ({ definition, context, model }) => {
      received = { definition, context, model };
      return { sceneBounds: [8, 5, 3], importantObjects: [{ name: "GalleryWall", type: "MESH", dimensions: [8, 0.2, 3] }], issues: [] };
    },
  });
  assert.equal(received.definition.id, "scene-inspector");
  assert.equal(received.definition.toolPolicy, "read-only");
  assert.equal(received.model, "test-cheap-model");
  assert.equal(received.context.userIntent.includes("gallery"), true);
  assert.equal("last_code" in received.context, false);
  assert.equal("conversationHistory" in received.context, false);
  assert.equal(result.results[0].agentId, "scene-inspector");
  assert.equal(result.execution.status, "not-requested");
});

test("scene inspector has an explicit read-only permission policy", () => {
  assert.equal(SUBAGENT_DEFINITIONS["scene-inspector"].toolPolicy, "read-only");
  assert.equal(SUBAGENT_DEFINITIONS["scene-inspector"].capabilities.includes("mutation"), false);
});

test("malformed or unsupported proposed operations are rejected", () => {
  const validation = validateOperations([
    { operation: "teleport_scene", target: "Cube", parameters: {}, reason: "Unsupported" },
    { operation: "transform_object", target: "Cube", parameters: { location: [1, 0, 0] }, reason: "Requested move" },
    { operation: "transform_object", target: "", parameters: {}, reason: "Missing target" },
  ]);
  assert.equal(validation.valid.length, 1);
  assert.equal(validation.rejected.length, 2);
});

test("material operation validation rejects malformed material properties", () => {
  const validation = validateOperations([
    { operation: "set_material_properties", target: "WallPaint", parameters: { metallic: 1, roughness: 0.12 }, reason: "Chrome" },
    { operation: "set_material_properties", target: "WallPaint", parameters: { baseColor: [1, 0] }, reason: "Invalid" },
    { operation: "set_material_properties", target: "WallPaint", parameters: {}, reason: "Empty" },
  ]);
  assert.equal(validation.valid.length, 1);
  assert.equal(validation.rejected.length, 2);
});

test("material requests receive an isolated propose-only material report in host mode", async () => {
  let calls = 0;
  const result = await orchestrateTask({
    userTask: "Make the gallery wall material polished chrome.",
    sceneSnapshot: snapshot,
    config: loadSubagentConfig({ SUBAGENTS_ENABLED: "true", SUBAGENT_EXECUTION_MODE: "host", SUBAGENT_MAX_CALLS: "2" }),
    runAgent: async () => { calls += 1; return {}; },
  });
  assert.equal(calls, 0);
  assert.deepEqual(result.selectedSpecialists, ["scene-inspector", "materials"]);
  assert.equal(result.results[1].agentId, "materials");
  assert.equal(result.results[1].findings.materialCount, 1);
  assert.equal("last_code" in result.hostBrief.isolatedMaterialContext, false);
  assert.equal(result.execution.status, "not-requested");
});

test("the execution boundary never mutates an unapproved proposal", () => {
  const prepared = prepareExecution({
    operations: [{ operation: "transform_object", target: "Cube", parameters: {}, reason: "Requested" }],
  });
  assert.equal(prepared.valid.length, 1);
  assert.equal(prepared.execution.status, "not-requested");
});

test("a failed specialist returns a local fallback instead of crashing the director", async () => {
  const result = await orchestrateTask({
    userTask: "Plan a gallery lighting approach.", sceneSnapshot: snapshot, config: configured(),
    runAgent: async () => { throw new Error("provider unavailable"); },
  });
  assert.equal(result.status, "success");
  assert.equal(result.results[0].status, "partial");
  assert.match(result.results[0].warnings[0], /provider unavailable/);
});

test("provider-reported usage is retained without fabricating token counts", async () => {
  const result = await orchestrateTask({
    userTask: "Plan a gallery lighting approach.", sceneSnapshot: snapshot, config: configured(),
    runAgent: async () => ({
      findings: { sceneBounds: [8, 5, 3], importantObjects: [], issues: [] },
      usage: { inputTokens: 12, outputTokens: 8, totalTokens: 20 },
    }),
  });
  assert.deepEqual(result.run.usage["scene-inspector"], { inputTokens: 12, outputTokens: 8, totalTokens: 20 });
});

test("model routing is configurable and compact contexts cap raw inventory", () => {
  const config = loadSubagentConfig({ AGENT_MODEL_VISION: "vision-model", SUBAGENT_MAX_CALLS: "bad" });
  assert.equal(resolveModel("vision", config), "vision-model");
  assert.equal(config.maxCalls, 2);
  const packet = createSceneContextPacket({
    userIntent: "Inspect",
    snapshot: { scene_objects: Array.from({ length: 101 }, (_, index) => ({ name: `O${index}`, type: "MESH" })) },
  });
  assert.equal(packet.objectCount, 101);
  assert.equal(packet.objects.length, 100);
});

test("host mode is the safe default and API mode is opt-in", () => {
  assert.equal(loadSubagentConfig({}).executionMode, "host");
  assert.equal(loadSubagentConfig({ SUBAGENT_EXECUTION_MODE: "api" }).executionMode, "api");
});

test("classification rejects an empty task", () => {
  assert.equal(classifyTask(" ").kind, "invalid");
});

test("render preview script uses a fixed output path and restores the scene output path", () => {
  const script = buildRenderPreviewScript();
  assert.match(script, new RegExp(JSON.stringify(DEFAULT_RENDER_OUTPUT).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(script, /previous_filepath = scene\.render\.filepath/);
  assert.match(script, /finally:\n    scene\.render\.filepath = previous_filepath/);
  assert.match(script, /bpy\.ops\.render\.render\(write_still=True\)/);
});
