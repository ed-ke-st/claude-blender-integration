# Quick Start Guide

Get up and running with Claude or ChatGPT in 5 minutes.

## Prerequisites Checklist

- [ ] Blender 5.0+ installed
- [ ] Node.js 18+ installed ([download](https://nodejs.org/))
- [ ] Claude Desktop app installed (for stdio mode) and/or ChatGPT workspace with custom connector support
- [ ] OpenAI API key (for Option C local bridge)

## Installation Steps

### 1. Install MCP Server (2 minutes)

```bash
# Clone or download this repository
git clone https://github.com/YOUR_USERNAME/claude-blender-integration.git
cd claude-blender-integration/mcp-server

# Install dependencies
npm install
```

### 2. Configure MCP Host (1 minute)

#### Option A: Claude Desktop (stdio)

**Mac users**: Edit `~/Library/Application Support/Claude/claude_desktop_config.json`

**Windows users**: Edit `%APPDATA%\Claude\claude_desktop_config.json`

Add (replace path with your actual path):

```json
{
  "mcpServers": {
    "blender": {
      "command": "node",
      "args": ["/FULL/PATH/TO/claude-blender-integration/mcp-server/index.js"]
    }
  }
}
```

**Restart Claude Desktop**

#### Option B: ChatGPT custom connector (HTTP)

```bash
cd mcp-server
MCP_TRANSPORT=http HOST=127.0.0.1 PORT=3030 MCP_AUTH_TOKEN=your-long-token npm run start:http
```

Then:
1. Expose port `3030` via secure tunnel (Cloudflare Tunnel/ngrok)
2. In ChatGPT workspace settings, add a custom MCP connector to `https://<your-domain>/mcp`
3. Configure bearer token auth with `your-long-token`

#### Option C: OpenAI API local bridge (no connector)

```bash
cd mcp-server
export OPENAI_API_KEY=sk-...
npm run openai:generate -- "Create a simple cube at the origin"
```

Blender will auto-execute code from `/tmp/blender_auto_execute.py`.

### 3. Install Blender Addon (1 minute)

1. Copy `blender-addon/claude_modeling_tools.py`
2. Paste to Blender addons folder:
   - **Mac**: `~/Library/Application Support/Blender/5.0/scripts/addons/`
   - **Windows**: `%APPDATA%\Blender Foundation\Blender\5.0\scripts\addons\`
   - **Linux**: `~/.config/blender/5.0/scripts/addons/`
3. In Blender: Edit → Preferences → Add-ons
4. Search "Claude" and enable it

### 4. Test It! (1 minute)

**In Blender**:
1. Press `N` to open sidebar
2. Go to "Claude Tools" tab
3. Click "Enable Auto-Execute"

**In Claude or ChatGPT**:
Type: "Create a simple cube at the origin"

**In Blender**:
Watch the cube appear! ✨

## Troubleshooting

### MCP Server Not Loading?

```bash
# Test the server
cd mcp-server
npm run start:stdio
# Should output: "Blender MCP Server running on stdio"
```

### Blender Not Finding Addon?

Check you copied to the right folder:
```bash
# Mac
ls ~/Library/Application\ Support/Blender/5.0/scripts/addons/claude_modeling_tools.py

# Should show the file
```

### Nothing Happening in Blender?

1. Is "Enable Auto-Execute" turned on?
2. Check `/tmp/blender_auto_execute.py` exists (Mac/Linux)
3. Look for errors in the Claude Tools panel

## Next Steps

- Read the full [README.md](README.md) for detailed features
- Try the examples
- Experiment with prompts!

## Getting Help

- Open an [Issue](../../issues)
- Check [Discussions](../../discussions)
- Read the troubleshooting section in README.md

Happy modeling! 🎨
