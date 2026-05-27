#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_ROOT="$REPO_ROOT/assistant-packs/claude/sub-agents"
TARGET_ROOT="$HOME/.claude/agents"

if [ ! -d "$SOURCE_ROOT" ]; then
  echo "Error: source sub-agents folder not found:"
  echo "  $SOURCE_ROOT"
  exit 1
fi

mkdir -p "$TARGET_ROOT"

installed=0
for file in "$SOURCE_ROOT"/*.md; do
  [ -f "$file" ] || continue
  cp -f "$file" "$TARGET_ROOT/"
  installed=$((installed + 1))
  echo "Installed Claude sub-agent template: $(basename "$file")"
done

if [ "$installed" -eq 0 ]; then
  echo "No sub-agent templates installed."
  exit 1
fi

echo
echo "Installed $installed Claude sub-agent template(s) to:"
echo "  $TARGET_ROOT"
echo "Adjust file format/metadata if your Claude client requires specific fields."
