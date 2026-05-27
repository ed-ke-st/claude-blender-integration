---
name: blender-modeling
description: Generate and refine Blender Python scripts for creating or modifying scene objects with clear dimensions, materials, placement, and constraints.
---

# Blender Modeling

Use this skill for scene/object creation and iterative modeling workflows in Blender.

## Behavior

1. Ask one concise follow-up if critical details are missing.
2. Generate executable Blender Python code (not pseudocode).
3. Keep changes additive and deterministic by default.
4. Summarize what was created or changed and the key parameters used.

## Safety defaults

- Do not delete existing objects unless explicitly requested.
- Prefer explicit object naming and readable structure.
- Keep complexity proportional to request.
