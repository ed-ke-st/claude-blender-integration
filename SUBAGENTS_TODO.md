# Blender MCP Subagent Implementation TODO

Scope: implement the first vertical slice only: director classification, an
isolated read-only Scene Inspector, compact structured results, configurable
model routing, observability, and tests. Direct MCP tools remain available.

- [x] Inspect the existing MCP server, Blender addon safety controls, result
  format, configuration, and test setup.
- [x] Define the first vertical slice and preserve direct MCP functionality.
- [x] Add a dependency-free Node test setup and test scripts.
- [x] Add shared subagent definitions, policies, structured result/operation
  schemas, routing configuration, and concise run logging.
- [x] Add compact scene-context extraction and a read-only Scene Inspector.
- [x] Add director classification and bounded, dynamic delegation.
- [x] Add a conservative operation validator and single execution boundary.
- [x] Expose an opt-in orchestration MCP tool without changing existing tools.
- [x] Add configuration documentation and an `.env.example`.
- [x] Test deterministic bypass, delegation, permissions, context isolation,
  invalid operations, and specialist failure handling.
- [x] Run smoke and unit tests; update this checklist with verification.

Later phases (explicitly out of this implementation slice): Material
Specialist, render/screenshot support + Visual Critic, Lighting Specialist,
and Camera/Animation Specialist.

## Host-driven orchestration

- [x] Make subscription-host orchestration the default; retain API-backed
  inspection only as an explicit configuration mode.
- [x] Return a compact host-facing scene packet and next-action brief from the
  orchestration MCP tool.
- [x] Add Codex and Claude director instructions for subscription-hosted use.
- [x] Document configuration and test host mode without an API key.
