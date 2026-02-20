# Blender MCP Launcher (Mac)

Desktop control panel for this integration so users do not need to run setup commands manually.

On first launch, the app opens a guided onboarding wizard with step-by-step setup actions.

## App name and icon branding

The packaged app name is set by `build.productName` in `package.json`:
- `Blender MCP Launcher`

To replace the default Electron icon, add files to:
- `desktop-app/build/icons/icon.png` (runtime/dev window + mac packaging + mac dock)
- `desktop-app/build/icons/icon.ico` (Windows packaging)
- `desktop-app/build/icons/icon.svg` (editable source used to generate PNG/ICO)

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
npm run dev
```

For a production-style local run:

```bash
cd desktop-app
npm run build:renderer
npm start
```

## Build a Mac app (`.dmg`)

```bash
cd desktop-app
npm run pack:mac
```

Output will be under `desktop-app/dist/`.
This now produces both `.dmg` and `.zip` artifacts.

## End-user install without terminal (no Apple Developer account required)

You can distribute the files from `desktop-app/dist/` directly (for example via GitHub Releases).

Recommended artifact:
- `.zip` (simple download + drag app to Applications)

Alternative artifact:
- `.dmg` (traditional Mac installer style)

Unsigned app first-open on macOS:
1. User downloads and opens the `.zip` or `.dmg`.
2. User drags `Blender MCP Launcher.app` to `Applications`.
3. First launch: right-click app in `Applications` -> `Open`.
4. Click `Open` in the security prompt.

After that first approval, launches are normal (double-click).

## Automated release artifacts (GitHub Actions)

This repo includes a release workflow at:
- `.github/workflows/desktop-app-release.yml`

Behavior:
- On GitHub Release publish: builds unsigned macOS `.dmg` + `.zip` and attaches them to the release.
- On manual run (`workflow_dispatch`): builds the same files and uploads them as workflow artifacts.

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
