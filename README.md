# Claude + ChatGPT + Codex Blender Integration

AI-powered 3D modeling in Blender using Claude, ChatGPT, or Codex. Create and modify 3D objects with natural language prompts through an automated workflow.

![Blender Version](https://img.shields.io/badge/Blender-5.0+-orange.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

## Features

- 🎨 **Natural Language Generation**: Describe what you want, your assistant generates the Python code
- 🔄 **Auto-Execution**: Code runs automatically in Blender - no copy/paste needed
- 🔒 **Lock/Preserve Objects**: Keep objects you like while generating new ones
- 📁 **Auto-Organization**: All generated objects go into a dedicated collection
- 🐛 **Error Handling**: View and copy errors easily for debugging
- 🎬 **Supports Everything**: Meshes, curves, cameras, animations, materials, and more

## Mac Desktop App (Beta)

If you want setup without terminal commands, use the desktop launcher in:

`desktop-app/`

It provides one-click setup checks, dependency install, addon install, Claude/Codex config updates, and MCP server start/stop.

See:
- `desktop-app/README.md`

## Assistant Packs (Agents/Skills)

This repo ships reusable assistant packs for Claude, Codex, and ChatGPT:

- `assistant-packs/codex/skills/`
- `assistant-packs/claude/skills/`
- `assistant-packs/claude/sub-agents/`
- `assistant-packs/chatgpt/project-instructions.md`

Install from repo root:

```bash
./scripts/install-codex-skills.sh
./scripts/install-claude-skills.sh
./scripts/install-claude-subagents.sh
```

Then:
- Codex: open a new session and run `/mcp` (and `/skills` if available)
- Claude Code: start a new session to load skills from `~/.claude/skills/`
- Claude sub-agents (if supported): templates are in `~/.claude/agents/`
- ChatGPT: paste template from `assistant-packs/chatgpt/project-instructions.md` into project instructions

## Local RAG Retrieval (Optional)

Build a local repository index (from `mcp-server/`):

```bash
cd mcp-server
npm run rag:index
```

Query retrieved context:

```bash
npm run rag:query -- "What are the Blender delete safeguards?"
```

This powers MCP `retrieve_context` for retrieval-grounded code generation workflows.

## Demo

```
You: "Create twirly birch branches that wrap around forming a cylinder"
Assistant: *generates Python code*
Blender: *creates the object automatically*
```

## Architecture

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│  claude.ai  │─────▶│  MCP Server  │─────▶│   Blender   │
│  (You chat) │      │ (File writer)│      │  (Watches)  │
└─────────────┘      └──────────────┘      └─────────────┘
                            │
                            ▼
                  /tmp/blender_claude_execute.py
```

1. You describe what you want in Claude/Codex/ChatGPT
2. Your assistant uses MCP tools to write Python code to a watched file
3. Blender detects the file change and executes it automatically
4. Object appears in your scene!

## Installation

### Prerequisites

- Blender 5.0+ (may work with 4.x)
- Node.js 18+ (for MCP server)
- Claude Desktop app and/or Codex app/CLI (for local stdio MCP), and/or ChatGPT workspace with custom connector support
- OpenAI API key (optional, for local API bridge mode)

### Step 1: Install Blender Addon

1. Download `claude_modeling_tools.py` from this repository
2. Copy to your Blender addons folder:
   - **Mac**: `~/Library/Application Support/Blender/5.0/scripts/addons/`
   - **Windows**: `%APPDATA%\Blender Foundation\Blender\5.0\scripts\addons\`
   - **Linux**: `~/.config/blender/5.0/scripts/addons/`
3. Open Blender → Edit → Preferences → Add-ons
4. Search for "Claude Modeling Tools"
5. Enable the addon

### Step 2: Install MCP Server

1. Clone or download this repository
2. Navigate to the `mcp-server` directory:
   ```bash
   cd mcp-server
   npm install
   ```

### Step 3: Configure Your MCP Host

#### Option A: Claude Desktop (stdio, local)

Edit your Claude Desktop config file:

**Mac**: `~/Library/Application Support/Claude/claude_desktop_config.json`

**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Add this configuration (replace `/path/to/` with your actual path):

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

**Example (Mac)**:
```json
{
  "mcpServers": {
    "blender": {
      "command": "node",
      "args": ["/Users/yourname/claude-blender-integration/mcp-server/index.js"]
    }
  }
}
```

4. **Restart Claude Desktop** to load the MCP server

#### Option B: Codex (stdio, local)

Codex uses MCP over `stdio`, same as Claude Desktop.

Quick setup (from repo root):

```bash
./scripts/setup-codex-mcp.sh
```

Manual setup:

```bash
codex mcp add blender -- node /path/to/claude-blender-integration/mcp-server/index.js
```

Codex config paths:
- Global: `~/.codex/config.toml`
- Project (trusted projects): `.codex/config.toml`

Verify in Codex TUI:
- Run `/mcp` and confirm `blender` is active.

#### Option C: ChatGPT custom connector (HTTP, remote URL)

1. Start MCP server in HTTP mode:
   ```bash
   cd mcp-server
   MCP_TRANSPORT=http HOST=127.0.0.1 PORT=3030 MCP_AUTH_TOKEN=your-long-token npm run start:http
   ```
2. Expose your local port with a secure tunnel (Cloudflare Tunnel/ngrok)
3. In ChatGPT workspace settings, add a custom MCP connector pointing to your public `/mcp` URL
4. Add `Authorization: Bearer your-long-token` in connector auth settings

Blender behavior is unchanged: MCP tool calls write to `/tmp/blender_claude_execute.py` by default (or `BLENDER_WATCH_FILE`), and the addon auto-executes it.

#### Option D: OpenAI API local bridge (simplest automation, no connector)

1. Create an OpenAI API key and set it in your shell:
   ```bash
   export OPENAI_API_KEY=sk-...
   ```
2. Generate code directly to Blender's watched file:
   ```bash
   cd mcp-server
   npm run openai:generate -- "Create a stylized low-poly cabin with a chimney"
   ```
3. Blender auto-executes the generated code from `/tmp/blender_claude_execute.py` (or `/tmp/blender_openai_execute.py` for OpenAI-source watcher flows)

Optional:
```bash
npm run openai:generate -- "Create a spiral staircase" --context "Use metric units" --model gpt-4.1
```

## Usage

### Session-Start Prompting Guide (Blender Requests)

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

### Basic Workflow

1. **In Blender**: 
   - Press `N` to open the sidebar
   - Go to the "Claude Tools" tab
   - Click **"Enable Auto-Execute"**

2. **In Claude, Codex, or ChatGPT**:
   - Describe what you want: "Create a spiral staircase with 10 steps"
   - The assistant generates and writes the code automatically
   
3. **In Blender**:
   - Object appears automatically within ~0.5 seconds!

### Preserving Objects

When you generate something you like:

1. Select the objects you want to keep
2. In Claude Tools panel, click **"Lock Selected"**
3. Generate new objects - locked ones won't be deleted
4. Build up your scene iteratively!

### Controlled Deletion (Explicit + One-Time)

By default, generated code cannot delete existing objects. Any deletion attempt is rolled back.

If you intentionally want AI code to delete specific objects:

1. In Claude Tools, click **"Arm One-Time Delete"** (this creates a one-time token and copies it to clipboard)
2. In the generated code, include both comments:
   - `DEL:RyeLoaf` (or `DELETE:[RyeLoaf]`)
   - `DELETE_TOKEN:<token>`
3. Run once. The delete arm and token are cleared automatically after a successful authorized delete.

Safety rules:
- Deleted object names must be explicitly listed in `DEL:...` or `DELETE:[...]`
- `DELETE_TOKEN` must match the currently armed token
- Locked objects are never deletable by AI code

### Trusted Delete Session (Faster Iteration)

If you want repeated delete requests without re-arming every time:

1. Enable **Trusted Session** in Claude Tools
2. In generated code, still include `DEL:...` (or `DELETE:[...]`) with exact object names
3. Token is not required while trusted session is enabled

Guardrails remain:
- Only objects in `Generated — ...` collections can be deleted
- Locked objects are never deletable
- Any unlisted deletions are rolled back

### Handling Errors

If something goes wrong:

1. Check the error preview in the Claude Tools panel
2. Click **"View Full Error (Copyable)"**
3. Error opens in Blender's Text Editor
4. Copy the error (`Cmd+A`, `Cmd+C`)
5. Paste it to Claude/Codex/ChatGPT for debugging

## Examples

### Simple Objects

**Prompt**: "Create a simple cube at the origin"

**Result**: A 1x1x1 cube centered at (0,0,0)

### Organic Shapes

**Prompt**: "Create a low-poly tree with twisted branches"

**Result**: Procedurally generated tree with randomized branch placement

### Animations

**Prompt**: "Create a camera that orbits around the scene"

**Result**: Animated camera with 360° rotation over 250 frames

### Complex Scenes

**Prompt**: "Create 10 twirly birch branches forming a cylinder, make them taper from thick to thin"

**Result**: Organic spiral branch structure with proper tapering

## Advanced Features

### Manual Generation Mode

If you prefer manual control:

1. Type description in the "Manual Generation" section
2. Click "Request Code"
3. Copy prompt to Claude Desktop
4. Paste generated code back
5. Click "Execute Code"

### Quick Tools

The addon includes some built-in operators:

- **Create Parametric Mesh**: Generate customizable primitive shapes
- **Randomize Mesh**: Add organic variation to selected mesh
- **Array on Curve**: Distribute objects along paths

## Tips & Best Practices

### For Best Results

- **Be specific**: "Create a wooden chair with 4 legs" vs "make a chair"
- **Specify materials**: "Make it red metal" or "add a wood texture"
- **Include dimensions**: "2 meters tall" or "radius of 5 units"
- **Iterate**: Lock good results, then ask for variations

### Performance

- Auto-execute checks for file changes every 0.5 seconds
- Disable auto-execute when not actively generating
- Locked objects accumulate - clean them up periodically

### Debugging

- Run Blender from Terminal to see detailed Python output:
  ```bash
  /Applications/Blender.app/Contents/MacOS/Blender
  ```
- Check the "Claude_Error_Log" text block for full error traces
- Share errors with Claude for quick fixes

## Troubleshooting

### MCP Server Not Working

**Check if server is loaded:**
- In Claude Desktop, try using a Blender tool
- If not available, check the config file path is correct
- Restart Claude Desktop after config changes

### Objects Not Appearing

**Verify auto-execute is enabled:**
- Check the Claude Tools panel shows both watched files:
  `/tmp/blender_claude_execute.py`, `/tmp/blender_openai_execute.py`
- On Mac, check `/tmp/blender_claude_execute.py` exists after generation

**Check for errors:**
- Look at the error box in Claude Tools panel
- View full error in Text Editor

### File Not Found Errors

**Ensure correct paths:**
- MCP server path in Claude Desktop config must be absolute
- Use forward slashes even on Windows in JSON: `C:/Users/...`

## Project Structure

```
claude-blender-integration/
├── README.md                          # This file
├── LICENSE                            # MIT License
├── blender-addon/
│   └── claude_modeling_tools.py      # Blender addon
└── mcp-server/
    ├── package.json                   # Node dependencies
    ├── index.js                       # MCP server implementation
    └── README.md                      # MCP server docs
```

## How It Works

### The MCP Server

The Model Context Protocol (MCP) server acts as a bridge between Claude/ChatGPT and Blender:

1. Provides tools to the model host (`create_in_blender`, `delete_in_blender`, `get_blender_result`, etc.)
2. MCP writes generated execution code to `/tmp/blender_claude_execute.py` by default (or `BLENDER_WATCH_FILE`)
3. Formats prompts specifically for Blender Python code generation

### The Blender Addon

The addon provides:

1. **File Watcher**: Checks `/tmp/blender_claude_execute.py` and `/tmp/blender_openai_execute.py` every 0.5 seconds
2. **Auto-Executor**: Runs changed code with proper imports (bpy, bmesh, etc.)
3. **Collection Manager**: Organizes generated objects
4. **Lock System**: Preserves objects via custom properties
5. **Error Handler**: Catches and displays execution errors

## Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

### Ideas for Contributions

- [x] Support for more MCP hosts (Claude Desktop + ChatGPT custom connector)
- [ ] Undo/redo system for generations
- [ ] Generation history browser
- [ ] Parameter tweaking UI for generated objects
- [ ] Export generations as reusable templates
- [ ] Support for Geometry Nodes generation
- [ ] Multi-language support

## License

MIT License - see LICENSE file for details

## Credits

Created by Eddie Stewart

Built with:
- [Blender](https://www.blender.org/) - 3D creation suite
- [Claude](https://www.anthropic.com/claude) - AI assistant by Anthropic
- [MCP](https://modelcontextprotocol.io/) - Model Context Protocol

## Support

- **Issues**: Open an issue on GitHub
- **Questions**: Start a discussion in the repository
- **Updates**: Watch the repository for new features

## Changelog

### v1.0.0 (2025-02-18)

- Initial release
- Auto-execution via MCP server
- Lock/preserve system
- Collection management
- Error handling with copyable text display
- Support for meshes, curves, cameras, animations, materials

---

**Happy modeling! 🎨**
