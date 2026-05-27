# Quick Start Guide

Get up and running with Claude, Codex, Gemini CLI, Copilot CLI, or ChatGPT in 5 minutes.

## Prerequisites Checklist

- [ ] Blender 5.0+ installed
- [ ] Node.js 18+ installed ([download](https://nodejs.org/))
- [ ] Claude Desktop and/or Codex CLI and/or Gemini CLI and/or GitHub Copilot CLI installed (for stdio mode), and/or ChatGPT workspace with custom connector support
- [ ] OpenAI API key (for Option F local bridge)

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

#### Option B: Codex (stdio)

Quick setup (from repo root):

```bash
./scripts/setup-codex-mcp.sh
```

Manual setup:

```bash
codex mcp add blender -- node /FULL/PATH/TO/claude-blender-integration/mcp-server/index.js
```

Codex config paths:
- Global: `~/.codex/config.toml`
- Project (trusted projects): `.codex/config.toml`

In Codex TUI, run `/mcp` and confirm `blender` is active.

#### Option C: Gemini CLI (stdio)

Quick setup (from repo root):

```bash
./scripts/setup-gemini-mcp.sh
```

Gemini config paths:
- Global: `~/.gemini/settings.json`
- Project: `.gemini/settings.json`

Optional Blender skills install:

```bash
./scripts/install-gemini-skills.sh
```

Run `/mcp list` and `/skills list` in Gemini CLI to verify.

#### Option D: GitHub Copilot CLI (stdio)

Quick setup (from repo root):

```bash
./scripts/setup-copilot-mcp.sh
```

Copilot MCP config path:
- `~/.copilot/mcp-config.json`

Optional Blender agent install:

```bash
./scripts/install-copilot-agents.sh
```

Run `/mcp show` and `/agent` in Copilot CLI to verify.

#### Option E: ChatGPT custom connector (HTTP)

```bash
cd mcp-server
MCP_TRANSPORT=http HOST=127.0.0.1 PORT=3030 MCP_AUTH_TOKEN=your-long-token npm run start:http
```

Then:
1. Expose port `3030` via secure tunnel (Cloudflare Tunnel/ngrok)
2. In ChatGPT workspace settings, add a custom MCP connector to `https://<your-domain>/mcp`
3. Configure bearer token auth with `your-long-token`

#### Option F: OpenAI API local bridge (no connector)

```bash
cd mcp-server
export OPENAI_API_KEY=sk-...
npm run openai:generate -- "Create a simple cube at the origin"
```

Blender will auto-execute code from `/tmp/blender_claude_execute.py`.

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

**In Claude, Codex, Gemini, Copilot, or ChatGPT**:
Type: "Create a simple cube at the origin"

**In Blender**:
Watch the cube appear! ✨

## Session-Start Prompting Guide (Blender Requests)

When starting a new chat/session, use this prompt shape for fastest, most accurate results:

`Create [object] in [style], size [dimensions], material [material], at [location], with [constraints/details].`

Examples:

- `Create a sci-fi control desk in hard-surface style, size 2m x 1m x 1m, material brushed aluminum, at world origin, with rounded edges and cable ports.`
- `Create a low-poly pine tree in stylized cartoon style, size 4m tall, material matte green/brown, at X=3 Y=-2 Z=0, with 5 branch tiers.`

If details are missing, clarify these before generation:

- Dimensions
- Material/look
- Placement in scene
- Style target
- Constraints (polycount, symmetry, animation needs)

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
2. Check `/tmp/blender_claude_execute.py` exists (Mac/Linux)
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
