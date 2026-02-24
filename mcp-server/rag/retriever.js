import { DEFAULT_TOP_K } from "./constants.js";
import {
  buildNormalizedSparseVector,
  buildTermFrequencyMap,
  dotSparseVectors,
} from "./embedder.js";
import { getRepoRoot } from "./paths.js";
import { readStore } from "./store.js";

function normalizeTopK(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_TOP_K;
  }
  return Math.max(1, Math.min(20, Math.floor(parsed)));
}

function compactSnippet(text, maxLength = 280) {
  const compact = (text || "").replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) {
    return compact;
  }
  return `${compact.slice(0, maxLength - 3)}...`;
}

function ensureStoreShape(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("RAG store payload is missing or invalid JSON.");
  }

  if (!Array.isArray(payload.idf_vector) || payload.idf_vector.length === 0) {
    throw new Error("RAG store is missing idf_vector. Re-run rag:index.");
  }

  if (!Array.isArray(payload.chunks) || payload.chunks.length === 0) {
    throw new Error("RAG store has no chunks. Re-run rag:index.");
  }
}

export async function retrieveContext({
  query,
  topK = DEFAULT_TOP_K,
  repoRoot = getRepoRoot(),
  storePath = "",
} = {}) {
  const normalizedQuery = (query || "").trim();
  if (!normalizedQuery) {
    throw new Error("Query text is required.");
  }

  const { payload, storePath: resolvedStorePath } = await readStore({
    repoRoot,
    storePath,
  });

  ensureStoreShape(payload);

  const topKValue = normalizeTopK(topK);
  const { frequencies } = buildTermFrequencyMap(
    normalizedQuery,
    payload.embedding?.dimensions || payload.idf_vector.length
  );
  const queryVector = buildNormalizedSparseVector(frequencies, payload.idf_vector);

  if (queryVector.length === 0) {
    return {
      query: normalizedQuery,
      top_k: topKValue,
      store_path: resolvedStorePath,
      indexed_at: payload.generated_at,
      total_chunks: payload.chunks.length,
      results: [],
    };
  }

  const ranked = [];
  for (const chunk of payload.chunks) {
    const score = dotSparseVectors(queryVector, chunk.vector || []);
    if (score <= 0) {
      continue;
    }

    ranked.push({
      score,
      id: chunk.id,
      file_path: chunk.file_path,
      start_line: chunk.start_line,
      end_line: chunk.end_line,
      text: chunk.text,
    });
  }

  ranked.sort((a, b) => b.score - a.score);
  const results = ranked.slice(0, topKValue).map((item) => ({
    score: Number(item.score.toFixed(6)),
    id: item.id,
    file_path: item.file_path,
    start_line: item.start_line,
    end_line: item.end_line,
    excerpt: compactSnippet(item.text),
    chunk_text: item.text,
  }));

  return {
    query: normalizedQuery,
    top_k: topKValue,
    store_path: resolvedStorePath,
    indexed_at: payload.generated_at,
    total_chunks: payload.chunks.length,
    results,
  };
}
