# Blender MCP Server

MCP server that enables Claude, Codex, and ChatGPT to generate, explain, and debug Blender Python code.

It supports two transports:
- `stdio` for Claude Desktop and Codex
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

### 4. Run With ChatGPT Connector (HTTP)

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

### 5. Run Local OpenAI API Bridge (No Connector)

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
