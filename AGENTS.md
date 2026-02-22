# Session Startup Behavior For Blender Requests

When a new session receives its first Blender-related user request, provide a short prompting guide before taking action.

Use this structure once per session:

1. `How to prompt Blender tasks` header.
2. One fill-in template:
   `Create [object] in [style], size [dimensions], material [material], at [location], with [constraints/details].`
3. Two concrete example prompts.
4. A short `Missing details` checklist (dimensions, material, location, target style, constraints).
5. Ask one concise follow-up question to gather missing details.

Rules:

- Keep the startup guide short (about 6-10 lines).
- If the user already gave full details, still include the guide briefly, then execute.
- If the user says to skip guidance, skip it and execute directly.
- Do not repeat the startup guide again in the same session unless the user asks.
