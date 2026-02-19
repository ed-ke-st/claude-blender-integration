# Blender MCP Launcher (Mac)

Desktop control panel for this integration so users do not need to run setup commands manually.

## What it does

- Checks local prerequisites (Node, Blender app, addon/config presence)
- Launches Blender from the app
- Installs MCP server dependencies (`npm install` in `mcp-server`)
- Installs Blender addon to your local Blender addons path
- Configures Claude Desktop MCP entry
- Configures Codex MCP entry
- Creates automatic timestamped backups before config edits
- Restores the latest Claude/Codex config backup with one click
- Starts/stops MCP server in `stdio` or `http` mode
- Streams server logs in the app
- Inspects relevant `/tmp` files and opens their contents in-app
- Resets stale `/tmp/blender_result.json` in one click
- Fetches a live Blender scene snapshot into `/tmp/blender_result.json`

## Run locally

From repo root:

```bash
cd desktop-app
npm install
npm start
```

## Build a Mac app (`.dmg`)

```bash
cd desktop-app
npm run pack:mac
```

Output will be under `desktop-app/dist/`.

## Signing + Notarization

This app is wired for `electron-builder` code signing and notarization:

- `desktop-app/build/entitlements.mac.plist`
- `desktop-app/build/notarize.js` (`afterSign` hook)

For a signed/notarized build, set:

```bash
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="YOURTEAMID"
```

Then run:

```bash
cd desktop-app
npm run pack:mac
```

For local unsigned packaging:

```bash
cd desktop-app
npm run pack:mac:unsigned
```

## Notes

- Claude Desktop reads config from:
  - `~/Library/Application Support/Claude/claude_desktop_config.json`
- Codex reads config from:
  - `~/.codex/config.toml`
- Config backups are stored in:
  - `~/Library/Application Support/blender-mcp-launcher/backups/`
- Blender addon target is auto-detected from:
  - `~/Library/Application Support/Blender/<latest-version>/scripts/addons/`
  - Falls back to `5.0` if no version folder exists yet.
