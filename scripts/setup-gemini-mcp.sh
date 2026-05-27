#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_PATH="$REPO_ROOT/mcp-server/index.js"
SERVER_NAME="${1:-blender}"
CONFIG_PATH="${GEMINI_CONFIG_PATH:-$HOME/.gemini/settings.json}"

if [ ! -f "$SERVER_PATH" ]; then
  echo "Error: MCP server entrypoint not found at:"
  echo "  $SERVER_PATH"
  exit 1
fi

mkdir -p "$(dirname "$CONFIG_PATH")"

node - "$CONFIG_PATH" "$SERVER_NAME" "$SERVER_PATH" <<'NODE'
const fs = require('fs');

const [configPath, serverName, serverPath] = process.argv.slice(2);

let config = {};
if (fs.existsSync(configPath)) {
  const raw = fs.readFileSync(configPath, 'utf8').trim();
  if (raw) {
    config = JSON.parse(raw);
  }
}

if (!config || typeof config !== 'object' || Array.isArray(config)) {
  throw new Error('Gemini config must contain a JSON object at the top level.');
}

if (!config.mcpServers || typeof config.mcpServers !== 'object' || Array.isArray(config.mcpServers)) {
  config.mcpServers = {};
}

config.mcpServers[serverName] = {
  command: 'node',
  args: [serverPath],
};

fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
NODE

echo "Configured Gemini CLI MCP server '$SERVER_NAME' in:"
echo "  $CONFIG_PATH"
echo
echo "Next steps:"
echo "1) Start a new Gemini CLI session"
echo "2) Run /mcp list and confirm '$SERVER_NAME' is connected"
echo "3) Optionally run ./scripts/install-gemini-skills.sh for Blender-specific skills"
