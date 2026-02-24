import fs from "node:fs/promises";
import { resolve } from "node:path";
import {
  DEFAULT_CHUNK_OVERLAP,
  DEFAULT_CHUNK_SIZE,
  DEFAULT_SOURCE_PATTERNS,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_KIND,
  STORE_SCHEMA_VERSION,
} from "./constants.js";
import { chunkText } from "./chunker.js";
import {
  buildIdfVector,
  buildNormalizedSparseVector,
  buildTermFrequencyMap,
} from "./embedder.js";
import { collectSourceFiles } from "./files.js";
import { getRepoRoot } from "./paths.js";
import { writeStore } from "./store.js";

export async function buildIndex({
  repoRoot,
  sourcePatterns = DEFAULT_SOURCE_PATTERNS,
  chunkSize = DEFAULT_CHUNK_SIZE,
  chunkOverlap = DEFAULT_CHUNK_OVERLAP,
  includeOptionalLocal = true,
} = {}) {
  const { files, missingPatterns } = await collectSourceFiles({
    repoRoot,
    sourcePatterns,
    includeOptionalLocal,
  });

  const chunkDrafts = [];
  const fileRecords = [];

  for (const relativePath of files) {
    const absPath = resolve(repoRoot, relativePath);
    const [content, stat] = await Promise.all([
      fs.readFile(absPath, "utf8"),
      fs.stat(absPath),
    ]);

    const chunks = chunkText(content, { chunkSize, chunkOverlap });
    let indexedChunkCount = 0;

    for (let i = 0; i < chunks.length; i += 1) {
      const chunk = chunks[i];
      const { frequencies, tokenCount } = buildTermFrequencyMap(
        chunk.text,
        EMBEDDING_DIMENSIONS
      );
      if (tokenCount === 0) {
        continue;
      }

      chunkDrafts.push({
        id: `${relativePath}#${i + 1}`,
        filePath: relativePath,
        chunkIndex: i,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        startOffset: chunk.startOffset,
        endOffset: chunk.endOffset,
        text: chunk.text,
        tokenCount,
        frequencies,
      });
      indexedChunkCount += 1;
    }

    fileRecords.push({
      path: relativePath,
      sizeBytes: stat.size,
      mtimeMs: stat.mtimeMs,
      chunkCount: indexedChunkCount,
    });
  }

  const idfVector = buildIdfVector(
    chunkDrafts.map((chunk) => chunk.frequencies),
    EMBEDDING_DIMENSIONS
  );

  const chunks = chunkDrafts.map((chunk) => ({
    id: chunk.id,
    file_path: chunk.filePath,
    chunk_index: chunk.chunkIndex,
    start_line: chunk.startLine,
    end_line: chunk.endLine,
    start_offset: chunk.startOffset,
    end_offset: chunk.endOffset,
    token_count: chunk.tokenCount,
    text: chunk.text,
    vector: buildNormalizedSparseVector(chunk.frequencies, idfVector),
  }));

  const payload = {
    schema_version: STORE_SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    repo_root: repoRoot,
    embedding: {
      kind: EMBEDDING_KIND,
      dimensions: EMBEDDING_DIMENSIONS,
    },
    source_patterns: sourcePatterns,
    files: fileRecords,
    idf_vector: idfVector.map((value) => Number(value.toFixed(8))),
    chunks,
  };

  return {
    payload,
    missingPatterns,
  };
}

export async function indexRepository({
  repoRoot = getRepoRoot(),
  sourcePatterns = DEFAULT_SOURCE_PATTERNS,
  chunkSize = DEFAULT_CHUNK_SIZE,
  chunkOverlap = DEFAULT_CHUNK_OVERLAP,
  storePath = "",
  includeOptionalLocal = true,
} = {}) {
  const { payload, missingPatterns } = await buildIndex({
    repoRoot,
    sourcePatterns,
    chunkSize,
    chunkOverlap,
    includeOptionalLocal,
  });

  const resolvedStorePath = await writeStore({
    repoRoot,
    storePath,
    payload,
  });

  return {
    payload,
    storePath: resolvedStorePath,
    missingPatterns,
  };
}
