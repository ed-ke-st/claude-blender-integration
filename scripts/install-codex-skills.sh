#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_ROOT="$REPO_ROOT/assistant-packs/codex/skills"
CODEX_HOME_DIR="${CODEX_HOME:-$HOME/.codex}"
TARGET_ROOT="$CODEX_HOME_DIR/skills"

if [ ! -d "$SOURCE_ROOT" ]; then
  echo "Error: source skills folder not found:"
  echo "  $SOURCE_ROOT"
  exit 1
fi

mkdir -p "$TARGET_ROOT"

installed=0
for skill_dir in "$SOURCE_ROOT"/*; do
  [ -d "$skill_dir" ] || continue
  name="$(basename "$skill_dir")"
  target_dir="$TARGET_ROOT/$name"
  mkdir -p "$target_dir"
  cp -f "$skill_dir/SKILL.md" "$target_dir/SKILL.md"
  installed=$((installed + 1))
  echo "Installed Codex skill: $name -> $target_dir"
done

if [ "$installed" -eq 0 ]; then
  echo "No skills installed (no skill directories found)."
  exit 1
fi

echo
echo "Installed $installed Codex skill(s)."
echo "Restart Codex or open a new session to load updated skills."
