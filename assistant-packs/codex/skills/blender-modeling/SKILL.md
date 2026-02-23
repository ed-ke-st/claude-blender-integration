# Blender Modeling Skill

Use this skill when the user asks to create or modify Blender scenes via MCP tools.

## Goals

1. Generate Blender-safe Python code that creates new objects by default.
2. Keep scene changes explicit and reversible.
3. Prefer practical output over theoretical explanation.

## Workflow

1. Clarify missing requirements: object, scale, material/style, placement, constraints.
2. Generate code with clear object names and deterministic structure.
3. Call MCP execution tool to run code.
4. Read execution result and summarize created objects.
5. If error, call debug tool with full error and iterate.

## Guardrails

- Do not delete existing objects unless the user explicitly asks.
- Respect lock/preserve semantics if available in the addon.
- Keep geometry complexity proportional to request.
- Use Blender 4/5 compatible node socket names where relevant.

## Output format

- Brief plan (1-3 lines)
- Executable code
- Result summary (objects created, any warnings)
