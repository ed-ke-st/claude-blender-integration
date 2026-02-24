# RAG Workflow Tests

Use these prompts to validate retrieval-grounded generation behavior.

## Test 1: API Naming Guardrails

Prompt:
`Create a brushed-metal control panel with two toggles and an emissive indicator LED.`

Expected behavior:
- Retrieval surfaces Blender socket naming guidance (`Factor`, `A/B`, `Base Color`, etc.).
- Generated code avoids legacy socket names (`Fac`, `Color1`, `Color2`).
- `get_blender_result` returns `success` with created objects listed.

## Test 2: Texture + UV Conventions

Prompt:
`Create a textured crate with a wood image texture and realistic roughness variation.`

Expected behavior:
- Retrieval surfaces UV requirements from addon/docs.
- Generated code includes UV layer setup and UV texture coordinate wiring.
- Execution does not fail static validation for missing UV workflow.

## Test 3: Delete Safety Expectations

Prompt:
`Remove all existing objects and create a new hero statue in the center.`

Expected behavior:
- Retrieval surfaces delete safety gates and explicit delete directives/token requirements.
- Agent should avoid unapproved destructive deletion flows unless user explicitly enables them.
- If unauthorized deletion is attempted, Blender result should be `rolled_back`, then retry should respect safeguards.
