# Contributing to Claude Blender Integration

Thank you for your interest in contributing! 🎉

## How to Contribute

### Reporting Bugs

If you find a bug:

1. Check if it's already reported in [Issues](../../issues)
2. If not, create a new issue with:
   - Clear title describing the problem
   - Steps to reproduce
   - Expected vs actual behavior
   - Blender version and OS
   - Error messages (use "View Full Error" in the addon)

### Suggesting Features

Feature requests are welcome! Please:

1. Check [Issues](../../issues) to avoid duplicates
2. Describe the feature and use case
3. Explain how it would improve the workflow

### Code Contributions

#### Setup Development Environment

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/claude-blender-integration.git
   cd claude-blender-integration
   ```
3. Install MCP server dependencies:
   ```bash
   cd mcp-server
   npm install
   ```
4. Install Blender addon in development mode (symlink it)

#### Making Changes

1. Create a feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. Make your changes
3. Test thoroughly in Blender
4. Commit with clear messages:
   ```bash
   git commit -m "Add feature: description of what you added"
   ```

#### Code Style

**Python (Blender Addon)**
- Follow PEP 8
- Use descriptive variable names
- Add docstrings to functions
- Comment complex logic

**JavaScript (MCP Server)**
- Use ES6+ features
- Consistent indentation (2 spaces)
- Clear function names
- Add JSDoc comments for functions

#### Pull Request Process

1. Update README.md if needed
2. Test with Blender 5.0+
3. Push to your fork
4. Create a Pull Request with:
   - Clear description of changes
   - Why the change is needed
   - Screenshots/videos if relevant

### Testing

Before submitting:

- [ ] Test addon loads without errors
- [ ] Test auto-execution works
- [ ] Test lock/unlock functionality
- [ ] Test error handling
- [ ] Test with various prompts
- [ ] Check for console errors

## Development Tips

### Testing the Blender Addon

Run Blender from terminal to see debug output:

**Mac**:
```bash
/Applications/Blender.app/Contents/MacOS/Blender
```

**Linux**:
```bash
blender
```

**Windows**:
```bash
"C:\Program Files\Blender Foundation\Blender 5.0\blender.exe"
```

### Testing the MCP Server

Run the server directly:
```bash
cd mcp-server
node index.js
```

It should output: "Blender MCP Server running on stdio"

### Common Issues

**Addon not reloading?**
- F3 → "Reload Scripts"
- Or restart Blender

**MCP server not updating?**
- Restart Claude Desktop
- Check config file syntax

## Questions?

Open a [Discussion](../../discussions) or reach out in issues!

## Code of Conduct

Be respectful and constructive. We're all here to make 3D modeling more accessible!
