---
name: Blender Modeling
description: Generate and refine Blender Python scripts for creating 3D models with clear dimensions, materials, placement, and constraints.
---

# Blender Modeling

Use this skill for scene/object creation and iterative modeling workflows in Blender.

## Prompt shape

`Create [object] in [style], size [dimensions], material [material], at [location], with [constraints/details].`

## Behavior

1. Ask one concise follow-up if critical details are missing.
2. Generate executable Blender Python code (not pseudocode).
3. Keep changes additive and deterministic by default.
4. Summarize what was created and key parameters used.

## Safety defaults

- Do not delete existing objects unless explicitly requested.
- Prefer explicit object naming and readable structure.
- Keep complexity proportional to request.
