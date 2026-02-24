import fs from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { getDefaultStorePath } from "./constants.js";

function pickStorePath(repoRoot, explicitStorePath = "") {
  if (explicitStorePath) {
    return resolve(repoRoot, explicitStorePath);
  }

  if (process.env.RAG_STORE_PATH) {
    return resolve(repoRoot, process.env.RAG_STORE_PATH);
  }

  return getDefaultStorePath(repoRoot);
}

export function resolveRagStorePath({ repoRoot, storePath = "" }) {
  return pickStorePath(repoRoot, storePath);
}

export async function writeStore({ repoRoot, storePath = "", payload }) {
  const resolved = pickStorePath(repoRoot, storePath);
  await fs.mkdir(dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return resolved;
}

export async function readStore({ repoRoot, storePath = "" }) {
  const resolved = pickStorePath(repoRoot, storePath);
  const raw = await fs.readFile(resolved, "utf8");
  return {
    storePath: resolved,
    payload: JSON.parse(raw),
  };
}
