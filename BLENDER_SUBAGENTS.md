# Blender MCP — Subagent Architecture Implementation Brief

## Objective

Extend the existing Blender MCP project with an agent orchestration layer that can delegate suitable work to specialized subagents while keeping Blender MCP itself model-agnostic.

The goal is **not** to turn every Blender operation into an agent task. The system should deliberately separate:

1. **Deterministic Blender operations** — exact, cheap, predictable code.
2. **Specialist subagents** — focused analysis or planning tasks with narrow context and tool access.
3. **Director/orchestrator** — understands the user's overall intent, decomposes work, delegates when useful, resolves conflicts, and decides what should execute.

The architecture should improve:
- context efficiency;
- token/cost efficiency;
- reliability;
- parallelism where safe;
- separation of concerns;
- model routing;
- observability and debugging;
- safety when multiple agents interact with one Blender scene.

Do not introduce complexity merely to demonstrate multi-agent behavior. A single deterministic tool call is preferable whenever it can solve the task reliably.

---

## 1. First inspect the existing project

Before implementing anything:

- Read the existing `AGENTS.md`.
- Inspect the complete repository structure.
- Identify the MCP server entry point.
- Identify all currently exposed Blender tools.
- Identify how commands are sent to Blender.
- Identify existing scene inspection/query capabilities.
- Identify render/screenshot capabilities.
- Identify existing logging, error handling, configuration, and tests.
- Identify the language/runtime and existing dependency strategy.

Do **not** rewrite working MCP functionality unnecessarily.

Produce a short internal implementation plan based on the actual repository before editing code.

---

## 2. Architectural principle

Keep the layers separate:

```text
USER
  │
  ▼
DIRECTOR / ORCHESTRATOR
  │
  ├── Scene Inspector
  ├── Geometry Specialist
  ├── Material Specialist
  ├── Lighting Specialist
  ├── Camera / Animation Specialist
  └── Visual Critic
  │
  ▼
BLENDER MCP
  │
  ├── inspect
  ├── query
  ├── deterministic operations
  ├── execute
  ├── checkpoint / undo
  └── render
  │
  ▼
BLENDER
```

The Blender MCP must remain usable without the orchestration layer.

Subagents consume MCP capabilities; MCP should not depend on a specific LLM provider.

---

## 3. Deterministic vs agentic execution

Before delegating a task, classify it.

### Prefer deterministic code for

- object transforms;
- measurements;
- alignment;
- even spacing;
- duplication;
- parenting;
- collection operations;
- material assignment;
- camera parameter changes;
- known modifier operations;
- rendering;
- naming;
- scene cleanup;
- mathematical layout;
- validation against explicit numeric constraints.

Example:

Instead of asking an agent to individually position twelve paintings, expose or use an operation similar to:

```text
layout_objects_evenly(
    objects,
    target_surface,
    margin,
    spacing,
    alignment
)
```

### Prefer specialist agents for

- interpreting ambiguous scene state;
- diagnosing why a scene looks wrong;
- deciding which objects matter;
- proposing exhibition layouts;
- suggesting lighting strategies;
- material/look-development decisions;
- camera composition;
- animation planning;
- visual evaluation of renders;
- translating user intent into structured operations.

### Prefer the director for

- understanding the overall request;
- decomposing the task;
- selecting specialists;
- choosing models;
- combining specialist recommendations;
- resolving conflicting recommendations;
- approving mutations;
- deciding whether another iteration is worthwhile;
- deciding when the task is complete.

---

## 4. Subagent interface

Create a small abstraction rather than tightly coupling the project to one provider.

A subagent should conceptually support:

```ts
interface SubagentDefinition {
  id: string;
  description: string;
  instructions: string;
  capabilities: string[];
  toolPolicy: "read-only" | "propose" | "mutate";
  modelClass: "cheap" | "standard" | "strong" | "vision";
  maxIterations?: number;
}
```

The exact implementation should follow the repository's existing language and conventions.

A run should return a structured result rather than free-form conversational text where practical:

```ts
interface SubagentResult<T = unknown> {
  agentId: string;
  status: "success" | "partial" | "failed";
  summary: string;
  findings?: T;
  proposedOperations?: BlenderOperation[];
  warnings?: string[];
  confidence?: number;
}
```

Do not expose hidden chain-of-thought. Store concise findings, decisions, operations, errors, and summaries only.

---

## 5. Initial specialist agents

