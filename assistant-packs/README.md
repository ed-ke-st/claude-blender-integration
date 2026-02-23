# Assistant Packs (Claude, Codex, ChatGPT)

This folder ships reusable assistant templates so users can get better Blender results faster across clients.

## Included packs

- `codex/skills/` - Codex skills (`SKILL.md`) you can install into `$CODEX_HOME/skills`
- `claude/skills/` - Claude skills (`SKILL.md`) for `~/.claude/skills`
- `claude/sub-agents/` - Claude sub-agent templates for `~/.claude/agents` (optional compatibility)
- `chatgpt/` - ChatGPT project/custom-instruction templates

## Quick install

From repo root:

```bash
./scripts/install-codex-skills.sh
./scripts/install-claude-skills.sh
./scripts/install-claude-subagents.sh
```

Then restart your client and verify:

- Codex: run `/skills` and `/mcp`
- Claude Code: start a new session and use skills from `~/.claude/skills`
- Claude sub-agents: confirm templates appear from `~/.claude/agents` if your client supports them
- ChatGPT: paste the template into project instructions
