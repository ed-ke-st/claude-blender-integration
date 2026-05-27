---
name: blender-rag
description: Run a retrieval-first Blender workflow by fetching local context before generating and executing Blender Python.
---

# Blender RAG Workflow

Use this skill when generating Blender Python through MCP and you want retrieval-grounded context first.

## Workflow

1. Call `retrieve_context` with the user request, or run `npm run rag:query -- "<request>"` if the MCP tool is unavailable.
2. Synthesize strict Blender Python from the retrieved context and the current request.
3. Call `create_in_blender` with executable Python only, without markdown fences.
4. Call `get_blender_result` and inspect `status` (`success`, `error`, or `rolled_back`).
5. If status is `error` or `rolled_back`, revise once using the error plus retrieved context and retry.

## House Rules

- Do not delete existing objects unless the user explicitly requests deletion.
- Prefer repository conventions from `AGENTS.md`, addon guidance, and retrieved context chunks.
- Keep code Blender 5.0+ compatible and follow current socket naming rules.
- Always verify the final outcome via `get_blender_result` before concluding.
- On retry, make minimal targeted changes instead of rewriting everything.
