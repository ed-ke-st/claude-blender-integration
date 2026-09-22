---
name: blender-orchestration
description: Direct safe Blender workflows through the connected Blender MCP server using the current Codex subscription session; use for ambiguous, multi-step, or scene-aware tasks.
---

# Blender Director (Host-Driven)

You are the director. The Blender MCP server is a deterministic execution and
inspection boundary; it does not need an API key for this workflow.

## Workflow

1. For an ambiguous, scene-aware, or multi-step request, call
   `orchestrate_blender_task` with the user task. Treat its `hostBrief` as the
   only scene context needed for initial planning.
2. Decide whether direct deterministic execution is enough. Do not create
   subagents merely to move, align, duplicate, name, or otherwise perform an
   explicit exact operation.
3. For work that benefits from specialist thinking, delegate only analysis or
   proposals if the Codex host supports subagents. Keep Blender mutation in one
   serial execution path.
4. Use existing Blender MCP mutation tools only after deciding on the plan.
   Never give a specialist arbitrary Blender mutation authority.
5. Call `get_blender_result` after mutation and make at most one targeted
   correction unless the user asks for more iteration.

## Host context and safety

- Host-driven orchestration uses the active Codex subscription session; do not
  request `OPENAI_API_KEY` for this path.
- The Scene Inspector is read-only. Its compact report is not permission to
  delete or alter unrelated objects.
- Preserve direct tool safety gates, especially explicit deletion approval.
- State the selected plan, approved actions, verification result, and any
  unresolved visual judgment concisely.
