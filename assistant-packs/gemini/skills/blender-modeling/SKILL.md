---
name: blender-modeling
description: Generate and refine Blender Python scripts for creating or modifying scene objects with clear dimensions, materials, placement, and constraints.
---

# Blender Modeling

Use this skill when the user asks to create or modify Blender scenes via MCP tools.

## Workflow

1. Clarify missing requirements: object, scale, material/style, placement, and constraints.
2. Generate Blender-safe Python with clear object names and deterministic structure.
3. Call the MCP execution tool to run the script.
4. Read the execution result and summarize what was created or changed.
5. If execution fails, pass the full error into the error-fixer workflow and retry with a targeted change.

## Guardrails

- Do not delete existing objects unless the user explicitly asks.
- Respect lock/preserve semantics if available in the addon.
- Keep geometry complexity proportional to the request.
- Use Blender 4/5 compatible node socket names where relevant.
