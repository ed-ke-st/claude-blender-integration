import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const DEFAULT_WATCH_FILE = join(tmpdir(), "blender_claude_execute.py");
export const RESULT_FILE = join(tmpdir(), "blender_result.json");

const WAIT_POLL_COUNT = 24;
const WAIT_POLL_MS = 250;

export function stripCodeFences(text) {
  const trimmed = typeof text === "string" ? text.trim() : "";
  if (trimmed.startsWith("```") && trimmed.endsWith("```")) {
    const lines = trimmed.split("\n");
    return lines.slice(1, -1).join("\n").trim();
  }
  return trimmed;
}

export function validateCreateCode(code) {
  const source = typeof code === "string" ? code : "";
  const errors = [];

  const checks = [
    {
      pattern: /inputs\[\s*(?:['"]Fac['"]|Fac)\s*\]/,
      message: "Use 'Factor' socket name instead of 'Fac'.",
    },
    {
      pattern: /inputs\[\s*(?:['"]Color1['"]|Color1)\s*\]/,
      message: "Use 'A' socket name instead of 'Color1'.",
    },
    {
      pattern: /inputs\[\s*(?:['"]Color2['"]|Color2)\s*\]/,
      message: "Use 'B' socket name instead of 'Color2'.",
    },
    {
      pattern: /inputs\[\s*(?:['"]Roughness\s+['"]|Roughness\s+)\s*\]/,
      message: "Use exact socket name 'Roughness' (no trailing space).",
    },
  ];

  for (const check of checks) {
    if (check.pattern.test(source)) {
      errors.push(check.message);
    }
  }

  if (
    /ShaderNodeBsdfPrincipled/.test(source) &&
    /inputs\[\s*(?:['"]Color['"]|Color)\s*\]/.test(source)
  ) {
    errors.push("Principled BSDF must use 'Base Color' instead of 'Color'.");
  }

  return errors;
}

export function stampCodeWithRequestId(code, requestId) {
  return `# MCP_REQUEST_ID:${requestId}\n${code}`;
}

export async function waitForFreshResult({
  watchFilePath = process.env.BLENDER_WATCH_FILE || DEFAULT_WATCH_FILE,
  requestId = "",
} = {}) {
  for (let i = 0; i < WAIT_POLL_COUNT; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, WAIT_POLL_MS));
    try {
      const data = await fs.readFile(RESULT_FILE, "utf8");
      const parsed = JSON.parse(data);
      if (requestId && parsed.request_id === requestId) {
        return data;
      }
      if (requestId) {
        continue;
      }
      const watchStat = await fs.stat(watchFilePath);
      if (parsed.timestamp >= watchStat.mtimeMs / 1000 - 1) {
        return data;
      }
    } catch {
      // Result file not ready yet.
    }
  }

  return null;
}

export async function readBlenderResult() {
  const resultText = await fs.readFile(RESULT_FILE, "utf8");
  let result = null;
  try {
    result = JSON.parse(resultText);
  } catch {
    result = null;
  }

  return { resultText, result };
}

export async function executeCreateInBlender({
  code,
  watchFilePath = process.env.BLENDER_WATCH_FILE || DEFAULT_WATCH_FILE,
} = {}) {
  const normalizedCode = stripCodeFences(code);
  if (!normalizedCode) {
    throw new Error("Blender code is required.");
  }

  const validationErrors = validateCreateCode(normalizedCode);
  if (validationErrors.length > 0) {
    const error = new Error(
      "create_in_blender blocked code due to static validation:\n- " +
        validationErrors.join("\n- ")
    );
    error.validationErrors = validationErrors;
    throw error;
  }

  const requestId = randomUUID();
  const stampedCode = stampCodeWithRequestId(normalizedCode, requestId);
  await fs.writeFile(watchFilePath, stampedCode, "utf8");

  const resultText = await waitForFreshResult({ watchFilePath, requestId });
  let result = null;
  if (resultText) {
    try {
      result = JSON.parse(resultText);
    } catch {
      result = null;
    }
  }

  return {
    requestId,
    watchFilePath,
    code: normalizedCode,
    stampedCode,
    pending: !resultText,
    resultText,
    result,
  };
}
