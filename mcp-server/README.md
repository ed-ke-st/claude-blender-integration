# Blender MCP Server

MCP server that enables Claude to generate, explain, and debug Blender Python code.

## Setup

### 1. Install Dependencies

```bash
cd blender-mcp-server
npm install
```

### 2. Configure Claude Desktop

Add to your Claude Desktop config file:

**Mac:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "blender": {
      "command": "node",
      "args": ["/path/to/blender-mcp-server/index.js"]
    }
  }
}
```

Replace `/path/to/blender-mcp-server/` with the actual path where you saved this folder.

### 3. Restart Claude Desktop

Quit and restart Claude Desktop app to load the MCP server.

### 4. Verify

In Claude Desktop, you should see the Blender tools available (generate_blender_code, explain_blender_code, debug_blender_error).

## Usage from Blender

The Blender addon will communicate with this MCP server through Claude Desktop.

### Tools Available:

- **generate_blender_code** - Create new objects/modifiers from description
- **explain_blender_code** - Understand existing code
- **debug_blender_error** - Fix errors in Blender scripts

## Development

To test the MCP server directly:

```bash
npm start
```

The server uses stdio transport to communicate with Claude Desktop.
