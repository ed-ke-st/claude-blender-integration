# Blender MCP Server

MCP server that enables Claude and ChatGPT to generate, explain, and debug Blender Python code.

It supports two transports:
- `stdio` for Claude Desktop
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

### 3. Run With ChatGPT Connector (HTTP)

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

### 4. Run Local OpenAI API Bridge (No Connector)

This is the simplest automation path for ChatGPT/OpenAI models without setting up a remote connector.

```bash
cd mcp-server
OPENAI_API_KEY=sk-... npm run openai:generate -- "Create a low-poly pine tree with trunk and branches"
```

That command writes generated code to `/tmp/blender_auto_execute.py` (or `BLENDER_WATCH_FILE`), and Blender auto-executes it.

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
- `BLENDER_WATCH_FILE`: Auto-execute file path (default `/tmp/blender_auto_execute.py`)
- `OPENAI_MODEL`: Default model for `openai-bridge.js` (default `gpt-4.1-mini`)

## Usage from Blender

The Blender addon watches `/tmp/blender_auto_execute.py` by default.  
`write_blender_code` writes to that file, and Blender auto-executes changes.

### Tools Available:

- **generate_blender_code** - Create new objects/modifiers from description
- **explain_blender_code** - Understand existing code
- **debug_blender_error** - Fix errors in Blender scripts
- **write_blender_code** - Write and auto-execute Blender Python code

## Development

Test `stdio` mode:

```bash
npm run start:stdio
```

Test HTTP mode:

```bash
npm run start:http
```