Implement a minimal useful first version. Avoid building a giant agent framework.

### Scene Inspector

Default model class: `cheap`

Tool policy: `read-only`

Responsibilities:

- inspect scene hierarchy;
- identify important objects;
- summarize dimensions;
- inspect collections;
- inspect lights/cameras/materials;
- identify obvious structural problems;
- return a compact scene summary.

It should turn verbose Blender state into something like:

```json
{
  "sceneBounds": [8.2, 5.4, 3.1],
  "importantObjects": 18,
  "paintings": 12,
  "lights": 4,
  "cameras": 1,
  "issues": [
    "Painting_07 intersects east wall",
    "Three paintings have no assigned material",
    "Camera path crosses doorway geometry"
  ]
}
```

The director should receive this compact result rather than raw scene dumps whenever possible.

---

### Geometry Specialist

Default model class: `cheap` or `standard`

Initial tool policy: `propose`

Responsibilities:

- analyze geometry-related tasks;
- propose modeling steps;
- diagnose transforms/modifiers/topology at a high level;
- choose deterministic MCP operations where possible.

Do not allow arbitrary Blender mutation by default.

---

### Material Specialist

Default model class: `cheap` or `standard`

Initial tool policy: `propose`

Responsibilities:

- inspect material configuration;
- translate appearance requests into material parameters;
- detect missing/broken material assignments;
- propose material operations.

Use deterministic material tools for execution.

---

### Lighting Specialist

Default model class: `standard`

Initial tool policy: `propose`

Responsibilities:

- inspect current lights;
- interpret the intended visual style;
- propose light types, positions, strengths, temperatures, and render settings;
- request test renders when necessary.

It should return structured proposals rather than directly changing the entire scene.

---

### Camera / Animation Specialist

Default model class: `standard`

Initial tool policy: `propose`

Responsibilities:

- camera composition;
- lens selection;
- shot planning;
- camera paths;
- keyframe planning;
- walkthrough timing;
- collision/visibility considerations.

Use deterministic animation tools for execution wherever practical.

---

### Visual Critic

Default model class: `vision`

Tool policy: `read-only`

Responsibilities:

- inspect rendered output;
- compare the result with the user's requested intent;
- identify visual problems;
- rank issues by importance;
- suggest the smallest useful next iteration.

Return concise observations such as:

```json
{
  "acceptable": false,
  "priorityIssues": [
    {
      "type": "lighting",
      "severity": "high",
      "description": "Painting 4 is significantly underexposed."
    },
    {
      "type": "composition",
      "severity": "medium",
      "description": "Camera framing cuts the right edge of Painting 7."
    }
  ]
}
```

---

## 6. Dynamic delegation

Do not always run every specialist.

The director should determine which capabilities are required.

Example request:

> Make this skull look like polished chrome.

Likely plan:

```text
Material Specialist
        ↓
deterministic material operations
        ↓
test render
        ↓
Visual Critic
```

Example request:

> Turn this room into a gallery, hang these paintings and create a walkthrough.

Likely plan:

```text
Scene Inspector
        ↓
Director creates plan
        ├── Exhibition/layout reasoning
        ├── Lighting Specialist
        └── Camera/Animation Specialist
        ↓
deterministic Blender operations
        ↓
render
        ↓
Visual Critic
        ↓
targeted correction if necessary
```

Only spawn specialists that materially improve the result.

---

## 7. Model routing

Model selection must be configurable.

Do not hard-code one specific model throughout the implementation.

Support conceptual classes:

```text
cheap
standard
strong
vision
```

Configuration can later map these to actual models.

Example:

```env
AGENT_MODEL_CHEAP=...
AGENT_MODEL_STANDARD=...
AGENT_MODEL_STRONG=...
AGENT_MODEL_VISION=...
```

Routing principle:

```text
Raw inspection / classification
        → cheap

Focused planning
        → cheap or standard

Complex spatial / creative reasoning
        → standard

Overall orchestration / difficult decisions
        → strong

Render evaluation
        → vision
```

The director should avoid using a strong model for work that deterministic code or a cheaper specialist can reliably perform.

---

## 8. Context isolation

This is a core requirement.

Each specialist should receive only the information needed for its task.

For example, a Material Specialist generally does not need:

- full animation data;
- every mesh vertex;
- unrelated objects;
- previous user conversation;
- complete MCP logs.

Create compact context packets.

