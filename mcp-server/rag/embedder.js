import { EMBEDDING_DIMENSIONS } from "./constants.js";

const TOKEN_PATTERN = /[A-Za-z0-9_]+/g;
const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "to",
  "was",
  "with",
]);

function hashToken(token, dimensions) {
  let hash = 2166136261;
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % dimensions;
}

export function tokenize(text) {
  const lower = (text || "").toLowerCase();
  const tokens = lower.match(TOKEN_PATTERN);
  if (!tokens) {
    return [];
  }

  return tokens.filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

export function buildTermFrequencyMap(text, dimensions = EMBEDDING_DIMENSIONS) {
  const tokens = tokenize(text);
  const frequencies = new Map();

  for (const token of tokens) {
    const index = hashToken(token, dimensions);
    frequencies.set(index, (frequencies.get(index) || 0) + 1);
  }

  return {
    frequencies,
    tokenCount: tokens.length,
  };
}

export function buildIdfVector(termFrequencyMaps, dimensions = EMBEDDING_DIMENSIONS) {
  const docCount = Math.max(1, termFrequencyMaps.length);
  const documentFrequency = new Array(dimensions).fill(0);

  for (const tf of termFrequencyMaps) {
    for (const index of tf.keys()) {
      documentFrequency[index] += 1;
    }
  }

  return documentFrequency.map((df) => Math.log((docCount + 1) / (df + 1)) + 1);
}

export function buildNormalizedSparseVector(termFrequencyMap, idfVector) {
  const weighted = [];
  let squaredNorm = 0;

  for (const [index, tf] of termFrequencyMap.entries()) {
    const idf = idfVector[index] || 1;
    const value = tf * idf;
    if (!value) continue;
    weighted.push([index, value]);
    squaredNorm += value * value;
  }

  if (weighted.length === 0 || squaredNorm === 0) {
    return [];
  }

  const norm = Math.sqrt(squaredNorm);
  weighted.sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < weighted.length; i += 1) {
    weighted[i][1] = Number((weighted[i][1] / norm).toFixed(8));
  }

  return weighted;
}

export function dotSparseVectors(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || b.length === 0) {
    return 0;
  }

  let i = 0;
  let j = 0;
  let dot = 0;

  while (i < a.length && j < b.length) {
    const [indexA, valueA] = a[i];
    const [indexB, valueB] = b[j];

    if (indexA === indexB) {
      dot += valueA * valueB;
      i += 1;
      j += 1;
      continue;
    }

    if (indexA < indexB) {
      i += 1;
    } else {
      j += 1;
    }
  }

  return dot;
}
