# Blender RAG Workflow Skill

Use this skill when generating Blender Python through MCP and you want retrieval-grounded context first.

## Workflow

1. Call `retrieve_context` with the user request (or run `npm run rag:query -- "<request>"` if MCP tool is unavailable).
2. Synthesize strict Blender Python from retrieved context and current request.
3. Call `create_in_blender` with executable Python only (no markdown fences).
4. Call `get_blender_result` and inspect `status` (`success`, `error`, `rolled_back`).
5. If status is `error` or `rolled_back`, revise once using the error + retrieved context and retry steps 3-4.

## House Rules

- Do not delete existing objects unless the user explicitly requests deletion.
- Prefer repository conventions from `AGENTS.md`, addon guidance, and retrieved context chunks.
- Keep code Blender 5.0+ compatible and follow current socket naming rules.
- Always verify final outcome via `get_blender_result` before concluding.
- On retry, make minimal targeted changes instead of rewriting everything.
