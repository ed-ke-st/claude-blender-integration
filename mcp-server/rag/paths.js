import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAG_DIR = dirname(fileURLToPath(import.meta.url));

export function getRepoRoot() {
  return resolve(RAG_DIR, "..", "..");
}

export function resolveStorePath(repoRoot, explicitStorePath = "") {
  if (!explicitStorePath) return null;
  return resolve(repoRoot, explicitStorePath);
}
