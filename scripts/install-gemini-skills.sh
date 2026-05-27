#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_ROOT="$REPO_ROOT/assistant-packs/gemini/skills"
GEMINI_HOME_DIR="${GEMINI_HOME:-$HOME/.gemini}"
TARGET_ROOT="$GEMINI_HOME_DIR/skills"

if [ ! -d "$SOURCE_ROOT" ]; then
  echo "Error: source Gemini skills folder not found:"
  echo "  $SOURCE_ROOT"
  exit 1
fi

mkdir -p "$TARGET_ROOT"

installed=0
for skill_dir in "$SOURCE_ROOT"/*; do
  [ -d "$skill_dir" ] || continue
  name="$(basename "$skill_dir")"
  source_skill="$skill_dir/SKILL.md"
  [ -f "$source_skill" ] || continue
  target_dir="$TARGET_ROOT/$name"
  mkdir -p "$target_dir"
  cp -f "$source_skill" "$target_dir/SKILL.md"
  installed=$((installed + 1))
  echo "Installed Gemini skill: $name -> $target_dir"
done

if [ "$installed" -eq 0 ]; then
  echo "No Gemini skills installed."
  exit 1
fi

echo
echo "Installed $installed Gemini skill(s)."
echo "Start a new Gemini CLI session or run /skills reload to pick them up."
