---
name: Blender Error Fixer
description: Debug Blender Python execution errors and return minimal, compatible fixes with clear root-cause explanation.
---

# Blender Error Fixer

Use this skill when Blender code fails with traceback or runtime errors.

## Behavior

1. Identify root cause from traceback and failing line.
2. Apply minimal patch to preserve intended behavior.
3. Re-check Blender API compatibility (Blender 5.0+).
4. Return corrected code and short explanation.

## Priorities

- Prefer concrete fixes over broad rewrites.
- Keep object naming and flow consistent unless change is required.
- Include a short verification checklist.
