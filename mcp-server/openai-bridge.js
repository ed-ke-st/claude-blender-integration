#!/usr/bin/env node

import fs from "node:fs/promises";
import process from "node:process";
import OpenAI from "openai";

const DEFAULT_WATCH_FILE = "/tmp/blender_auto_execute.py";
const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

function printUsage() {
  console.error(`Usage:
  node openai-bridge.js generate "<description>" [options]

Options:
  --context "<text>"       Optional scene context
  --model "<model>"        OpenAI model (default: ${DEFAULT_MODEL})
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
  let model = DEFAULT_MODEL;
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

function buildGeneratePrompt(description, context = "") {
  return `Generate Blender Python code for the following request.

REQUIREMENTS:
- Use bpy and bmesh libraries where appropriate
- Code must run in Blender 5.0+
- Include basic error handling
- Return ONLY Python code, no markdown fences

REQUEST: ${description}
${context ? `CONTEXT: ${context}` : ""}
`;
}

function stripCodeFences(text) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:python)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

async function generateCode({ description, context, model }) {
  if (!description) {
    console.error("Missing description.");
    printUsage();
    process.exit(1);
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is not set.");
    process.exit(1);
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const prompt = buildGeneratePrompt(description, context);

  const response = await client.responses.create({
    model,
    input: [
      {
        role: "system",
        content:
          "You write executable Blender Python only. No markdown, no explanation.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const text = response.output_text || "";
  const code = stripCodeFences(text);

  if (!code) {
    throw new Error("Model returned empty output.");
  }

  return code;
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
