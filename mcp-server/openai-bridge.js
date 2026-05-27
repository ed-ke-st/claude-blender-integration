#!/usr/bin/env node

import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { DEFAULT_OPENAI_MODEL, generateCode } from "./openai-generation.js";

const DEFAULT_WATCH_FILE = join(tmpdir(), "blender_auto_execute.py");

function printUsage() {
  console.error(`Usage:
  node openai-bridge.js generate "<description>" [options]

Options:
  --context "<text>"       Optional scene context
  --model "<model>"        OpenAI model (default: ${DEFAULT_OPENAI_MODEL})
  --watch-file "<path>"    Output file (default: ${DEFAULT_WATCH_FILE})
  --dry-run                Print code but do not write file

Required env:
  OPENAI_API_KEY
`);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const command = args[0];
  if (!command) {
    printUsage();
    process.exit(1);
  }

  let description = "";
  let context = "";
  let model = DEFAULT_OPENAI_MODEL;
  let watchFile = process.env.BLENDER_WATCH_FILE || DEFAULT_WATCH_FILE;
  let dryRun = false;

  const positionals = [];
  for (let i = 1; i < args.length; i += 1) {
    const token = args[i];
    if (token === "--context") {
      context = args[i + 1] || "";
      i += 1;
      continue;
    }
    if (token === "--model") {
      model = args[i + 1] || model;
      i += 1;
      continue;
    }
    if (token === "--watch-file") {
      watchFile = args[i + 1] || watchFile;
      i += 1;
      continue;
    }
    if (token === "--dry-run") {
      dryRun = true;
      continue;
    }
    positionals.push(token);
  }

  description = positionals.join(" ").trim();

  return { command, description, context, model, watchFile, dryRun };
}

async function main() {
  const { command, description, context, model, watchFile, dryRun } = parseArgs(
    process.argv
  );

  if (command !== "generate") {
    console.error(`Unknown command: ${command}`);
    printUsage();
    process.exit(1);
  }

  const code = await generateCode({ description, context, model });

  if (dryRun) {
    process.stdout.write(`${code}\n`);
    return;
  }

  await fs.writeFile(watchFile, code, "utf8");
  console.error(
    `Wrote Blender code to ${watchFile}. Blender should auto-execute within ~0.5s.`
  );
}

main().catch((error) => {
  console.error(`OpenAI bridge error: ${error.message}`);
  process.exit(1);
});
