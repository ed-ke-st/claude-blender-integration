#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_ROOT="$REPO_ROOT/assistant-packs/copilot/agents"
COPILOT_HOME_DIR="${COPILOT_HOME:-$HOME/.copilot}"
TARGET_ROOT="$COPILOT_HOME_DIR/agents"

if [ ! -d "$SOURCE_ROOT" ]; then
  echo "Error: source Copilot agents folder not found:"
  echo "  $SOURCE_ROOT"
  exit 1
fi

mkdir -p "$TARGET_ROOT"

installed=0
for agent_file in "$SOURCE_ROOT"/*.agent.md; do
  [ -f "$agent_file" ] || continue
  cp -f "$agent_file" "$TARGET_ROOT/"
  installed=$((installed + 1))
  echo "Installed Copilot agent: $(basename "$agent_file") -> $TARGET_ROOT"
done

if [ "$installed" -eq 0 ]; then
  echo "No Copilot agents installed."
  exit 1
fi

echo
echo "Installed $installed Copilot agent(s)."
echo "Restart Copilot CLI or open a new session to load updated agents."
