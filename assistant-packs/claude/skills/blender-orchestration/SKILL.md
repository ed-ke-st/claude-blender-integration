---
name: blender-orchestration
description: Direct safe, scene-aware Blender MCP workflows from the active Claude session without requiring a server-side model API key.
---

# Blender Director (Host-Driven)

Use the active Claude session as the director and the Blender MCP server as the
inspection and deterministic execution boundary.

1. For ambiguous or multi-step scene work, call `orchestrate_blender_task`.
2. Use its compact `hostBrief` to make a plan. Do not rely on raw MCP logs or
   request an API key for normal subscription-hosted use.
3. Use direct deterministic MCP tools for exact work. Delegate only focused
   analysis/planning when the client supports subagents, never concurrent scene
   mutation.
4. Execute approved changes serially through Blender MCP, then call
   `get_blender_result` to verify them.
5. Keep deletion subject to the existing explicit safety gates.
