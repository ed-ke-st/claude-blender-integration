#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const REQUIRED_TOOLS = [
  "create_in_blender",
  "delete_in_blender",
  "get_blender_result",
  "explain_blender_code",
  "debug_blender_error",
];

async function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const serverEntry = resolve(here, "..", "index.js");

  const client = new Client({
    name: "blender-mcp-smoke-tools",
    version: "1.0.0",
  });

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverEntry],
    cwd: resolve(here, ".."),
    stderr: "pipe",
    env: {
      MCP_TRANSPORT: "stdio",
    },
  });

  if (transport.stderr) {
    transport.stderr.on("data", (chunk) => {
      const msg = String(chunk || "").trim();
      if (msg) {
        process.stderr.write(`[server] ${msg}\n`);
      }
    });
  }

  try {
    await client.connect(transport);
    const result = await client.listTools();
    const names = new Set((result.tools || []).map((t) => t.name));
    const missing = REQUIRED_TOOLS.filter((t) => !names.has(t));

    process.stdout.write(`Tools found: ${[...names].sort().join(", ")}\n`);
    if (missing.length > 0) {
      process.stderr.write(`Missing required tools: ${missing.join(", ")}\n`);
      process.exitCode = 1;
      return;
    }

    process.stdout.write("Smoke test passed: required tools are exposed.\n");
  } finally {
    await transport.close().catch(() => {});
  }
}

main().catch((error) => {
  process.stderr.write(`Smoke test failed: ${error.message}\n`);
  process.exit(1);
});
