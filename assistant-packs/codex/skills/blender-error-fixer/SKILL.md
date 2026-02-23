# Blender Error Fixer Skill

Use this skill when Blender code execution fails and the user needs a concrete fix.

## Goals

1. Reproduce the failing step from the provided code/error.
2. Identify root cause quickly (API mismatch, context misuse, naming, mode/state).
3. Return corrected executable code and a concise reason.

## Workflow

1. Parse error text and isolate failing line.
2. Map failure to Blender API/version behavior.
3. Apply minimal patch needed to pass execution.
4. Re-run through MCP and verify success.
5. Report what changed and why.

## Common fixes

- Object/context mode checks before mesh ops.
- Missing data-block existence checks.
- Node input name updates for modern Blender versions.
- Safer operator-free `bpy.data` patterns when possible.

## Output format

- Root cause (1 sentence)
- Corrected code
- Verification result
