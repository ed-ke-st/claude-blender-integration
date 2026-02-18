# Claude Blender Integration

AI-powered 3D modeling in Blender using Claude. Create and modify 3D objects with natural language prompts through an automated workflow.

![Blender Version](https://img.shields.io/badge/Blender-5.0+-orange.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

## Features

- 🎨 **Natural Language Generation**: Describe what you want, Claude generates the Python code
- 🔄 **Auto-Execution**: Code runs automatically in Blender - no copy/paste needed
- 🔒 **Lock/Preserve Objects**: Keep objects you like while generating new ones
- 📁 **Auto-Organization**: All generated objects go into a dedicated collection
- 🐛 **Error Handling**: View and copy errors easily for debugging
- 🎬 **Supports Everything**: Meshes, curves, cameras, animations, materials, and more

## Demo

```
You: "Create twirly birch branches that wrap around forming a cylinder"
Claude: *generates Python code*
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
                    /tmp/blender_auto_execute.py
```

1. You describe what you want in claude.ai
2. Claude uses MCP tools to write Python code to a watched file
3. Blender detects the file change and executes it automatically
4. Object appears in your scene!

## Installation

### Prerequisites

- Blender 5.0+ (may work with 4.x)
- Node.js 18+ (for MCP server)
- Claude Desktop app (for MCP)
- Claude Pro subscription (or API access)

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

### Step 3: Configure Claude Desktop

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

## Usage

### Basic Workflow

1. **In Blender**: 
   - Press `N` to open the sidebar
   - Go to the "Claude Tools" tab
   - Click **"Enable Auto-Execute"**

2. **In claude.ai**:
   - Describe what you want: "Create a spiral staircase with 10 steps"
   - Claude generates and writes the code automatically
   
3. **In Blender**:
   - Object appears automatically within ~0.5 seconds!

### Preserving Objects

When you generate something you like:

1. Select the objects you want to keep
2. In Claude Tools panel, click **"Lock Selected"**
3. Generate new objects - locked ones won't be deleted
4. Build up your scene iteratively!

### Handling Errors

If something goes wrong:

1. Check the error preview in the Claude Tools panel
2. Click **"View Full Error (Copyable)"**
3. Error opens in Blender's Text Editor
4. Copy the error (`Cmd+A`, `Cmd+C`)
5. Paste it to Claude for debugging

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
- Check the Claude Tools panel shows "Watching: /tmp/blender_auto_execute.py"
- On Mac, check `/tmp/blender_auto_execute.py` exists after generation

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

The Model Context Protocol (MCP) server acts as a bridge between Claude and Blender:

1. Provides tools to Claude (generate_blender_code, write_blender_code, etc.)
2. When Claude uses `write_blender_code`, it writes to `/tmp/blender_auto_execute.py`
3. Formats prompts specifically for Blender Python code generation

### The Blender Addon

The addon provides:

1. **File Watcher**: Checks `/tmp/blender_auto_execute.py` every 0.5 seconds
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

- [ ] Support for more MCP hosts (not just Claude Desktop)
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
