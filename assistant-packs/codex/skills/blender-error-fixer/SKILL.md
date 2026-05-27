---
name: blender-error-fixer
description: Debug Blender Python execution failures, identify the root cause quickly, and return minimal compatible fixes.
---

# Blender Error Fixer

Use this skill when Blender code execution fails and the user needs a concrete fix.

## Workflow

1. Parse the error text and isolate the failing line or operation.
2. Map the failure to Blender API/version behavior, context misuse, naming, or mode/state issues.
3. Apply the smallest patch that preserves intended behavior.
4. Re-run through MCP and verify the result.
5. Report the root cause, the fix, and any remaining limitation.

## Common fixes

- Object/context mode checks before mesh operations.
- Missing data-block existence checks.
- Node input name updates for modern Blender versions.
- Safer operator-free `bpy.data` patterns when possible.

## Output format

- Root cause (1 sentence)
- Corrected code
- Verification result
