# Blender MCP Server

MCP server that enables Claude, Codex, Gemini CLI, Copilot CLI, and ChatGPT to generate, explain, and debug Blender Python code.

It supports two transports:
- `stdio` for Claude Desktop, Codex, Gemini CLI, and Copilot CLI
- `http` (Streamable HTTP) for ChatGPT custom MCP connectors

It also includes a local OpenAI API bridge script (no ChatGPT connector required).

## Setup

### 1. Install Dependencies

```bash
cd mcp-server
npm install
```

### 2. Run With Claude Desktop (stdio)

Add to your Claude Desktop config file:

**Mac:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "blender": {
      "command": "node",
      "args": ["/path/to/claude-blender-integration/mcp-server/index.js"]
    }
  }
}
```

Replace `/path/to/claude-blender-integration/` with the actual path where you saved this folder.

Restart Claude Desktop after saving config.

### 3. Run With Codex (stdio)

Quick setup from repo root:

```bash
./scripts/setup-codex-mcp.sh
```

Manual setup:

```bash
codex mcp add blender -- node /path/to/claude-blender-integration/mcp-server/index.js
```

Direct `config.toml` setup:

```toml
[mcp_servers.blender]
command = "node"
args = ["/path/to/claude-blender-integration/mcp-server/index.js"]
startup_timeout_sec = 20
tool_timeout_sec = 60
enabled = true
```

Codex stores MCP config in:
- `~/.codex/config.toml` (global)
- `.codex/config.toml` (project, trusted projects only)

In the Codex TUI, run `/mcp` to verify the `blender` server is active.

### 4. Run With Gemini CLI (stdio)

Quick setup from repo root:

```bash
./scripts/setup-gemini-mcp.sh
```

Gemini config paths:
- `~/.gemini/settings.json` (global)
- `.gemini/settings.json` (project)

Optional Blender skills install:

```bash
./scripts/install-gemini-skills.sh
```

In Gemini CLI, run `/mcp list` to verify the `blender` server is connected.

### 5. Run With Copilot CLI (stdio)

Quick setup from repo root:

```bash
./scripts/setup-copilot-mcp.sh
```

Copilot config path:
- `~/.copilot/mcp-config.json`

Optional Blender agent install:

```bash
./scripts/install-copilot-agents.sh
```

In Copilot CLI, run `/mcp show` to verify the `blender` server is active.

### 6. Run With ChatGPT Connector (HTTP)

Start server in HTTP mode:

```bash
cd mcp-server
MCP_TRANSPORT=http HOST=127.0.0.1 PORT=3030 npm run start:http
```

Optional security:

```bash
MCP_TRANSPORT=http HOST=127.0.0.1 PORT=3030 MCP_AUTH_TOKEN=your-long-token npm run start:http
```

Expose the local port with a tunnel so ChatGPT can reach it (for example Cloudflare Tunnel or ngrok), then add that public URL as a custom MCP connector in ChatGPT workspace settings.

### 7. Run Local OpenAI API Bridge (No Connector)

This is the simplest automation path for ChatGPT/OpenAI models without setting up a remote connector.

```bash
cd mcp-server
OPENAI_API_KEY=sk-... npm run openai:generate -- "Create a low-poly pine tree with trunk and branches"
```

That command writes generated code to `/tmp/blender_claude_execute.py` (or `BLENDER_WATCH_FILE`), and Blender auto-executes it.

Optional flags:

```bash
OPENAI_API_KEY=sk-... npm run openai:generate -- "Create a spiral staircase" --context "Scene units are meters" --model gpt-4.1 --dry-run
```

## Environment Variables

- `MCP_TRANSPORT`: `stdio` (default) or `http`
- `HOST`: HTTP bind host (default `127.0.0.1`)
- `PORT`: HTTP port (default `3030`)
- `MCP_AUTH_TOKEN`: Optional bearer token for HTTP requests
- `ALLOWED_ORIGINS`: Optional comma-separated origin allow-list
- `BLENDER_WATCH_FILE`: Auto-execute file path (default `/tmp/blender_claude_execute.py`)
- `OPENAI_MODEL`: Default model for `openai-bridge.js` (default `gpt-4.1-mini`)
- `SUBAGENTS_ENABLED`: Enables the opt-in orchestration tool (default `true`)
- `SUBAGENT_MAX_CALLS`, `SUBAGENT_MAX_ITERATIONS`, `SUBAGENT_CONCURRENCY`: Bounded orchestration limits
- `AGENT_MODEL_CHEAP`, `AGENT_MODEL_STANDARD`, `AGENT_MODEL_STRONG`, `AGENT_MODEL_VISION`: Provider-neutral model-class mappings
- `SUBAGENT_DEBUG_LOGGING`, `SUBAGENT_USAGE_LOGGING`: Enable concise structured orchestration diagnostics
- `SUBAGENT_EXECUTION_MODE`: `host` (default; no server-side model/API call) or `api` (optional OpenAI-backed inspection)

## Usage from Blender

The Blender addon watches per-source files by default:
- `/tmp/blender_claude_execute.py`
- `/tmp/blender_openai_execute.py`

`create_in_blender` and `delete_in_blender` write to the MCP watch file and Blender auto-executes changes.

### Tools Available:

- **create_in_blender** - Run Blender Python code for creation/modeling tasks (blocks legacy socket names via static validation)
- **delete_in_blender** - Request explicit object deletion by exact names (uses `DEL:...`/`DELETE:[...]`, subject to addon safety gates)
- **get_blender_result** - Read latest Blender execution result JSON (supports `refresh: true` to force a probe snapshot)
- **retrieve_context** - Retrieve top matching repository context chunks from local RAG store
- **explain_blender_code** - Explain or improve Blender Python code
- **debug_blender_error** - Help debug Blender Python errors
- **orchestrate_blender_task** - Opt-in read-only task classification and compact Scene Inspector report; it does not mutate Blender in this first slice
- **render_blender_preview** - Render the current scene to a temporary PNG and return it to the MCP host for visual review

## Subagent orchestration (first slice)

`orchestrate_blender_task` keeps Blender MCP model-agnostic. It classifies a
request first: explicit deterministic requests bypass specialists, while an
ambiguous planning request receives an isolated compact scene packet through a
read-only Scene Inspector. The result is structured JSON suitable for a
director to turn into validated operations later.

The default `host` mode is designed for Codex and Claude subscription users:
the connected client acts as director, receives a `hostBrief`, and calls the
existing MCP tools. It makes no server-side model request and needs no API key.
The initial slice is deliberately propose-only: specialists cannot execute
Blender code, and existing direct MCP tools remain the only mutation path. Set
`SUBAGENT_EXECUTION_MODE=api` plus `AGENT_MODEL_CHEAP` and `OPENAI_API_KEY`
only when you intentionally want unattended, server-side OpenAI inspection.

Material/look-development requests also receive a compact, propose-only Material
Specialist report when `SUBAGENT_MAX_CALLS` is at least `2`. Fresh Blender
snapshots now include object material assignments, Principled BSDF values, light
and camera summaries, and render settings; no raw Blender code or conversation
history is sent to specialists.

For a subscription-hosted visual review loop, call `render_blender_preview`
after an approved change. It renders to a fixed temporary PNG, restores the
scene's original output-path setting, and returns the image to the connected
host. The host performs the visual critique; the MCP server does not require a
vision API key.

## Development

Build local RAG index:

```bash
npm run rag:index
```

Query local RAG index:

```bash
npm run rag:query -- "How does one-time delete token flow work?"
```

Test `stdio` mode:

```bash
npm run start:stdio
```

Smoke-test required tool exposure:

```bash
npm run smoke:tools
```

Test HTTP mode:

```bash
npm run start:http
```