Example:

```ts
const context = {
  userIntent,
  relevantObjects,
  relevantMaterials,
  sceneScale,
  renderEngine,
  constraints
};
```

Subagents should return compressed results.

Do not automatically append complete subagent conversations to the director's context.

---

## 9. Safe Blender mutation

Multiple agents must **not** freely mutate the same Blender scene concurrently.

Default architecture:

```text
specialists inspect / propose
            ↓
director validates
            ↓
single execution layer
            ↓
Blender MCP mutates scene
```

Parallelize analysis, not uncontrolled scene mutation.

If experimental parallel mutation is added later, use duplicated scenes/files/collections and make isolation explicit.

---

## 10. Operation format

Where useful, represent proposed Blender changes as structured operations.

Example:

```json
{
  "operation": "set_material",
  "target": "Skull",
  "parameters": {
    "metallic": 1.0,
    "roughness": 0.12
  },
  "reason": "Create polished chrome appearance"
}
```

Possible operation families:

```text
transform_object
create_object
duplicate_object
delete_object
assign_material
set_material_properties
create_light
update_light
create_camera
update_camera
create_keyframes
apply_modifier
layout_objects
render
```

Reuse existing MCP tools where possible rather than creating redundant abstractions.

Validate operations before execution.

---

## 11. Checkpoints and rollback

Investigate the safest mechanism supported by the current project and Blender integration.

Before a substantial mutation batch:

1. create a checkpoint or save state;
2. execute the batch;
3. validate;
4. keep or roll back.

Expose this through the orchestration layer if feasible.

Do not implement a fragile custom undo system if Blender's own mechanisms can be used safely.

---

## 12. Agent permissions

Make permissions explicit.

Suggested initial policies:

```text
Scene Inspector       READ ONLY
Visual Critic         READ ONLY

Geometry Specialist   PROPOSE
Material Specialist   PROPOSE
Lighting Specialist   PROPOSE
Camera Specialist     PROPOSE

Director              APPROVES
Execution Layer       MUTATES
```

This is intentionally conservative.

We can grant specialist mutation permissions later if there is a measurable advantage.

---

## 13. Parallel execution

Safe candidates for parallel execution include independent analysis tasks.

Example:

```text
                    ┌─ Material analysis
Scene summary ──────┼─ Lighting analysis
                    └─ Camera analysis
```

Do not parallelize operations where agents may change overlapping scene state.

Use bounded concurrency.

---

## 14. Observability

Add enough logging to understand what the system is doing.

For each orchestration run record:

- user task;
- generated task plan;
- selected specialists;
- model class used;
- tools called;
- approximate token usage if provider data exposes it;
- execution duration;
- proposed operations;
- approved operations;
- rejected operations;
- Blender errors;
- validation result;
- number of iterations.

Keep logs concise and structured.

Never log API keys or secrets.

---

## 15. Cost/token accounting

If model APIs expose usage information, collect it.

Useful output:

```json
{
  "director": {
    "modelClass": "strong",
    "inputTokens": 2100,
    "outputTokens": 430
  },
  "sceneInspector": {
    "modelClass": "cheap",
    "inputTokens": 7400,
    "outputTokens": 510
  },
  "visualCritic": {
    "modelClass": "vision",
    "inputTokens": 900,
    "outputTokens": 260
  }
}
```

This will allow us to test whether delegation actually reduces expensive-model context and cost.

Do not fabricate token counts when the provider does not expose them.

---

## 16. Guard against pointless delegation

Add simple rules such as:

```text
Can deterministic code solve this exactly?
    YES → use deterministic tool
    NO  ↓

Does specialist knowledge materially help?
    NO → director handles it
    YES ↓

Delegate to the cheapest capable specialist.
```

Avoid patterns such as:

```text
Director → Planner → Planner Critic → Task Agent → Task Critic
```

unless there is evidence they improve difficult tasks.

We want practical agent orchestration, not agent theater.

---

## 17. Suggested project structure

Adapt this to the existing repository rather than forcing it:

```text
src/
  agents/
    director.*
    registry.*
    types.*

    specialists/
      scene-inspector.*
      geometry.*
      materials.*
      lighting.*
      camera-animation.*
      visual-critic.*

    orchestration/
      planner.*
      dispatcher.*
      context.*
      model-router.*
      execution.*
      validation.*

  blender/
    ...

  mcp/
    ...
```

