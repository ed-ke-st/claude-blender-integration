#!/usr/bin/env bash
set -euo pipefail

if ! command -v codex >/dev/null 2>&1; then
  echo "Error: codex CLI is not installed or not on PATH."
  echo "Install Codex first, then re-run this script."
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_PATH="$REPO_ROOT/mcp-server/index.js"
SERVER_NAME="${1:-blender}"

if [ ! -f "$SERVER_PATH" ]; then
  echo "Error: MCP server entrypoint not found at:"
  echo "  $SERVER_PATH"
  exit 1
fi

echo "Adding Codex MCP server '$SERVER_NAME'..."
codex mcp add "$SERVER_NAME" -- node "$SERVER_PATH"

echo
echo "Done. Next steps:"
echo "1) Open Codex (CLI or IDE extension)"
echo "2) In the Codex TUI, run /mcp to confirm '$SERVER_NAME' is active"
echo "3) Config is shared via ~/.codex/config.toml (or .codex/config.toml for trusted projects)"
