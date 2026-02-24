import { join } from "node:path";

export const STORE_SCHEMA_VERSION = 1;
export const EMBEDDING_KIND = "hashing_tfidf";
export const EMBEDDING_DIMENSIONS = 1024;
export const DEFAULT_CHUNK_SIZE = 1200;
export const DEFAULT_CHUNK_OVERLAP = 200;
export const DEFAULT_TOP_K = 5;

export const DEFAULT_SOURCE_PATTERNS = [
  "blender-addon/claude_modeling_tools.py",
  "README.md",
  "QUICKSTART.md",
  "EXAMPLES.md",
  "AGENTS.md",
  "mcp-server/index.js",
  "assistant-packs/**",
];

export const OPTIONAL_SOURCE_PATHS = [".AGENTS.md"];

export const TEXT_EXTENSIONS = new Set([
  ".md",
  ".txt",
  ".py",
  ".js",
  ".json",
  ".toml",
  ".yaml",
  ".yml",
  ".sh",
]);

export function getDefaultStorePath(repoRoot) {
  return join(repoRoot, ".rag", "vector-store.json");
}
