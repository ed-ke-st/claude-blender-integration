import fs from "node:fs/promises";
import { basename, extname, relative, resolve } from "node:path";
import {
  DEFAULT_SOURCE_PATTERNS,
  OPTIONAL_SOURCE_PATHS,
  TEXT_EXTENSIONS,
} from "./constants.js";

const EXCLUDED_DIRS = new Set([".git", "node_modules", "dist", "build"]);
const KNOWN_TEXT_FILENAMES = new Set(["AGENTS.md", ".AGENTS.md", "LICENSE"]);

function toPosixPath(pathValue) {
  return pathValue.replace(/\\/g, "/");
}

function isTextLikeFile(relativePath) {
  const extension = extname(relativePath).toLowerCase();
  if (TEXT_EXTENSIONS.has(extension)) {
    return true;
  }
  return KNOWN_TEXT_FILENAMES.has(basename(relativePath));
}

async function pathExists(absPath) {
  try {
    await fs.access(absPath);
    return true;
  } catch {
    return false;
  }
}

async function walkDirectory(absDir, repoRoot, sink) {
  const entries = await fs.readdir(absDir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const absPath = resolve(absDir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) {
        continue;
      }
      await walkDirectory(absPath, repoRoot, sink);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const relPath = toPosixPath(relative(repoRoot, absPath));
    if (isTextLikeFile(relPath)) {
      sink.add(relPath);
    }
  }
}

export async function collectSourceFiles({
  repoRoot,
  sourcePatterns = DEFAULT_SOURCE_PATTERNS,
  includeOptionalLocal = true,
}) {
  const files = new Set();
  const missingPatterns = [];

  for (const pattern of sourcePatterns) {
    if (pattern.endsWith("/**")) {
      const dirRel = pattern.slice(0, -3).replace(/\/$/, "");
      const absDir = resolve(repoRoot, dirRel);
      if (!(await pathExists(absDir))) {
        missingPatterns.push(pattern);
        continue;
      }
      await walkDirectory(absDir, repoRoot, files);
      continue;
    }

    const absPath = resolve(repoRoot, pattern);
    if (!(await pathExists(absPath))) {
      missingPatterns.push(pattern);
      continue;
    }

    const relPath = toPosixPath(relative(repoRoot, absPath));
    files.add(relPath);
  }

  if (includeOptionalLocal) {
    for (const optionalPath of OPTIONAL_SOURCE_PATHS) {
      const absPath = resolve(repoRoot, optionalPath);
      if (!(await pathExists(absPath))) {
        continue;
      }
      const relPath = toPosixPath(relative(repoRoot, absPath));
      if (isTextLikeFile(relPath)) {
        files.add(relPath);
      }
    }
  }

  return {
    files: [...files].sort((a, b) => a.localeCompare(b)),
    missingPatterns,
  };
}