If the repository already has a better organizational pattern, follow it.

---

## 18. Configuration

Provide configuration for:

- enabling/disabling subagents;
- model mappings;
- maximum subagent calls per task;
- maximum orchestration iterations;
- concurrency;
- mutation policy;
- debug logging;
- cost/usage logging.

Example only:

```env
SUBAGENTS_ENABLED=true
SUBAGENT_MAX_CALLS=8
SUBAGENT_MAX_ITERATIONS=3
SUBAGENT_CONCURRENCY=3

AGENT_MODEL_CHEAP=
AGENT_MODEL_STANDARD=
AGENT_MODEL_STRONG=
AGENT_MODEL_VISION=
```

Update `.env.example`, not secret files.

---

## 19. Testing

Add tests appropriate to the existing stack.

At minimum test:

### Routing

A deterministic request should not unnecessarily spawn an agent.

Example:

> Move Cube 2 meters on X.

Expected:

```text
deterministic Blender operation
0 specialist calls
```

### Delegation

Example:

> Make this room feel like a professionally lit contemporary gallery.

Expected:

```text
scene inspection
lighting specialist
possibly visual critic
```

### Permissions

A read-only agent must not be able to invoke mutation tools.

### Context isolation

Verify specialists receive only their intended context packet.

### Operation validation

Malformed or unsupported proposed operations must not execute.

### Failure handling

A failed specialist must not crash the whole orchestration process unnecessarily.

The director should be able to fall back, retry selectively, or report the failure.

---

## 20. First implementation milestone

Do **not** build the entire architecture at once.

Implement the first vertical slice:

```text
User request
    ↓
Director
    ↓
Scene Inspector subagent
    ↓
compact structured scene report
    ↓
Director
    ↓
existing Blender MCP operation
```

Requirements:

1. Existing Blender MCP functionality continues working.
2. Scene Inspector is genuinely isolated from director context.
3. Scene Inspector has read-only Blender access.
4. Model routing is configurable.
5. Structured results are used.
6. Logging shows delegation clearly.
7. There is at least one test proving the delegation path.
8. There is at least one test proving a trivial deterministic operation bypasses the subagent.

Once this works reliably, proceed to:

```text
Material Specialist
        ↓
Visual Critic
        ↓
Lighting Specialist
        ↓
Camera / Animation Specialist
```

Do not implement later phases until the first vertical slice is clean.

---

## 21. Example end-state workflow

User:

> Build a contemporary exhibition using these paintings. Keep the room minimal, use museum-style lighting and make a slow walkthrough animation.

Potential execution:

```text
DIRECTOR
│
├─ classify request
│
├─ Scene Inspector
│    └─ returns compact scene representation
│
├─ determine layout strategy
│
├─ delegate in parallel
│    ├─ Lighting Specialist
│    └─ Camera Specialist
│
├─ convert decisions into validated operations
│
├─ checkpoint
│
├─ execute deterministic Blender operations
│
├─ render preview
│
├─ Visual Critic
│    └─ identifies 2 important problems
│
├─ execute targeted corrections
│
├─ render validation preview
│
└─ finish
```

The strong director model should see primarily:

- user intent;
- compact scene representation;
- specialist summaries;
- proposed/approved operations;
- render critique;
- important errors.

It should **not** carry the entire raw Blender state and every specialist interaction unless required.

---

## 22. Definition of success

The subagent system is successful if it demonstrably makes Blender tasks:

- more reliable;
- easier to reason about;
- cheaper or more context-efficient;
- easier to debug;
- safer to execute;
- easier to extend with new specialist capabilities.

Success is **not** measured by the number of agents.

A task solved with one deterministic Blender operation is better than a task solved with five unnecessary LLM calls.

---

## Codex implementation instructions

Start by inspecting the repository and existing `AGENTS.md`.

Then:

1. Explain briefly how the current Blender MCP architecture maps onto this proposal.
2. Identify the smallest changes required for the first vertical slice.
3. Implement only that vertical slice first.
4. Preserve existing behavior.
5. Reuse existing MCP tools and abstractions wherever possible.
6. Add tests.
7. Run the relevant test/lint/typecheck commands.
8. Report:
   - files changed;
   - architecture added;
   - tests performed;
   - limitations;
   - recommended next step.

Do not add a large dependency or agent framework unless the existing codebase clearly benefits from it. Prefer a small transparent orchestration layer that we understand and control.
